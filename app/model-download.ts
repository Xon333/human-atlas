/** Static hosts may serve .gz as a compressed response or as a gzip file.
 * Fetch already decodes Content-Encoding; inspect the payload to avoid decoding twice.
 * Cancellation also stops the local decompression stream, after fetch has finished.
 */
export async function decodeModelResponse(response:Response,expectedBytes:number,compressed:boolean,signal?:AbortSignal):Promise<ArrayBuffer>{
 signal?.throwIfAborted();
 if(!response.ok)throw new Error('An anatomy file could not be loaded.');
 const payload=await response.arrayBuffer();
 signal?.throwIfAborted();
 const signature=new Uint8Array(payload,0,Math.min(2,payload.byteLength));
 if(!(compressed&&signature[0]===0x1f&&signature[1]===0x8b)){
  if(payload.byteLength!==expectedBytes)throw new Error('An anatomy file was incomplete. Please reload the viewer.');
  return payload;
 }
 const reader=new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
 const cancel=()=>{void reader.cancel(signal?.reason).catch(()=>{});};
 const pieces:Uint8Array[]=[];let length=0;
 signal?.addEventListener('abort',cancel,{once:true});
 try{
  while(true){
   const {done,value}=await reader.read();signal?.throwIfAborted();if(done)break;
   length+=value.byteLength;
   if(length>expectedBytes)throw new Error('An anatomy file was incomplete. Please reload the viewer.');
   pieces.push(value);
  }
  if(length!==expectedBytes)throw new Error('An anatomy file was incomplete. Please reload the viewer.');
  const buffer=new ArrayBuffer(length),bytes=new Uint8Array(buffer);let offset=0;
  for(const piece of pieces){bytes.set(piece,offset);offset+=piece.byteLength;}
  return buffer;
 }finally{
  signal?.removeEventListener('abort',cancel);pieces.length=0;
  await reader.cancel().catch(()=>{});reader.releaseLock();
 }
}
/** A failed worker cancels its siblings before any further chunk can start. */
export async function loadModelChunks(count:number,load:(index:number)=>Promise<void>,controller:AbortController):Promise<void>{
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(3,count)},async()=>{
  try{
   while(cursor<count&&!controller.signal.aborted)await load(cursor++);
  }catch(error){controller.abort(error);throw error;}
 }));
 controller.signal.throwIfAborted();
}
