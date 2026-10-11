import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ATLAS_REGIONS,atlasRegions,regionForElements} from '../app/atlas-regions.ts';
import {regionElements,hasSourceSideConflict} from '../app/study-region.ts';

const atlas=JSON.parse(fs.readFileSync(new URL('../public/models/atlas.json',import.meta.url)));
const regions=atlasRegions(atlas),byId=new Map(regions.map(r=>[r.id,r]));
const partByName=name=>atlas.parts.find(p=>p.name===name);
const region=id=>{const value=byId.get(id);assert.ok(value,id);return value;};

test('permanent region catalogue covers every original identity without inventing membership',()=>{
  assert.equal(new Set(ATLAS_REGIONS.map(r=>r.id)).size,ATLAS_REGIONS.length);
  assert.deepEqual(regions.map(r=>r.id),ATLAS_REGIONS.map(r=>r.id));
  const ids=new Set(atlas.parts.map(p=>p.id)),covered=new Set();
  for(const r of regions) {
    assert.ok(r.elements.length,r.id);assert.equal(new Set(r.elements).size,r.elements.length);
    assert.deepEqual(r.elements,atlas.parts.filter(p=>p.regionIds.includes(r.id)).map(p=>p.id));
    for(const id of r.elements) {assert.ok(ids.has(id));covered.add(id);}
  }
  assert.deepEqual(covered,ids);assert.equal(covered.size,2234);
  for(const part of atlas.parts) assert.ok(part.regionIds.includes(part.regionOwner));
  for(const definition of ATLAS_REGIONS) for(const id of definition.conceptIds??[]) assert.ok(atlas.concepts.some(c=>c.id===id),id);
});

test('source anchors are supplemented and guarded rather than mistaken for complete regional groups',()=>{
  const concept=id=>atlas.concepts.find(c=>c.id===id);
  assert.equal(concept('FMA11345').elements.length,3);
  assert.ok(region('forearm').elements.length>6);
  assert.equal(concept('FMA9578').elements.length,8);
  assert.ok(region('pelvis').elements.length>8);
  assert.ok(region('head').elements.includes(partByName('Right anterior cerebral artery').id));
  assert.ok(!region('thorax').elements.includes(partByName('Right anterior cerebral artery').id),'The source thorax group also includes distant vascular meshes.');
  const obturator=partByName('Right obturator internus');
  assert.ok(concept('FMA9577').elements.includes(obturator.id));
  assert.ok(!region('abdomen').elements.includes(obturator.id));
  assert.ok(region('pelvis').elements.includes(obturator.id));
  for(const [name,id] of [['Left humerus','arm'],['Right tibialis anterior','leg'],['Caudate lobe of liver','abdomen']]) {
    const part=partByName(name);assert.equal(part.regionOwner,id);assert.ok(region(id).elements.includes(part.id));
  }
});

test('composite limb and joint views retain crossing meshes whole and reuse their original IDs',()=>{
  for(const [composite,children] of [['upper-limb',['shoulder','arm','elbow','forearm','wrist','hand']],['lower-limb',['hip','thigh','knee','leg','ankle','foot']]]) {
    const expected=new Set(children.flatMap(id=>region(id).elements));
    assert.deepEqual(new Set(region(composite).elements),expected);
  }
  for(const [joint,names] of [['elbow',['Right humerus','Right radius']],['wrist',['Right radius']],['hip',['Right femur','Right hip bone']],['knee',['Right femur','Right tibia','Right patella']],['ankle',['Right tibia']]])
    for(const name of names) assert.ok(region(joint).elements.includes(partByName(name).id),`${joint}: ${name}`);
  assert.ok(region('back').elements.includes(partByName('Atlas').id));
  assert.ok(region('back').elements.includes(partByName('Sacrum').id));
});

test('head includes every source tooth and lip while the anterior window excludes cervical structures',()=>{
  const teeth=atlas.concepts.find(c=>c.id==='FMA12516');
  assert.equal(teeth.elements.length,28);
  for(const id of [...teeth.elements,'FJ2814']) {
    const part=atlas.parts.find(p=>p.id===id);
    assert.ok(region('head').elements.includes(id),part.name);
    assert.equal(part.regionOwner,'head',part.name);
    assert.ok(part.regionAssignment.sourceConceptIds.includes(id==='FJ2814'?'FMA59816':'FMA12516'));
  }
  for(const name of ['Atlas','Axis','Third cervical vertebra','Fourth cervical vertebra','Thyroid cartilage']) {
    const part=partByName(name);
    assert.ok(region('neck').elements.includes(part.id),name);
    assert.ok(!region('head').elements.includes(part.id),name);
  }
});

test('central genital meshes belong to pelvis rather than thigh and retain source anchors',()=>{
  for(const conceptId of ['FMA18247','FMA19617','FMA19618','FMA19667','FMA7210','FMA19795','FMA21354','FMA21384']) {
    const concept=atlas.concepts.find(c=>c.id===conceptId);
    for(const id of concept.elements) {
      const part=atlas.parts.find(p=>p.id===id);
      assert.deepEqual(part.regionIds,['pelvis'],part.name);
      assert.equal(part.regionOwner,'pelvis',part.name);
      assert.ok(part.regionAssignment.sourceConceptIds.includes(conceptId),part.name);
    }
  }
  for(const id of atlas.concepts.find(c=>c.id==='FMA9579').elements) assert.ok(region('pelvis').elements.includes(id));
  for(const name of ['Left femur','Right femur','Right adductor longus','Left adductor longus']) {
    const part=partByName(name);
    assert.ok(region('thigh').elements.includes(part.id),name);
    assert.ok(region('lower-limb').elements.includes(part.id),name);
  }
});

test('elbow occupancy closes humeral trunk gaps and recurrent arteries cannot fall into hand',()=>{
  for(const name of ['Left humerus','Right humerus']) {
    const part=partByName(name);
    for(const id of ['shoulder','arm','elbow','forearm','upper-limb']) assert.ok(region(id).elements.includes(part.id),`${name}/${id}`);
    for(const id of ['thorax','abdomen','pelvis','hand']) assert.ok(!region(id).elements.includes(part.id),`${name}/${id}`);
  }
  for(const id of ['FJ2259','FJ2311']) {
    const part=atlas.parts.find(p=>p.id===id);
    assert.deepEqual(part.regionIds,['elbow','forearm','upper-limb'],part.name);
    assert.equal(part.regionOwner,'forearm');
  }
});

test('single-side views use the existing laterality policy and load no excluded opposite-side meshes',()=>{
  for(const r of regions) for(const side of ['right','left','both']) {
    const elements=regionElements(atlas,r.elements,side,'all'),included=new Set(elements);
    const chunks=new Set(atlas.parts.filter(p=>included.has(p.id)).map(p=>p.chunk));
    for(const part of atlas.parts) if(chunks.has(part.chunk)) assert.ok(included.has(part.id),`${r.id}/${side} co-decodes excluded ${part.id}`);
  }
  const hand=region('hand');
  const sourceUnion=ids=>[...new Set(atlas.concepts.filter(c=>ids.includes(c.id)).flatMap(c=>c.elements))];
  const originalHand=regionElements(atlas,sourceUnion(['FMA9713','FMA9714','FMA24940','FMA24941']),'right','bones');
  const originalFoot=regionElements(atlas,sourceUnion(['FMA11343','FMA11344']),'right','bones');
  const handBones=regionElements(atlas,hand.elements,'right','bones'),footBones=regionElements(atlas,region('foot').elements,'right','bones');
  assert.equal(originalHand.length,27);assert.equal(originalFoot.length,26);
  assert.ok(originalHand.every(id=>handBones.includes(id)));assert.ok(originalFoot.every(id=>footBones.includes(id)));
  assert.equal(handBones.length,29,'The crossing radius and ulna remain whole.');
  assert.equal(footBones.length,30,'Spatial coverage also retains the crossing tibia/fibula and two source sesamoids missing from the foot concept group.');
  for(const side of ['left','right']) assert.ok(!hasSourceSideConflict(regionElements(atlas,hand.elements,side,'all')));
  assert.ok(hasSourceSideConflict(regionElements(atlas,hand.elements,'both','all')));
});

test('whole-body loading is never a region or an automatic lookup fallback',()=>{
  assert.ok(!ATLAS_REGIONS.some(r=>r.id==='whole-body'));
  assert.equal(regionForElements(atlas,[]),null);
  assert.equal(regionForElements(atlas,['unknown']),null);
  assert.equal(regionForElements(atlas,atlas.parts.map(p=>p.id)),null);
  const cerebral=partByName('Right anterior cerebral artery'),tibia=partByName('Right tibia');
  assert.equal(regionForElements(atlas,[cerebral.id,tibia.id]),null);
  const handBone=atlas.parts.find(p=>/Metacarpal|metacarpal/.test(p.name)&&/right/i.test(p.name));
  assert.equal(regionForElements(atlas,[partByName('Right humerus').id,handBone.id]).id,'upper-limb');
  assert.deepEqual(regionForElements(atlas,region('hand').elements),region('hand'));
});

test('skin stays separately available and the API does not manufacture an incomplete legacy partition',()=>{
  const skin=partByName('Skin');
  assert.deepEqual(skin.regionIds,['body-surface']);
  assert.ok(region('body-surface').elements.includes(skin.id));
  for(const r of regions) if(r.id!=='body-surface') assert.ok(!r.elements.includes(skin.id));
  assert.deepEqual(atlasRegions({...atlas,regions:undefined}),[]);
  assert.equal(regionForElements({...atlas,regions:undefined},[skin.id]),null);
  const view=atlasRegions(atlas);view[0].elements.length=0;
  assert.ok(atlasRegions(atlas)[0].elements.length>0);
});
