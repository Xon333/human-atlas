import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {assignRegions,partitionAtlas,geometrySegments,catalogueGeometryHash,writePartition} from './partition-anatomy.mjs';

const base=new URL('../public/models/',import.meta.url),atlas=JSON.parse(fs.readFileSync(new URL('atlas.json',base)));
const files=atlas.chunks.map(c=>fs.readFileSync(new URL(path.basename(c.url),base)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const SOURCE_REVISION='5224668';
const gitFile=filename=>execFileSync('git',['show',`${SOURCE_REVISION}:${filename}`],{maxBuffer:30_000_000});

test('unanchored occupancy bounds face, central pelvis and the connected elbow-to-hand windows',()=>{
  // Reuse an original identity with no concept membership to exercise spatial
  // decisions independently of the source anchors that supplement real meshes.
  const sourcePart=atlas.parts.find(p=>p.id==='FJ2259');
  const occupancy=([x,y,z])=>{
    const buffer=Buffer.alloc(20);
    [x,y,z].forEach((v,i)=>buffer.writeFloatLE(v,i*4));
    const input={...atlas,parts:[{...sourcePart,chunk:0,positions:0,normals:12,indices:20,vertexCount:1,indexCount:0}],
      concepts:atlas.concepts.map(c=>({...c,elements:[]}))};
    return assignRegions(input,[buffer])[0];
  };
  for(const [point,owner] of [
    [[0,1.53,.07],'head'],[[0,1.53,-.03],'neck'],[[0,1.49,.02],'neck'],[[.07,1.53,.07],'neck'],
    [[.015,.80,.09],'pelvis'],[[-.015,.80,.09],'pelvis'],[[.045,.80,.09],'thigh'],[[-.045,.80,.09],'thigh'],
    [[.178,1.128,-.03],'arm'],[[-.178,1.128,-.03],'arm'],[[.194,1.09,-.025],'forearm'],
    [[.20,.89,0],'forearm'],[[.20,.88,0],'hand'],
  ]) assert.equal(occupancy(point).regionOwner,owner,JSON.stringify(point));
  for(const point of [[.178,1.128,-.03],[.194,1.09,-.025],[.20,.89,0]]) {
    const result=occupancy(point);
    for(const id of ['abdomen','pelvis','hand']) assert.ok(!result.regionIds.includes(id),`${JSON.stringify(point)}/${id}`);
  }
});

test('all 2234 accepted source identities, metadata and raw geometry spans are preserved byte for byte',t=>{
  const originalBytes=gitFile('public/models/atlas.json'),original=JSON.parse(originalBytes);
  const sourceFiles=original.chunks.map(c=>gitFile(`public${c.url}`));
  assert.equal(atlas.parts.length,2234);assert.equal(atlas.parts.length,original.parts.length);
  assert.deepEqual(atlas.concepts,original.concepts);assert.equal(atlas.triangles,original.triangles);
  assert.deepEqual(atlas.optimized,original.optimized);
  const moved=new Set(['chunk','positions','normals','indices']);let byteCount=0;
  for(let i=0;i<original.parts.length;i++) {
    const before=original.parts[i],after=atlas.parts[i];
    for(const [key,value] of Object.entries(before)) if(!moved.has(key)) assert.deepEqual(after[key],value,`${before.id}/${key}`);
    const sourceSegments=geometrySegments(before,sourceFiles),targetSegments=geometrySegments(after,files);
    for(let s=0;s<3;s++) {assert.ok(sourceSegments[s].equals(targetSegments[s]),`${before.id} span ${s}`);byteCount+=sourceSegments[s].length;}
    assert.equal(after.geometrySha256,sha(Buffer.concat(sourceSegments)));
  }
  const expected=catalogueGeometryHash(original,sourceFiles);
  assert.equal(expected,'ce9c7683173b2a42fd8b87bd06c5a311d6df1292cfe4795feba87e5395e6a4e5');
  assert.equal(catalogueGeometryHash(atlas,files),expected);
  assert.equal(atlas.geometryPartition.sourceCatalogSha256,sha(originalBytes));
  assert.equal(atlas.geometryPartition.sourceGeometrySha256,expected);
  assert.equal(atlas.geometryPartition.geometrySha256,expected);
  assert.equal(atlas.geometryPartition.geometryBytes,byteCount);
  t.diagnostic(JSON.stringify({parts:atlas.parts.length,triangles:atlas.triangles,exactGeometryBytes:byteCount,sha256:expected}));
});

test('every chunk is independently valid, content addressed and contains only its declared region/side membership',()=>{
  const urls=new Set();let payload=0,padding=0;
  for(let ci=0;ci<atlas.chunks.length;ci++) {
    const chunk=atlas.chunks[ci],buffer=files[ci],compressed=fs.readFileSync(new URL(path.basename(chunk.gzip),base));
    assert.equal(chunk.bytes,buffer.length);assert.equal(chunk.gzipBytes,compressed.length);
    assert.ok(gunzipSync(compressed).equals(buffer));assert.equal(chunk.sha256,sha(buffer));
    assert.match(chunk.url,/^\/models\/region-(head|neck|thorax|abdomen|pelvis|shoulder|arm|forearm|hand|thigh|leg|foot|body-surface)-(right|left|shared)-[a-f0-9]{16}\.bin$/);
    assert.ok(chunk.url.endsWith(`-${chunk.sha256.slice(0,16)}.bin`));assert.equal(chunk.gzip,chunk.url+'.gz');
    assert.ok(!urls.has(chunk.url));urls.add(chunk.url);
    const parts=atlas.parts.filter(p=>p.chunk===ci);assert.ok(parts.length);
    const spans=[];
    for(const part of parts) {
      assert.deepEqual(part.regionIds,chunk.regionIds);assert.equal(part.regionOwner,chunk.ownerRegionId);assert.equal(part.partitionSide,chunk.side);
      for(const [s,segment] of geometrySegments(part,files).entries()) {const start=part[['positions','normals','indices'][s]];spans.push([start,start+segment.length]);payload+=segment.length;}
    }
    spans.sort((a,b)=>a[0]-b[0]);let end=0;
    for(const [start,next] of spans) {assert.ok(start>=end);assert.ok(start-end<=3);for(let i=end;i<start;i++) assert.equal(buffer[i],0);padding+=start-end;end=next;}
    assert.equal(end,buffer.length,'No unreferenced geometry or trailing payload');
    assert.ok(buffer.length<=atlas.geometryPartition.chunkTargetBytes||parts.length===1);
  }
  assert.equal(payload,atlas.geometryPartition.geometryBytes);
  assert.equal(payload+padding,files.reduce((sum,b)=>sum+b.length,0));
  assert.deepEqual(new Set(fs.readdirSync(base).filter(name=>/\.bin(?:\.gz)?$/.test(name))),new Set(atlas.chunks.flatMap(c=>[path.basename(c.url),path.basename(c.gzip)])),'Only current geometry files remain in public');
});

test('repartition is deterministic and deletes only superseded declared source assets',()=>{
  const result=partitionAtlas(atlas,files,Buffer.from(JSON.stringify(atlas)));
  assert.deepEqual(result.atlas,atlas);assert.equal(result.outputs.length,files.length);
  for(let i=0;i<files.length;i++) assert.ok(result.outputs[i].buffer.equals(files[i]));
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-partition-'));
  try {
    const selected=atlas.parts.find(p=>p.id==='FJ2810'),oldChunk=files[selected.chunk];
    const fixture={...atlas,parts:[{...selected,chunk:0}],concepts:atlas.concepts.map(c=>({...c,elements:c.elements.filter(id=>id===selected.id)})),chunks:[{url:'/models/old.bin',gzip:'/models/old.bin.gz',bytes:oldChunk.length}]};
    fs.writeFileSync(path.join(tmp,'atlas.json'),JSON.stringify(fixture));fs.writeFileSync(path.join(tmp,'old.bin'),oldChunk);fs.writeFileSync(path.join(tmp,'old.bin.gz'),'superseded');fs.writeFileSync(path.join(tmp,'unrelated.txt'),'preserved');
    writePartition(tmp);
    assert.ok(!fs.existsSync(path.join(tmp,'old.bin')));assert.ok(!fs.existsSync(path.join(tmp,'old.bin.gz')));
    assert.equal(fs.readFileSync(path.join(tmp,'unrelated.txt'),'utf8'),'preserved');
    const updated=JSON.parse(fs.readFileSync(path.join(tmp,'atlas.json')));
    assert.equal(updated.parts[0].id,'FJ2810');assert.deepEqual(geometrySegments(updated.parts[0],updated.chunks.map(c=>fs.readFileSync(path.join(tmp,path.basename(c.url))))),geometrySegments(selected,files));
  } finally {fs.rmSync(tmp,{recursive:true,force:true});}
});
