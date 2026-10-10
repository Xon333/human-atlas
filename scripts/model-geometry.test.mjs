import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {mergePickerGeometries} from '../app/model-geometry.ts';

function triangle(z,id){
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.BufferAttribute(new Float32Array([-.5,-.5,z,.5,-.5,z,0,.5,z]),3));
  geometry.setAttribute('normal',new T.BufferAttribute(new Int16Array([0,0,32767,0,0,32767,0,0,32767]),3,true));
  geometry.setAttribute('partIndex',new T.BufferAttribute(new Float32Array(3).fill(id),1));
  geometry.setIndex(new T.BufferAttribute(new Uint32Array([0,1,2]),1));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

test('shared picker arrays preserve bounded raycasts at nonzero index offsets and exploded translations',()=>{
  // Overlapping XY bounds make an incorrect full-batch drawRange hit another part.
  const pickers=[triangle(0,4),triangle(.3,8),triangle(.6,12)];
  const originals=pickers.map(geometry=>geometry.clone());
  const boxes=pickers.map(geometry=>geometry.boundingBox),spheres=pickers.map(geometry=>geometry.boundingSphere);
  const merged=mergePickerGeometries(pickers),material=new T.MeshBasicMaterial();
  let hits=0;
  for(let i=0;i<pickers.length;i++){
    const geometry=pickers[i];
    assert.equal(geometry.boundingBox,boxes[i]);assert.equal(geometry.boundingSphere,spheres[i]);
    assert.equal(geometry.attributes.position,merged.attributes.position);
    assert.equal(geometry.attributes.normal,merged.attributes.normal);
    assert.equal(geometry.index,merged.index);assert.equal(geometry.attributes.partIndex,undefined);
    assert.deepEqual(geometry.drawRange,{start:i*3,count:3});
    for(const translation of [new T.Vector3(),new T.Vector3(i*.7,.2,-.4)]){
      const before=new T.Mesh(originals[i],material),after=new T.Mesh(geometry,material);
      before.position.copy(translation);after.position.copy(translation);
      before.updateMatrixWorld(true);after.updateMatrixWorld(true);
      for(const origin of [new T.Vector3(0,0,3),new T.Vector3(.2,.1,3),new T.Vector3(0,0,-3)]){
        const target=new T.Vector3(0,0,i*.3).add(translation);
        const worldOrigin=origin.clone().add(translation),raycaster=new T.Raycaster(worldOrigin,target.clone().sub(worldOrigin).normalize());
        const expected=raycaster.intersectObject(before,false),actual=raycaster.intersectObject(after,false);
        assert.equal(actual.length,expected.length,`part ${i}, translation ${translation.toArray()}, origin ${origin.toArray()}`);
        for(let j=0;j<expected.length;j++){
          hits++;assert.ok(Math.abs(actual[j].distance-expected[j].distance)<1e-10);
          assert.ok(actual[j].point.distanceTo(expected[j].point)<1e-10);
          assert.ok(actual[j].normal.distanceTo(expected[j].normal)<1e-10);
        }
      }
    }
  }
  assert.equal(hits,12,'Front-side picking stays enabled and back-side picking stays disabled.');
  for(const geometry of [...originals,...pickers,merged])geometry.dispose();material.dispose();
});

function buffersFor(geometries){
  const buffers=new Set();
  for(const geometry of geometries){
    if(geometry.index)buffers.add(geometry.index.array.buffer);
    for(const attribute of Object.values(geometry.attributes))buffers.add(attribute.array.buffer);
  }
  return buffers;
}
const bufferBytes=buffers=>[...buffers].reduce((sum,buffer)=>sum+buffer.byteLength,0);

test('all catalogue geometry remains exact while picker copies release their original array buffers',async t=>{
  const atlas=JSON.parse(await readFile(new URL('../public/models/atlas.json',import.meta.url)));
  let discardedBytes=0,renderBytes=0,parts=0,batches=0;
  for(let ci=0;ci<atlas.chunks.length;ci++){
    const chunk=atlas.chunks[ci],file=await readFile(new URL(`../public${chunk.url}`,import.meta.url));
    // Match fetch's independent ArrayBuffer, avoiding Node Buffer slab allocations.
    const buffer=file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),groups=new Map(),originalBuffers=new Set();
    atlas.parts.forEach((part,i)=>{
      if(part.chunk!==ci)return;
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(buffer,part.positions,part.vertexCount*3),3));
      geometry.setAttribute('normal',new T.BufferAttribute(new Int16Array(buffer,part.normals,part.vertexCount*3),3,true));
      geometry.setAttribute('partIndex',new T.BufferAttribute(new Float32Array(part.vertexCount).fill(i),1));
      geometry.setIndex(new T.BufferAttribute(new Uint32Array(buffer,part.indices,part.indexCount),1));
      geometry.boundingBox=new T.Box3(new T.Vector3().fromArray(part.bounds[0]),new T.Vector3().fromArray(part.bounds[1]));
      geometry.computeBoundingSphere();
      const list=groups.get(part.system)??[];list.push({geometry,part,index:i});groups.set(part.system,list);
      for(const value of buffersFor([geometry]))originalBuffers.add(value);
    });
    for(const group of groups.values()){
      const pickers=group.map(item=>item.geometry),bounds=pickers.map(geometry=>[geometry.boundingBox,geometry.boundingSphere]);
      const merged=mergePickerGeometries(pickers),retained=buffersFor([...pickers,merged]);
      assert.deepEqual(retained,buffersFor([merged]),'Pickers must only retain renderer-owned array buffers.');
      assert.ok([...retained].every(value=>!originalBuffers.has(value)),'No original chunk or per-part partIndex buffer remains referenced.');
      assert.equal(merged.attributes.normal.array.constructor,Int16Array);assert.equal(merged.attributes.normal.normalized,true);
      let vertexOffset=0,indexOffset=0;
      for(let i=0;i<group.length;i++){
        const {geometry,part,index}=group[i];
        assert.equal(geometry.boundingBox,bounds[i][0]);assert.equal(geometry.boundingSphere,bounds[i][1]);
        assert.deepEqual(geometry.drawRange,{start:indexOffset,count:part.indexCount});
        assert.deepEqual(merged.attributes.position.array.subarray(vertexOffset*3,(vertexOffset+part.vertexCount)*3),new Float32Array(buffer,part.positions,part.vertexCount*3));
        assert.deepEqual(merged.attributes.normal.array.subarray(vertexOffset*3,(vertexOffset+part.vertexCount)*3),new Int16Array(buffer,part.normals,part.vertexCount*3));
        const indices=new Uint32Array(buffer,part.indices,part.indexCount);
        for(let j=0;j<indices.length;j++)assert.equal(merged.index.array[indexOffset+j],indices[j]+vertexOffset);
        assert.ok(merged.attributes.partIndex.array.subarray(vertexOffset,vertexOffset+part.vertexCount).every(value=>value===index));
        vertexOffset+=part.vertexCount;indexOffset+=part.indexCount;parts++;
      }
      renderBytes+=bufferBytes(retained);batches++;
      for(const geometry of [...pickers,merged])geometry.dispose();
    }
    discardedBytes+=bufferBytes(originalBuffers);
  }
  const expected=atlas.chunks.reduce((sum,chunk)=>sum+chunk.bytes,0)+atlas.parts.reduce((sum,part)=>sum+part.vertexCount*4,0);
  assert.equal(discardedBytes,expected);assert.equal(parts,atlas.parts.length);
  t.diagnostic(JSON.stringify({parts,batches,retainedArrayBytesBefore:renderBytes+discardedBytes,retainedArrayBytesAfter:renderBytes,discardedArrayBytes:discardedBytes}));
});
