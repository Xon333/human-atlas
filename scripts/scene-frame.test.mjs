import assert from 'node:assert/strict';
import test from 'node:test';
import {MathUtils} from 'three';
import {GpuFrameGate,VisibleFrameClock} from '../app/scene-frame.ts';

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
