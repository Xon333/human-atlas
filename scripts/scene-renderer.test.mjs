// Exercise the actual component effects and Three geometry with a fake GPU/DOM.
// The integration owner verifies real WebGL deletion and visual contrast in preview.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import * as Three from 'three';
import * as geometry from '../app/model-geometry.ts';
import * as frame from '../app/scene-frame.ts';
import * as download from '../app/model-download.ts';
import * as layout from '../app/explosion-layout.ts';
import * as pointer from '../app/pointer-tap.ts';
import * as anatomy from '../app/anatomy.ts';
import * as views from '../app/camera-views.ts';
import * as scope from '../app/scene-scope.ts';

class Element extends EventTarget {
 dataset={};style={};children=[];clientWidth=1280;clientHeight=800;hidden=false;attributes={};
 appendChild(child){this.children.push(child);child.parent=this;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
 setAttribute(name,value){this.attributes[name]=value;}
 getBoundingClientRect(){return {left:0,top:0,right:this.clientWidth,bottom:this.clientHeight,width:this.clientWidth,height:this.clientHeight};}
 closest(){return null;}
}
function compile(file,modules){
 const {outputText}=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}});
 const exports={};new Function('require','exports',outputText)(name=>{assert.ok(name in modules,`Unexpected import ${name}`);return modules[name];},exports);return exports.default;
}
function hooks(host){
 const slots=[];let cursor=0,pending=[];
 const same=(a,b)=>a?.length===b?.length&&a.every((value,index)=>Object.is(value,b[index]));
 return {
  react:{
   useRef(value){const index=cursor++;return slots[index]??= {current:value};},
   useMemo(make,deps){const index=cursor++;if(!slots[index]||!same(slots[index].deps,deps))slots[index]={deps,value:make()};return slots[index].value;},
   useEffect(effect,deps){const index=cursor++;if(!slots[index]||!same(slots[index].deps,deps))pending.push(()=>{slots[index]?.cleanup?.();slots[index]={deps,cleanup:effect()};});},
  },
  jsx:{jsx(type,props){if(props.ref)props.ref.current=host;return {type,props};}},
  render(component,props){cursor=0;const element=component(props);for(const effect of pending)effect();pending=[];return element;},
  unmount(){for(const slot of slots)slot?.cleanup?.();},
 };
}
function fixture(count=1){
 const buffer=new ArrayBuffer(68);
 new Float32Array(buffer,0,9).set([-.5,.5,0,.5,.5,0,0,1.5,0]);
 new Int16Array(buffer,36,9).set([0,0,32767,0,0,32767,0,0,32767]);
 new Uint32Array(buffer,56,3).set([0,1,2]);
 const parts=Array.from({length:count},(_,chunk)=>({id:`part-${chunk}`,name:`Part ${chunk}`,conceptId:`concept-${chunk}`,system:'skeletal',chunk,positions:0,normals:36,indices:56,vertexCount:3,indexCount:3,bounds:[[-.5,.5,0],[.5,1.5,0]]}));
 return {buffer,atlas:{version:'test',parts,concepts:[],triangles:count,chunks:parts.map((_,index)=>({url:`/${index}`,bytes:68}))}};
}
const initial={visible:['skeletal'],selected:[],explode:0,rotate:false,isolate:false,view:'front',reset:0};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(t,fetcher){
 const host=new Element(),document=new Element();document.hidden=false;document.createElement=()=>new Element();document.querySelector=()=>null;
 const owners=[],controls=[],observers=[],frames=new Map(),requests=[],geometryOwners=[];let serial=0;
 class BufferGeometry extends Three.BufferGeometry {constructor(){super();geometryOwners.push(this);}}
 class Renderer {
  domElement=new Element();disposed=0;lost=0;renders=0;
  constructor(options){this.options=options;owners.push(this);}
  getContext(){return {};}
  setPixelRatio(){}setClearColor(){}setSize(){}
  render(scene,camera){this.scene=scene;this.camera=camera;this.renders++;}
  dispose(){this.disposed++;}forceContextLoss(){this.lost++;}
 }
 class Controls extends Three.EventDispatcher {
  target=new Three.Vector3();mouseButtons={};touches={};disposed=0;
  constructor(camera){super();this.camera=camera;controls.push(this);}
  update(){this.camera.lookAt(this.target);return false;}dispose(){this.disposed++;}
 }
 class Observer {constructor(callback){this.callback=callback;this.disconnected=false;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
 class PMREM {fromScene(){const env=new Three.WebGLRenderTarget(1,1);owners.at(-1).env=env;return env;}dispose(){}}
 class Room {dispose(){}}
 t.after(()=>hook.unmount());
 for(const [name,value] of Object.entries({document,devicePixelRatio:1,innerWidth:1280,ResizeObserver:Observer,IntersectionObserver:Observer,requestAnimationFrame:callback=>{const id=++serial;frames.set(id,callback);return id;},cancelAnimationFrame:id=>frames.delete(id),fetch:(url,options)=>{requests.push({url,signal:options.signal});return fetcher(url,options);}})){
  const old=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});t.after(()=>{if(old)Object.defineProperty(globalThis,name,old);else delete globalThis[name];});
 }
 const hook=hooks(host),component=compile('../app/scene-renderer.tsx',{'react':hook.react,'react/jsx-runtime':hook.jsx,three:{...Three,BufferGeometry,WebGLRenderer:Renderer,PMREMGenerator:PMREM},'three/examples/jsm/controls/OrbitControls.js':{OrbitControls:Controls},'three/examples/jsm/environments/RoomEnvironment.js':{RoomEnvironment:Room},'./model-geometry':geometry,'./scene-frame':frame,'./model-download':download,'./explosion-layout':layout,'./pointer-tap':pointer,'./anatomy':anatomy,'./camera-views':views});
 const errors=[],progress=[],selections=[];
 const props={onSelect:id=>selections.push(id),onError:error=>errors.push(error),onProgress:value=>progress.push(value)};
 return {host,owners,controls,observers,frames,requests,geometryOwners,errors,progress,selections,
  mount(atlas,state=initial,callbacks={}){hook.render(component,{...props,...callbacks,atlas,state});},
  unmount:()=>hook.unmount(),
  frame(){const queued=[...frames];frames.clear();for(const [,callback] of queued)callback(1000);},
 };

}

test('same-region selections reuse renderer, picker buffers and camera; context remains intact',async t=>{
 const {atlas,buffer}=fixture(2),h=harness(t,()=>Promise.resolve(new Response(buffer)));t.after(h.unmount);
 const state={...initial,scope:atlas.parts.map(part=>part.id)};
 h.mount(atlas,state);await settle();h.frame();
 assert.equal(h.host.dataset.loadState,'ready');assert.equal(h.host.dataset.geometryParts,'2');assert.equal(h.host.dataset.geometryChunks,'2');
 assert.equal(h.host.dataset.visibleParts,'2');assert.equal(h.host.dataset.highlightedParts,'0');
 const owner=h.host.dataset.sceneOwner,renderer=h.owners[0],camera=renderer.camera.position.clone(),batches=renderer.scene.children.filter(child=>child.isMesh),positions=batches.map(mesh=>mesh.geometry.attributes.position);
 assert.equal(renderer.options.powerPreference,undefined);
 const calls=h.requests.length;
 h.mount(atlas,{...state,selected:['part-1']});h.frame();
 assert.equal(h.host.dataset.sceneOwner,owner);assert.equal(h.owners.length,1);assert.equal(h.requests.length,calls);assert.equal(h.host.dataset.highlightedParts,'1');assert.equal(h.host.dataset.visibleParts,'2');
 assert.ok(renderer.camera.position.equals(camera));assert.deepEqual(batches.map(mesh=>mesh.geometry.attributes.position),positions);
 const material=batches.find(mesh=>mesh.geometry.getAttribute('partIndex')).material,shader={uniforms:{},vertexShader:Three.ShaderLib.standard.vertexShader,fragmentShader:Three.ShaderLib.standard.fragmentShader};
 material.onBeforeCompile(shader,renderer);assert.equal(shader.uniforms.selectionActive.value,1);assert.ok(shader.uniforms.selectionAccent.value.b>shader.uniforms.selectionAccent.value.r);assert.ok(shader.uniforms.selectionAccent.value.g>shader.uniforms.selectionAccent.value.r);
 h.mount(atlas,{...state,selected:[]});h.frame();assert.equal(shader.uniforms.selectionActive.value,0);assert.equal(h.host.dataset.visibleParts,'2');assert.equal(h.host.dataset.highlightedParts,'0');
 // Context-only views deliberately carry no target tint; manual and automatic rotation remain available.
 h.mount(atlas,{...state,context:state.scope,selected:['part-1'],rotate:true});h.frame();
 assert.equal(h.host.dataset.highlightedParts,'0');assert.equal(h.controls[0].enableRotate,true);assert.equal(h.controls[0].autoRotate,true);
});
test('successful merging releases source buffers and cleanup detaches every geometry and texture owner',async t=>{
 const {atlas,buffer}=fixture(2),h=harness(t,()=>Promise.resolve({ok:true,arrayBuffer:async()=>buffer}));
 h.mount(atlas,{...initial,scope:atlas.parts.map(part=>part.id)});await settle();h.frame();
 const renderer=h.owners[0],scene=renderer.scene,geometries=[...new Set([...h.geometryOwners,...scene.children.filter(child=>child.geometry).map(child=>child.geometry)])],materials=scene.children.filter(child=>child.material).map(child=>child.material),textures=[];
 for(const material of materials){const shader={uniforms:{},vertexShader:Three.ShaderLib.standard.vertexShader,fragmentShader:Three.ShaderLib.standard.fragmentShader};material.onBeforeCompile(shader,renderer);for(const uniform of Object.values(shader.uniforms))if(uniform.value?.isDataTexture)textures.push(uniform.value);}
 for(const g of geometries){if(g.index)assert.notEqual(g.index.array.buffer,buffer);for(const attr of Object.values(g.attributes))assert.notEqual(attr.array.buffer,buffer);}
 const disposed=new Map();for(const resource of new Set([...geometries,...materials,...textures,renderer.env]))resource.addEventListener('dispose',()=>disposed.set(resource,(disposed.get(resource)??0)+1));
 h.unmount();h.unmount();
 assert.equal(renderer.disposed,1);assert.equal(renderer.lost,1);assert.equal(h.controls[0].disposed,1);assert.equal(h.frames.size,0);assert.equal(hostCanvas(h),undefined);assert.ok(h.observers.every(observer=>observer.disconnected));
 assert.equal(scene.children.length,0);assert.equal(scene.environment,null);assert.ok(h.requests.every(request=>request.signal.aborted));
 for(const g of geometries){assert.equal(g.index,null);assert.deepEqual(g.attributes,{});assert.equal(disposed.get(g),1);}
 for(const texture of new Set(textures)){assert.equal(texture.source.data,null);assert.equal(disposed.get(texture),1);}
 for(const material of materials)assert.equal(disposed.get(material),1);
 assert.equal(h.host.dataset.loadState,'disposed');assert.equal(h.host.dataset.pickerOwners,'0');assert.equal(h.host.dataset.renderBatches,'0');
});
const hostCanvas=h=>h.host.children.find(child=>child.attributes['aria-label']);
test('a failed chunk releases partially loaded anatomy, aborts siblings and blocks late completion',async t=>{
 const {atlas,buffer}=fixture(4),completions=new Map();
 const h=harness(t,url=>new Promise(resolve=>completions.set(url,resolve)));t.after(h.unmount);
 h.mount(atlas);completions.get('/0')(new Response(buffer));await settle();h.frame();
 assert.equal(h.host.dataset.loadedChunks,'1');assert.equal(h.host.dataset.pickerOwners,'1');
 // Worker 0 has now started the fourth chunk, while the original siblings are still pending.
 completions.get('/1')(new Response(null,{status:503}));await settle();
 assert.equal(h.host.dataset.loadState,'error');assert.deepEqual(h.errors,['An anatomy file could not be loaded.']);assert.equal(h.host.dataset.pickerOwners,'0');assert.equal(h.host.dataset.renderBatches,'0');
 assert.ok(h.requests.every(request=>request.signal.aborted));assert.equal(h.owners[0].disposed,1);assert.equal(h.frames.size,0);assert.equal(hostCanvas(h),undefined);
 const progress=[...h.progress];for(const url of ['/2','/3'])completions.get(url)(new Response(buffer));await settle();
 assert.deepEqual(h.progress,progress);assert.equal(h.host.dataset.loadState,'error');assert.equal(h.host.dataset.pickerOwners,'0');assert.equal(h.errors.length,1);
});
test('a malformed descriptor releases geometry created before the load failed',async t=>{
 const {atlas,buffer}=fixture();atlas.parts[0].normals=500;
 const h=harness(t,()=>Promise.resolve(new Response(buffer)));t.after(h.unmount);h.mount(atlas);await settle();
 assert.equal(h.host.dataset.loadState,'error');assert.equal(h.owners[0].disposed,1);assert.equal(h.errors.length,1);assert.equal(h.host.dataset.pickerOwners,'0');assert.equal(h.frames.size,0);
});
test('switching atlas owners aborts previous downloads and ignores late old progress',async t=>{
 const first=fixture(),second=fixture();second.atlas.chunks[0].url='/next';const completions=new Map();
 const h=harness(t,url=>new Promise(resolve=>completions.set(url,resolve)));t.after(h.unmount);
 h.mount(first.atlas);const owner=h.host.dataset.sceneOwner,signal=h.requests[0].signal;
 h.mount(second.atlas);assert.notEqual(h.host.dataset.sceneOwner,owner);assert.equal(signal.aborted,true);assert.equal(h.owners[0].disposed,1);
 completions.get('/0')(new Response(first.buffer));await settle();assert.deepEqual(h.progress,[]);assert.equal(h.host.dataset.loadState,'loading');
 completions.get('/next')(new Response(second.buffer));await settle();h.frame();assert.deepEqual(h.progress,[100]);assert.equal(h.host.dataset.loadState,'ready');assert.deepEqual(h.errors,[]);
});
test('context loss immediately releases owners and keeps its message after delayed loads',async t=>{
 const {atlas,buffer}=fixture();let finish;
 const h=harness(t,()=>new Promise(resolve=>{finish=resolve;}));t.after(h.unmount);h.mount(atlas);
 const event=new Event('webglcontextlost',{cancelable:true});hostCanvas(h).dispatchEvent(event);
 assert.equal(event.defaultPrevented,true);assert.equal(h.host.dataset.loadState,'context-lost');assert.equal(h.owners[0].disposed,1);assert.equal(h.requests[0].signal.aborted,true);assert.equal(h.frames.size,0);
 finish(new Response(buffer));await settle();assert.deepEqual(h.progress,[]);assert.equal(h.errors.length,1);assert.match(h.errors[0],/paused.*Reload/);assert.equal(h.host.dataset.loadState,'context-lost');
});
test('projection wrapper returns the same atlas instance for ordinary same-region selections',()=>{
 const {atlas}=fixture(3),host=new Element(),hook=hooks(host),stub=()=>null;
 const component=compile('../app/scene.tsx',{'react':hook.react,'react/jsx-runtime':hook.jsx,'./scene-renderer':{default:stub,__esModule:true},'./scene-scope':scope});
 const props={atlas,state:{...initial,scope:['part-0','part-1']},onProgress:()=>{}};
 const first=hook.render(component,props),second=hook.render(component,{...props,state:{...props.state,selected:['part-1']}});
 assert.equal(second.props.atlas,first.props.atlas);assert.equal(second.props.atlas.parts.length,2);
});

test('chunk progress does not draw partial assemblies before the requested geometry is ready',async t=>{
 const {atlas,buffer}=fixture(2),completions=new Map();
 const h=harness(t,url=>new Promise(resolve=>completions.set(url,resolve)));t.after(h.unmount);
 h.mount(atlas);completions.get('/0')(new Response(buffer));await settle();h.frame();
 assert.deepEqual(h.progress,[50]);assert.equal(h.host.dataset.loadState,'loading');
 assert.equal(h.owners[0].renders,0);assert.equal(h.frames.size,0);
 completions.get('/1')(new Response(buffer));await settle();h.frame();
 assert.deepEqual(h.progress,[50,100]);assert.equal(h.host.dataset.loadState,'ready');
 assert.equal(h.owners[0].renders,1);assert.equal(h.host.dataset.visibleParts,'2');
});

for (const view of ['right-side','side','superior','inferior']) test(`${view} camera keeps a finite regional fit and reuses the scene`,async t=>{
 const {atlas,buffer}=fixture(2),h=harness(t,async()=>new Response(buffer));t.after(h.unmount);
 const state={...initial,scope:['part-0','part-1']};
 h.mount(atlas,state);await settle();h.frame();
 h.mount(atlas,{...state,view});h.frame();
 const camera=h.owners[0].camera,offset=camera.position.clone().sub(h.controls[0].target).normalize();
 const axis=view==='right-side'?[-1,0,0]:view==='side'?[1,0,0]:view==='superior'?[0,1,0]:[0,-1,0];
 assert.ok(offset.dot(new Three.Vector3(...axis))>.99999);
 assert.ok(camera.projectionMatrix.elements.every(Number.isFinite));
 assert.equal(h.owners.length,1);assert.equal(h.requests.length,2);
});
test('highlight colour changes preserve the assembly, camera and renderer',async t=>{
 const {atlas,buffer}=fixture(2),h=harness(t,async()=>new Response(buffer));t.after(h.unmount);
 const state={...initial,scope:['part-0','part-1'],selected:['part-0']};
 h.mount(atlas,state);await settle();h.frame();
 const position=h.owners[0].camera.position.clone();
 let material;h.owners[0].scene.traverse(o=>{if(o.geometry?.getAttribute('partIndex')) material=o.material;});
 const shader={uniforms:{},vertexShader:'',fragmentShader:''};material.onBeforeCompile(shader);
 for(const highlight of ['magenta','lime','cyan']){
  h.mount(atlas,{...state,highlight});h.frame();
  assert.ok(shader.uniforms.selectionDisplayAccent.value.equals(new Three.Color(anatomy.HIGHLIGHTS[highlight]).convertLinearToSRGB()));
  assert.ok(position.equals(h.owners[0].camera.position));
  assert.equal(h.host.dataset.highlightedParts,'1');assert.equal(h.host.dataset.visibleParts,'2');
 }
 assert.equal(h.owners.length,1);assert.equal(h.requests.length,2);
});
