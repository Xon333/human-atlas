import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {parseAtlasLink, serializeAtlasLink, resolveAtlasLink, resolveAtlasRoute, publicTargetLink} from '../app/course-navigation.ts';
import {regionForElements} from '../app/atlas-regions.ts';
import {createCourseFixture} from './course-fixture.mjs';

// Only synthetic anatomy and course data. The private syllabus never enters this file.
const parts=[
  {id:'head-bone',name:'skull',system:'skeletal',conceptId:'head-target'},
  {id:'hand-right',name:'right hand bone',system:'skeletal',conceptId:'hand-target'},
  {id:'hand-left',name:'left hand bone',system:'skeletal',conceptId:'hand-target'},
  {id:'hand-muscle',name:'right hand muscle',system:'muscular',conceptId:'muscle-target'},
  {id:'arm-right',name:'right arm bone',system:'skeletal',conceptId:'arm-target'},
  {id:'foot-right',name:'right foot bone',system:'skeletal',conceptId:'foot-target'},
  {id:'skin',name:'skin',system:'integumentary',conceptId:'surface-target'},
  {id:'FJ1469',name:'left flexor pollicis brevis',system:'muscular',conceptId:'conflicting-target'},
].map(part=>({...part,chunk:0,positions:0,normals:0,indices:0,vertexCount:3,indexCount:3,bounds:[[0,0,0],[1,1,1]]}));
const atlas={version:'synthetic',parts,chunks:[{url:'/synthetic.bin',bytes:0}],triangles:0,concepts:[
  {id:'FMA5018',name:'bone organ',elements:['head-bone','hand-right','hand-left','arm-right','foot-right']},
  {id:'FMA5022',name:'muscle organ',elements:['hand-muscle','FJ1469']},
  {id:'head-target',name:'Head target',elements:['head-bone']},
  {id:'hand-target',name:'Hands',elements:['hand-right','hand-left']},
  {id:'arm-target',name:'Right arm',elements:['arm-right']},
  {id:'muscle-target',name:'Right hand muscle',elements:['hand-muscle']},
  {id:'foot-target',name:'Right foot',elements:['foot-right']},
  {id:'surface-target',name:'Skin',elements:['skin']},
  {id:'conflicting-target',name:'Source conflict',elements:['FJ1469']},
  {id:'upper-target',name:'Hand and arm',elements:['hand-right','arm-right']},
  {id:'multi-target',name:'Head and foot',elements:['head-bone','foot-right']},
],regions:[
  {id:'head',label:'Head',elements:['head-bone']},
  {id:'hand',label:'Hand',elements:['hand-right','hand-left','hand-muscle','FJ1469']},
  {id:'arm',label:'Upper arm',elements:['arm-right']},
  {id:'upper-limb',label:'Whole upper limb',elements:['hand-right','hand-left','hand-muscle','FJ1469','arm-right']},
  {id:'foot',label:'Foot',elements:['foot-right']},
  {id:'body-surface',label:'Body surface',elements:['skin']},
]};

for(const layer of ['bones','muscles','all'])for(const side of ['right','left','both'])test(`public ${side}/${layer} route preserves explicit state`,()=>{
 const link={mode:'region',regionId:'hand',side,layer,structureId:'hand-target',view:'front',isolate:false};
 assert.deepEqual(parseAtlasLink(serializeAtlasLink(link)),link);
 const resolved=resolveAtlasLink(link,atlas,null);
 assert.equal(resolved.isolate,false);
 assert.ok(resolved.scopeElements.every(id=>atlas.regions[1].elements.includes(id)));
 assert.ok(resolved.elements.length);
 if(side==='right')assert.deepEqual(resolved.elements,['hand-right']);
 if(side==='left')assert.deepEqual(resolved.elements,['hand-left']);
});

test('blank and invalid routes never authorize a scene',()=>{
 for(const hash of ['','#'])for(const catalogue of [null,atlas])assert.deepEqual(resolveAtlasRoute(hash,catalogue,null,'loading'),{status:'chooser'});
 for(const hash of ['#unknown=1','#view=front','#structure=hand-target','#region=hand&explorer=1','#region=hand&course=x','#course=x&explorer=1','#region=hand&region=foot','#region=hand&side=up','#region=hand&layer=skin','#region=hand&selection=x','#region=hand&objective=x','#region=hand&context=1','#explorer=0','#explorer=1&side=both','#region=%ZZ'])assert.throws(()=>resolveAtlasRoute(hash,atlas,null,'ready'),undefined,hash);
 assert.throws(()=>resolveAtlasRoute('#region=unknown',atlas,null,'ready'),/Unknown atlas region/);
 assert.throws(()=>resolveAtlasRoute('#region=whole-body',atlas,null,'ready'),/Unknown atlas region/);
});

test('only validated requests pass the scene gate; public routes do not wait for a private runtime',()=>{
 assert.deepEqual(resolveAtlasRoute('#region=hand',null,null,'loading'),{status:'pending'});
 const route=resolveAtlasRoute('#region=hand',atlas,null,'loading');
 assert.equal(route.status,'scene');
 assert.ok(route.resolved.scopeElements.length<atlas.parts.length);
 assert.deepEqual(route.resolved.elements,[]);
 assert.equal(route.resolved.isolate,undefined);
 const explorer=resolveAtlasRoute('#explorer=1',atlas,null,'unavailable');
 assert.equal(explorer.status,'scene');
 assert.equal(explorer.resolved.scopeElements,undefined);
});

test('course routes wait for catalogue and verified runtime, including unmapped source objectives',()=>{
 const fixture=createCourseFixture(),course=fixture.course;
 const hash=serializeAtlasLink({mode:'course',courseId:course.courseId});
 assert.deepEqual(resolveAtlasRoute(hash,null,course,'ready'),{status:'pending'});
 assert.deepEqual(resolveAtlasRoute(hash,fixture.atlas,null,'loading'),{status:'pending'});
 assert.throws(()=>resolveAtlasRoute(hash,fixture.atlas,null,'unavailable'),/not available/);
 assert.throws(()=>resolveAtlasRoute(hash,fixture.atlas,null,'error'),/not available/);
 const first=resolveAtlasRoute(hash,fixture.atlas,course,'ready');
 assert.equal(first.status,'scene');assert.equal(first.request.selectionId,course.selections[0].id);
 const target=course.concepts[0];
 const legacy={mode:'course',courseId:course.courseId,structureId:target.id};
 assert.deepEqual(parseAtlasLink(serializeAtlasLink(legacy)),legacy);
 assert.deepEqual(resolveAtlasRoute(serializeAtlasLink(legacy),fixture.atlas,course,'ready').resolved.elements,target.elements);
 const objective={mode:'course',courseId:course.courseId,objectiveId:course.unmappedObjectives[0].id};
 assert.deepEqual(resolveAtlasRoute(serializeAtlasLink(objective),fixture.atlas,course,'ready').resolved.elements,[]);
});

test('bone-free regions open all layers when omitted, but explicit invalid filters remain errors',()=>{
 for(const target of [{},{structureId:'surface-target'},{meshId:'skin'}]){
  const link={mode:'region',regionId:'body-surface',...target};
  const resolved=resolveAtlasLink(link,atlas,null);
  assert.equal(resolved.layer,'all');assert.deepEqual(resolved.scopeElements,['skin']);
 }
 assert.throws(()=>resolveAtlasLink({mode:'region',regionId:'body-surface',layer:'bones'},atlas,null),/no available meshes/);
 const picked=publicTargetLink(atlas,{structureId:'surface-target'});
 assert.equal(picked.mode,'region');assert.equal(picked.regionId,'body-surface');assert.equal(picked.layer,'all');
});

test('public picker preserves the assembly and adapts side/layer without isolation',()=>{
 const current={mode:'region',regionId:'hand',side:'right',layer:'bones'};
 const left=publicTargetLink(atlas,{structureId:'hand-target',meshId:'hand-left'},current);
 assert.equal(left.side,'left');assert.equal(left.isolate,false);assert.equal(left.regionId,'hand');
 assert.deepEqual(resolveAtlasLink(left,atlas,null).elements,['hand-left']);
 const muscle=publicTargetLink(atlas,{structureId:'muscle-target'},current);
 assert.equal(muscle.layer,'muscles');assert.equal(muscle.isolate,false);
 const resolved=resolveAtlasLink(muscle,atlas,null);
 assert.deepEqual(resolved.elements,['hand-muscle']);assert.ok(resolved.scopeElements.includes('hand-right'));
 const foot=publicTargetLink(atlas,{structureId:'foot-target'},current);
 assert.equal(foot.regionId,'foot');assert.equal(foot.mode,'region');assert.equal(foot.isolate,false);
 const composite=publicTargetLink(atlas,{structureId:'upper-target'},current);
 assert.equal(composite.regionId,'upper-limb');
 const withinComposite=publicTargetLink(atlas,{structureId:'hand-target',meshId:'hand-right'},{mode:'region',regionId:'upper-limb',side:'both',layer:'all'});
 assert.equal(withinComposite.regionId,'upper-limb','Picking a member must retain a deliberate broader assembly');
 assert.equal(withinComposite.side,'both');assert.equal(withinComposite.layer,'all');
});

test('a target spanning uncontained regions requires the explicit Explorer action',()=>{
 assert.equal(regionForElements(atlas,['head-bone','foot-right']),null);
 const current={mode:'region',regionId:'head'};
 assert.throws(()=>publicTargetLink(atlas,{structureId:'multi-target'},current),/Full Body Explorer/);
 assert.throws(()=>publicTargetLink(atlas,{structureId:'multi-target'}),/Full Body Explorer/);
 const deliberate=publicTargetLink(atlas,{structureId:'multi-target'},{mode:'explorer'});
 assert.deepEqual(deliberate,{mode:'explorer',structureId:'multi-target',isolate:false});
 assert.equal(resolveAtlasLink(deliberate,atlas,null).scopeElements,undefined);
});

test('source side conflicts remain in both-side assemblies, never relabeled or implicitly isolated',()=>{
 const picked=publicTargetLink(atlas,{meshId:'FJ1469'},{mode:'region',regionId:'hand',side:'right',layer:'bones'});
 assert.equal(picked.side,'both');assert.equal(picked.layer,'muscles');assert.equal(picked.isolate,false);
 const resolved=resolveAtlasLink(picked,atlas,null);
 assert.deepEqual(resolved.elements,['FJ1469']);assert.ok(resolved.scopeElements.includes('hand-right'));
 assert.throws(()=>resolveAtlasLink({...picked,side:'left'},atlas,null),/source side label conflicts/);
});

test('invalid targets and outside-region links cannot retarget silently',()=>{
 for(const target of [{structureId:'unknown'},{meshId:'unknown'},{structureId:'head-target',meshId:'hand-right'}])assert.throws(()=>publicTargetLink(atlas,target));
 assert.throws(()=>resolveAtlasLink({mode:'region',regionId:'head',structureId:'foot-target'},atlas,null),/does not belong/);
 assert.throws(()=>resolveAtlasLink({mode:'region',regionId:'hand',meshId:'hand-left',side:'right'},atlas,null),/outside the selected side/);
 assert.throws(()=>resolveAtlasLink({mode:'region',regionId:'hand',structureId:'muscle-target',layer:'bones'},atlas,null),/outside the selected layer/);
 const explicit=resolveAtlasLink({mode:'region',regionId:'hand',structureId:'hand-target',isolate:true},atlas,null);
 assert.equal(explicit.isolate,true);assert.ok(explicit.scopeElements.length>0);
});

test('scene imports are lazy and default/error render exits before the scene JSX',async()=>{
 const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
 const parsed=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.equal(parsed.parseDiagnostics.length,0);
 const imports=parsed.statements.filter(ts.isImportDeclaration).map(statement=>statement.moduleSpecifier.text);
 assert.ok(!imports.some(name=>name==='./scene'||name.includes('three')||name.includes('scene-renderer')));
 assert.match(page,/lazy\(\(\)=>import\('\.\/scene'\)\)/);
 assert.ok(page.indexOf('if(!sceneReady)return <RegionChooser')<page.indexOf('<AnatomyScene'));
 assert.match(page,/scope:resolved\.scopeElements\?\?\(next\.objectiveId\?\[\]:undefined\)/,'Unmapped source objectives must not initialize complete-body geometry');
 assert.match(page,/resolveAtlasRoute\(location\.hash,atlas,course,privateCourse\.status\)/);
});
