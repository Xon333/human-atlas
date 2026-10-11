import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {projectGeometry,requestedGeometry} from '../app/scene-scope.ts';
const base={selected:[],visible:['skeletal'],view:'front',reset:1,rotate:false,isolate:false,explode:0};
const part=(id,chunk)=>({id,chunk,positions:0,normals:36,indices:56,vertexCount:3,indexCount:3,bounds:[[0,0,0],[1,1,1]],name:id,conceptId:id,system:'skeletal'});
const atlas={version:'fixture',parts:[part('a',2),part('b',0),part('c',2)],concepts:[{id:'whole',name:'whole',elements:['a','b','c']}],chunks:[{url:'/0',bytes:100},{url:'/1',bytes:100},{url:'/2',bytes:100}],triangles:3};
test('Explorer retains the exact original catalogue including hidden selectable systems',()=>{
 assert.equal(requestedGeometry({...base,selected:['a']}),undefined);
 assert.equal(projectGeometry(atlas,undefined),atlas);
});
test('region includes context and an explicit out-of-layer selection; keys ignore ordering and duplicates',()=>{
 const a=requestedGeometry({...base,scope:['c','a'],context:['b'],selected:['a']});
 assert.deepEqual(a,['a','b','c']);
 assert.deepEqual(a,requestedGeometry({...base,scope:['a','c','a'],context:['b'],selected:['a']}));
 assert.deepEqual(requestedGeometry({...base,context:['c']}),['c']);
});
test('projection preserves geometry descriptors, catalogue ordering, and exact source chunks',()=>{
 const before=JSON.stringify(atlas),out=projectGeometry(atlas,['c','a']);
 assert.deepEqual(out.parts.map(p=>p.id),['a','c']);
 assert.deepEqual(out.parts.map(p=>p.chunk),[0,0]);
 assert.equal(out.chunks[0],atlas.chunks[2]);
 assert.equal(out.concepts,atlas.concepts);
 for(const p of out.parts){const original=atlas.parts.find(x=>x.id===p.id);assert.deepEqual({...p,chunk:original.chunk},original);}
 assert.equal(JSON.stringify(atlas),before);
});
test('ordinary selection and isolation within a region keep the same geometry key',()=>{
 const scope=['a','c'];
 assert.deepEqual(requestedGeometry({...base,scope}),requestedGeometry({...base,scope,selected:['c'],isolate:true}));
});
test('empty and unknown scopes never fall back to the entire atlas',()=>{
 assert.equal(projectGeometry(atlas,[]).parts.length,0);
 assert.equal(projectGeometry(atlas,['unknown']).chunks.length,0);
});
test('every real catalogue part retains exact coordinates/offsets and chunk identity',()=>{
 const real=JSON.parse(readFileSync(new URL('../public/models/atlas.json',import.meta.url)));
 for(const original of real.parts){
  const out=projectGeometry(real,[original.id]);
  assert.equal(out.parts.length,1);
  assert.deepEqual({...out.parts[0],chunk:original.chunk},original);
  assert.equal(out.chunks[0],real.chunks[original.chunk]);
 }
 assert.equal(projectGeometry(real,real.parts.map(p=>p.id)),real);
});
