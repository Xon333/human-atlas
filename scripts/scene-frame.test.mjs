import assert from 'node:assert/strict';
import test from 'node:test';
import {MathUtils,PerspectiveCamera} from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {GpuFrameGate,VisibleFrameClock,updateVisibleControls} from '../app/scene-frame.ts';

function context() {
  let serial=0;
  return {
    SYNC_GPU_COMMANDS_COMPLETE:0x9117, ALREADY_SIGNALED:0x911a,
    TIMEOUT_EXPIRED:0x911b, CONDITION_SATISFIED:0x911c, WAIT_FAILED:0x911d,
    status:0x911b, waits:[], deleted:[], fences:[], flushes:0,
    fenceSync(condition,flags){assert.equal(condition,this.SYNC_GPU_COMMANDS_COMPLETE);assert.equal(flags,0);const fence={id:++serial};this.fences.push(fence);return fence;},
    clientWaitSync(fence,flags,timeout){this.waits.push({fence,flags,timeout});return this.status;},
    deleteSync(fence){this.deleted.push(fence);},
    flush(){this.flushes++;},
  };
}

test('GPU work is coalesced behind one fence, with only nonblocking readiness checks',()=>{
  const gl=context(),gate=new GpuFrameGate(gl);
  assert.equal(gate.ready(),true);assert.equal(gl.waits.length,0);
  gate.submitted();gate.submitted();
  assert.equal(gl.fences.length,1);assert.equal(gl.flushes,1);
  for(let i=0;i<3;i++)assert.equal(gate.ready(),false);
  assert.ok(gl.waits.every(wait=>wait.flags===0&&wait.timeout===0));
  assert.equal(gl.deleted.length,0);
  gl.status=gl.CONDITION_SATISFIED;
  assert.equal(gate.ready(),true);assert.deepEqual(gl.deleted,gl.fences);
  gate.submitted();assert.equal(gl.fences.length,2);
  gl.status=gl.ALREADY_SIGNALED;
  assert.equal(gate.ready(),true);assert.deepEqual(gl.deleted,gl.fences);
  // No pending frame requires no further GL work; this helper schedules nothing.
  const waits=gl.waits.length;assert.equal(gate.ready(),true);assert.equal(gl.waits.length,waits);
  gate.dispose();gate.dispose();assert.equal(gl.deleted.length,2);
});

test('WebGL1, null fences and failed waits fall back without freezing future draws',()=>{
  const webgl1=new GpuFrameGate({});webgl1.submitted();assert.equal(webgl1.ready(),true);webgl1.dispose();
  for(const failure of ['null','failed','throws']){
    const gl=context(),gate=new GpuFrameGate(gl);
    if(failure==='null')gl.fenceSync=()=>null;
    if(failure==='throws')gl.clientWaitSync=()=>{throw new Error('Context lost');};
    gate.submitted();gl.status=gl.WAIT_FAILED;
    assert.equal(gate.ready(),true);
    const allocated=gl.fences.length;gate.submitted();
    assert.equal(gate.ready(),true);assert.equal(gl.fences.length,allocated);
    assert.deepEqual(gl.deleted,gl.fences);gate.dispose();
  }
});

test('disposal frees an in-flight fence once, including a lost context',()=>{
  const gl=context(),gate=new GpuFrameGate(gl);gate.submitted();
  gate.dispose();gate.dispose();assert.deepEqual(gl.deleted,gl.fences);
  const lost=context(),lostGate=new GpuFrameGate(lost);lostGate.submitted();
  lost.deleteSync=()=>{throw new Error('Context lost');};
  assert.doesNotThrow(()=>lostGate.dispose());assert.equal(lostGate.ready(),true);
});

test('fence setup failures release partial resources and preserve the rendering fallback',()=>{
  for(const failure of ['create','flush']){
    const gl=context(),gate=new GpuFrameGate(gl);
    if(failure==='create')gl.fenceSync=()=>{throw new Error('Fence unavailable');};
    else gl.flush=()=>{throw new Error('Context lost after fence creation');};
    assert.doesNotThrow(()=>gate.submitted());assert.equal(gate.ready(),true);
    assert.deepEqual(gl.deleted,gl.fences);
    const allocated=gl.fences.length;gate.submitted();assert.equal(gl.fences.length,allocated);
    gate.dispose();assert.deepEqual(gl.deleted,gl.fences);
  }
});

test('regular frames retain exponential animation while slow visible frames settle by elapsed time',()=>{
  const clock=new VisibleFrameClock();let amount=1;
  for(let i=0;i<60;i++)amount=MathUtils.damp(amount,0,8,clock.tick(1000+i*1000/60));
  assert.ok(Math.abs(amount-Math.exp(-8))<1e-12);
  clock.reset();amount=1;
  for(const time of [5000,6000,7000])amount=MathUtils.damp(amount,0,8,clock.tick(time));
  assert.ok(amount<.0001,'Two slow GPU frames must not replay dozens of stale interpolation frames');
});

test('idle, hidden and offscreen resets exclude inactive wall time from the resumed animation',()=>{
  const clock=new VisibleFrameClock();
  clock.tick(1000);assert.equal(clock.tick(1250),.25);
  for(const time of [60_000,3_600_000,86_400_000]){
    clock.reset();assert.equal(clock.tick(time),1/60);
    assert.ok(Math.abs(clock.tick(time+1000/60)-1/60)<1e-10);
  }
});

// Real pinned OrbitControls needs only an event surface for these camera tests;
// no WebGL context, browser, renderer or substituted damping implementation.
function orbit(t) {
  class Surface extends EventTarget {
    style={};clientWidth=1440;clientHeight=1000;
    setPointerCapture(){} releasePointerCapture(){}
    getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth,height:this.clientHeight};}
  }
  const surface=new Surface(),camera=new PerspectiveCamera(34,1.44,.005,100);
  camera.position.set(1.4,1.05,3.6);
  const controls=new OrbitControls(camera,surface);
  controls.target.set(0,.85,0);controls.enableDamping=true;controls.dampingFactor=.085;controls.autoRotateSpeed=.65;
  controls.update();camera.updateMatrixWorld();t.after(()=>controls.dispose());
  const event=(type,values={})=>surface.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{pointerId:1,pointerType:'mouse',button:0,clientX:780,clientY:440,pageX:780,pageY:440,...values}));
  const drag=(button=0,pointerType='mouse')=>{
    event('pointerdown',{button,pointerType});
    for(let i=1;i<=8;i++)event('pointermove',{button,pointerType,clientX:780+i*10,clientY:440+i*3.75,pageX:780+i*10,pageY:440+i*3.75});
    event('pointerup',{button,pointerType,clientX:860,clientY:470,pageX:860,pageY:470});
  };
  return {camera,controls,event,drag};
}

function sameCamera(actual,expected,message) {
  assert.ok(actual.camera.position.distanceTo(expected.camera.position)<1e-10,`${message}: position`);
  assert.ok(actual.controls.target.distanceTo(expected.controls.target)<1e-10,`${message}: target`);
  assert.ok(1-Math.abs(actual.camera.quaternion.dot(expected.camera.quaternion))<1e-12,`${message}: orientation`);
}

test('actual orbit and pan coasting preserve the 60 Hz path across visible frame intervals',t=>{
  for(const button of [0,2]){
    const reference=orbit(t);reference.drag(button);
    for(let i=0;i<60;i++)reference.controls.update(1/60);
    for(const intervals of [Array(60).fill(1/60),Array(120).fill(1/120),Array(30).fill(1/30),[.12,.08,.2,.4,.2]]){
      const candidate=orbit(t);candidate.drag(button);
      for(const seconds of intervals)updateVisibleControls(candidate.controls,seconds);
      sameCamera(candidate,reference,`Button ${button}, ${intervals.length} visible frames`);
      assert.equal(candidate.controls.dampingFactor,.085);
    }
  }
});

test('released orbit and pan settle by visible time when each GPU frame takes 1.1 seconds',t=>{
  for(const button of [0,2]){
    const candidate=orbit(t);candidate.drag(button);
    let moving=true,frames=0;
    while(moving&&frames<12){moving=updateVisibleControls(candidate.controls,1.1);frames++;}
    assert.equal(moving,false,`Button ${button} must reach the actual OrbitControls idle return`);
    assert.ok(frames*1.1<10,`Button ${button} must coast to rest without dozens of slow GPU frames`);
  }
  const previous=orbit(t);previous.drag();
  let stillMoving=false;
  for(let i=0;i<28;i++)stillMoving=previous.controls.update(1.1);
  assert.equal(stillMoving,true,'The original per-call damping reproduces the >30s slow-frame coast');
});

test('timed damping is restored before real pointer, touch, wheel and camera-fit updates',t=>{
  const fixture=orbit(t),seen=[],original=fixture.controls.update;
  fixture.controls.update=function(...args){seen.push({damping:this.dampingFactor,args});return original.apply(this,args);};
  updateVisibleControls(fixture.controls,1.1);
  assert.ok(seen[0].damping>.99);assert.deepEqual(seen[0].args,[1.1]);
  assert.equal(fixture.controls.dampingFactor,.085);
  seen.length=0;fixture.drag();fixture.drag(0,'touch');fixture.event('wheel',{deltaY:-180});fixture.controls.update();
  assert.ok(seen.length>=18);
  assert.ok(seen.every(call=>call.damping===.085&&call.args.length===0),'Synchronous input must keep its original damping factor');
  const throwing={dampingFactor:.085,update(){throw new Error('Update failed');}};
  assert.throws(()=>updateVisibleControls(throwing,1.1),/Update failed/);
  assert.equal(throwing.dampingFactor,.085,'Even a failed update must not alter later input');
});

test('actual autorotation preserves its configured steady rate with slow visible frames',t=>{
  for(const intervals of [Array(660).fill(1/60),Array(330).fill(1/30),Array(10).fill(1.1)]){
    const {controls}=orbit(t);controls.autoRotate=true;
    // Autorotation is damped on startup in the pinned control. Compare its steady
    // rate after the same 11 visible seconds, without changing autoRotateSpeed.
    for(const seconds of intervals)updateVisibleControls(controls,seconds);
    const start=controls.getAzimuthalAngle();
    for(const seconds of intervals)updateVisibleControls(controls,seconds);
    const angle=start-controls.getAzimuthalAngle();
    assert.ok(Math.abs(angle-(2*Math.PI/60*.65*11))<1e-10);
    assert.equal(controls.autoRotateSpeed,.65);assert.equal(controls.dampingFactor,.085);
  }
});

test('hidden-time resets do not advance real autorotation or change its resumed damping',t=>{
  const reference=orbit(t),candidate=orbit(t),clock=new VisibleFrameClock();
  reference.controls.autoRotate=candidate.controls.autoRotate=true;
  for(const time of [1000,60_000,3_600_000]){
    clock.reset();updateVisibleControls(candidate.controls,clock.tick(time));
    reference.controls.update(1/60);
    sameCamera(candidate,reference,'Only the resumed visible frame may advance autorotation');
    assert.equal(candidate.controls.dampingFactor,.085);
  }
});
