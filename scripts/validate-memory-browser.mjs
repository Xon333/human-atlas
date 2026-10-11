// Matched reference/candidate WebGL allocations. No native RSS/FPS claim or forced GC.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const args=process.argv.slice(2),at=args.indexOf('--atlas');
assert.ok(at>=0&&args[at+1],'--atlas requires an exact source checkout');
const root=path.resolve(args[at+1]),baseline=args.includes('--baseline');
const {createPrivateServer,runtimeConfig}=await import(pathToFileURL(path.join(root,'server/private-runtime.mjs')));
const {serializeAtlasLink,resolveAtlasLink}=await import(pathToFileURL(path.join(root,'app/course-navigation.ts')));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=path.resolve(process.env.ATLAS_TEST_OUTPUT||'.private-course/memory-browser');
await mkdir(output,{recursive:true});
const {server}=await createPrivateServer({...runtimeConfig(),host:'127.0.0.1',port:0,origin:null});
server.listen(0,'127.0.0.1');await once(server,'listening');
let browser;
const report={baseline,kind:'Actual WebGL buffer allocation and explicit deletion, not total memory',samples:[],errors:[]};
try {
 browser=await chromium.launch({headless:true,args:process.env.ATLAS_SOFTWARE_GL==='1'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{
  const contexts=new WeakMap(),buffers=new WeakMap(),textures=new WeakMap();let cid=0,bid=0,tid=0;
  const pending=window.__memoryFrames=new Set(),raf=requestAnimationFrame.bind(window),caf=cancelAnimationFrame.bind(window);
  window.requestAnimationFrame=fn=>{const id=raf(t=>{pending.delete(id);fn(t);});pending.add(id);return id;};
  window.cancelAnimationFrame=id=>{pending.delete(id);caf(id);};
  const records=new Map(),get=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(...args){
   const gl=get.apply(this,args);
   if(gl&&['webgl','webgl2','experimental-webgl'].includes(args[0])&&!contexts.has(gl)){
    const id=++cid;contexts.set(gl,id);this.dataset.memoryContextId=String(id);
    records.set(id,{buffers:new Map(),bindings:new Map(),textures:new Set()});
   }
   return gl;
  };
  for(const cls of [window.WebGLRenderingContext,window.WebGL2RenderingContext].filter(Boolean)){
   for(const name of ['createBuffer','bindBuffer','bufferData','deleteBuffer','createTexture','deleteTexture']){
    if(!Object.hasOwn(cls.prototype,name))continue;
    const original=cls.prototype[name];
    cls.prototype[name]=function(...args){
     const result=original.apply(this,args),record=records.get(contexts.get(this));
     if(!record)return result;
     if(name==='createBuffer'&&result){const id=++bid;buffers.set(result,id);record.buffers.set(id,0);}
     if(name==='bindBuffer')record.bindings.set(args[0],args[1]?buffers.get(args[1]):null);
     if(name==='bufferData'){
      const id=record.bindings.get(args[0]),src=args[1];
      if(id!==undefined&&id!==null){
       let bytes=typeof src==='number'?src:src?.byteLength||0;
       if(ArrayBuffer.isView(src)&&args.length>3){const width=src.BYTES_PER_ELEMENT||1,offset=args[3]||0;bytes=args[4]?args[4]*width:Math.max(0,src.byteLength-offset*width);}
       record.buffers.set(id,bytes);
      }
     }
     if(name==='deleteBuffer'&&args[0])record.buffers.delete(buffers.get(args[0]));
     if(name==='createTexture'&&result){const id=++tid;textures.set(result,id);record.textures.add(id);}
     if(name==='deleteTexture'&&args[0])record.textures.delete(textures.get(args[0]));
     return result;
    };
   }
  }
  window.__memorySample=()=>[...records].map(([id,r])=>({id,connected:!!document.querySelector(`canvas[data-memory-context-id="${id}"]`),bufferBytes:[...r.buffers.values()].reduce((a,b)=>a+b,0),buffers:r.buffers.size,textures:r.textures.size}));
 });
 const base=`http://127.0.0.1:${server.address().port}/`;
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
 const ready=async()=>{
  await page.locator('.scene canvas').waitFor({timeout:60000});
  await page.locator('.loading').waitFor({state:'hidden',timeout:60000});
  await page.waitForFunction(()=>window.__memoryFrames.size===0,null,{polling:100,timeout:30000});
 };
 await ready();
 const payload=await page.evaluate(()=>fetch('/api/course',{cache:'no-store'}).then(r=>r.json()));
 assert.ok(payload.course?.selections.length>=3,'A validated real course is required');
 const catalog=await page.evaluate(()=>fetch('/models/atlas.json').then(r=>r.json()));
 const navigate=async link=>{
  const hash=serializeAtlasLink(link);
  await page.evaluate(h=>{location.hash=h;},hash);
  await page.waitForFunction(h=>location.hash===h,hash);
  await page.waitForTimeout(100);
  await ready();
 };
 const sample=async label=>{
  const contexts=await page.evaluate(()=>window.__memorySample());
  const active=contexts.filter(c=>c.connected);
  assert.equal(active.length,1,'Exactly one displayed 3D context');
  assert.ok(active[0].bufferBytes>0,'Instrumentation must see real allocated geometry');
  if(!baseline)for(const c of contexts.filter(c=>!c.connected)){
   assert.equal(c.bufferBytes,0,'Replaced renderer retains uploaded buffer bytes');
   assert.equal(c.textures,0,'Replaced renderer retains textures');
  }
  const row={label,contexts,activeBytes:active[0].bufferBytes,activeId:active[0].id};
  report.samples.push(row);console.log('MEMORY',JSON.stringify(row));return row;
 };
 await navigate({mode:'explorer'});const full=await sample('full-explorer');
 for(let cycle=0;cycle<3;cycle++)for(const selection of payload.course.selections.slice(0,3)){
  const link={mode:'course',courseId:payload.course.courseId,selectionId:selection.id};
  await navigate(link);const before=await sample(`${cycle}:${selection.id}`);
  if(!baseline)assert.ok(before.activeBytes<full.activeBytes,'Region should allocate less uploaded geometry than the full explorer');
  const scope=resolveAtlasLink(link,catalog,payload.course).scopeElements;
  const target=scope.find(id=>selection.elements.includes(id));assert.ok(target,'A taught target must be visible');
  await navigate({...link,meshId:target});const selected=await sample(`${cycle}:${selection.id}:selected`);
  if(!baseline)assert.equal(selected.activeId,before.activeId,'Selecting a member must not replace the regional renderer');
 }
 await navigate({mode:'explorer'});const fullAgain=await sample('full-explorer-return');
 assert.equal(fullAgain.activeBytes,full.activeBytes,'Full explorer buffer allocation is repeatable');
 assert.deepEqual(report.errors,[]);
 report.status='passed';
} catch(error){report.status='failed';report.error=String(error);throw error;}
finally {
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
 await browser?.close();await new Promise(resolve=>server.close(resolve));
}
