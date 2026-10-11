import assert from 'node:assert/strict';
import {test} from 'node:test';
import {gzipSync} from 'node:zlib';
import {decodeModelResponse,loadModelChunks} from '../app/model-download.ts';

const bytes=new Uint8Array([0,1,127,255,4,0,99,12]);
test('raw, gzip files, and already-decoded gzip responses preserve every byte',async()=>{
 for(const [payload,compressed] of [[bytes,false],[gzipSync(bytes),true],[bytes,true]]){
  assert.deepEqual(new Uint8Array(await decodeModelResponse(new Response(payload),bytes.length,compressed)),bytes);
 }
});
test('HTTP failure, truncated payload, and wrong decoded length reject',async()=>{
 await assert.rejects(decodeModelResponse(new Response(null,{status:404}),0,false),/could not be loaded/);
 for(const compressed of [false,true]){
  const payload=compressed?gzipSync(bytes):bytes;
  await assert.rejects(decodeModelResponse(new Response(payload),bytes.length+1,compressed),/incomplete/);
  await assert.rejects(decodeModelResponse(new Response(payload),bytes.length-1,compressed),/incomplete/);
 }
 await assert.rejects(decodeModelResponse(new Response(new Uint8Array([0x1f,0x8b,0])),bytes.length,true));
});
test('an aborted body never reaches decompression or geometry assembly',async()=>{
 const controller=new AbortController(),reason=new Error('region replaced');let read=false;
 controller.abort(reason);
 await assert.rejects(decodeModelResponse({ok:true,arrayBuffer(){read=true;}},8,true,controller.signal),error=>error===reason);
 assert.equal(read,false);
 const midRead=new AbortController();let finish;
 const response={ok:true,arrayBuffer:()=>new Promise(resolve=>{finish=resolve;})};
 const pending=decodeModelResponse(response,bytes.length,true,midRead.signal);
 midRead.abort(reason);finish(gzipSync(bytes).buffer);
 await assert.rejects(pending,error=>error===reason);
});
test('abort during local gzip decoding cancels the stream and preserves the abort reason',async t=>{
 const controller=new AbortController(),reason=new Error('decoder replaced');let canceled=false;
 // Stall only decompression; this deterministically exercises post-fetch cancellation.
 t.mock.method(Blob.prototype,'stream',()=>new ReadableStream({cancel(){canceled=true;}}));
 const pending=decodeModelResponse(new Response(gzipSync(bytes)),bytes.length,true,controller.signal);
 await new Promise(resolve=>setImmediate(resolve));controller.abort(reason);
 await assert.rejects(pending,error=>error===reason);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(canceled,true);
});
test('chunk loading caps concurrency at three and starts each chunk once',async()=>{
 const controller=new AbortController(),started=[],active=new Set();let maximum=0;
 await loadModelChunks(8,async index=>{
  started.push(index);active.add(index);maximum=Math.max(maximum,active.size);
  await new Promise(resolve=>setImmediate(resolve));active.delete(index);
 },controller);
 assert.deepEqual(started,[0,1,2,3,4,5,6,7]);assert.equal(maximum,3);assert.equal(controller.signal.aborted,false);
});
test('the first failure aborts sibling requests and never starts queued chunks',async()=>{
 const controller=new AbortController(),started=[],aborted=[],reason=new Error('incomplete chunk');let fail;
 const pending=loadModelChunks(6,index=>{
  started.push(index);
  if(index===0)return new Promise((_,reject)=>{fail=reject;});
  return new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>{aborted.push(index);reject(controller.signal.reason);},{once:true}));
 },controller);
 fail(reason);await assert.rejects(pending,error=>error===reason);
 assert.deepEqual(started,[0,1,2]);assert.deepEqual(aborted,[1,2]);assert.equal(controller.signal.reason,reason);
});
test('switching regions aborts in-flight work and does not report success',async()=>{
 const controller=new AbortController(),reason=new Error('unmounted'),finishes=[],started=[];
 const pending=loadModelChunks(4,index=>{started.push(index);return new Promise(resolve=>finishes.push(resolve));},controller);
 // Even downloads that ignore abort cannot start another chunk or report a ready scene.
 controller.abort(reason);for(const finish of finishes)finish();
 await assert.rejects(pending,error=>error===reason);assert.deepEqual(started,[0,1,2]);
});
