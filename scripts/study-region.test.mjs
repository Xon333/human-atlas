import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createCourseFixture} from './course-fixture.mjs';
import {validateCourseOverlay} from '../app/course.ts';
import {parseAtlasLink,serializeAtlasLink,resolveAtlasLink} from '../app/course-navigation.ts';
import {regionElements,partSide} from '../app/study-region.ts';

const atlas = JSON.parse(await readFile(new URL('../public/models/atlas.json',import.meta.url),'utf8'));
const group = id => {const c=atlas.concepts.find(c=>c.id===id);assert.ok(c,id);return c;};
const union = ids => [...new Set(ids.flatMap(id=>group(id).elements))];
function fixture() {
  const f=createCourseFixture();
  f.course.selections[0].region={conceptIds:f.atlas.concepts.map(c=>c.id),elements:[...new Set(f.atlas.concepts.flatMap(c=>c.elements))],defaultSide:'both',defaultLayer:'all'};
  return f;
}

test('regional view remains an optional, backwards-compatible course extension',()=>{
 const f=createCourseFixture();
 assert.equal(validateCourseOverlay(f.course,f.atlas,f.catalogBlobSha).selections[0].region,undefined);
 const r=fixture();
 assert.deepEqual(validateCourseOverlay(r.course,r.atlas,r.catalogBlobSha).selections[0].region,r.course.selections[0].region);
 assert.equal(r.course.concepts.length,f.course.concepts.length,'Adding context never manufactures taught terms');
});
for(const [name,change] of [
 ['unknown regional concept',f=>f.course.selections[0].region.conceptIds.push('FMA_MISSING')],
 ['wrong union order',f=>f.course.selections[0].region.elements.reverse()],
 ['missing context mesh',f=>f.course.selections[0].region.elements.pop()],
 ['invalid side',f=>f.course.selections[0].region.defaultSide='future'],
 ['invalid layer',f=>f.course.selections[0].region.defaultLayer='skinny'],
 ['region excludes a taught target',f=>{const c=f.atlas.concepts.at(-1);f.course.selections[0].region.conceptIds=[c.id];f.course.selections[0].region.elements=c.elements;}],
])test(`consumer rejects ${name}`,()=>{const f=fixture();change(f);assert.throws(()=>validateCourseOverlay(f.course,f.atlas,f.catalogBlobSha));});

test('scope and selected target resolve separately, including non-taught meshes',()=>{
 const f=fixture(),course=validateCourseOverlay(f.course,f.atlas,f.catalogBlobSha),selection=course.selections[0];
 const extra=f.atlas.concepts.at(-1);
 const route={mode:'course',courseId:course.courseId,selectionId:selection.id,structureId:extra.id};
 const result=resolveAtlasLink(route,f.atlas,course);
 assert.deepEqual(result.elements,extra.elements);
 assert.ok(result.scopeElements.length>result.elements.length);
 assert.equal(result.isolate,undefined,'Isolation must be an explicit user decision');
 assert.equal(course.concepts.some(c=>c.id===extra.id),false);
});
test('explicit isolation, filters and Unicode targets survive route round trips',()=>{
 const f=fixture(),selection=f.course.selections[0];
 for(const isolate of [false,true]) {
  const link={mode:'course',courseId:f.course.courseId,selectionId:selection.id,side:'left',layer:'muscles',isolate};
  assert.deepEqual(parseAtlasLink(serializeAtlasLink(link)),link);
 }
 for(const hash of ['#explorer=1&side=right','#course=a&side=up','#course=a&layer=skin','#course=a&side=left&side=right'])assert.throws(()=>parseAtlasLink(hash));
});
test('unmapped context never acquires a highlighted target from a regional union',()=>{
 const f=fixture(),course=validateCourseOverlay(f.course,f.atlas,f.catalogBlobSha);
 const result=resolveAtlasLink({mode:'course',courseId:course.courseId,objectiveId:course.unmappedObjectives[0].id,context:true},f.atlas,course);
 assert.deepEqual(result.elements,[]);
 assert.equal(result.scopeElements,undefined);
 assert.deepEqual(new Set(result.contextElements),new Set(course.selections[0].region.elements));
});
test('laterality does not invent a side for midline or compound bilateral names',()=>{
 for(const name of ['femur','right and left structure','midline'])assert.equal(partSide({name}),null);
 assert.equal(partSide({name:'head of right femur'}),'right');
 assert.equal(partSide({name:'left scapula'}),'left');
});
test('existing anatomical classes separate bones from misfiled muscles and bands',()=>{
 const limbs=union(['FMA7185','FMA7186','FMA7187','FMA7188','FMA9621','FMA9622']);
 const bones=regionElements(atlas,limbs,'both','bones');
 assert.ok(bones.every(id=>group('FMA5018').elements.includes(id)));
 assert.ok(!bones.some(id=>/fibularis|iliotibial|retinaculum|tibialis/.test(atlas.parts.find(p=>p.id===id).name)));
 const muscleView=regionElements(atlas,limbs,'right','muscles');
 assert.ok(muscleView.length>regionElements(atlas,limbs,'right','bones').length);
 assert.ok(muscleView.every(id=>partSide(atlas.parts.find(p=>p.id===id))!=='left'));
});
test('real catalogue supplies whole hand and foot rather than carpals/tarsals only',()=>{
 const hand=regionElements(atlas,union(['FMA9713','FMA9714','FMA24940','FMA24941']),'right','bones');
 const foot=regionElements(atlas,union(['FMA11343','FMA11344']),'right','bones');
 assert.equal(hand.length,27);
 assert.equal(foot.length,26);
 assert.ok(hand.some(id=>/metacarpal/.test(atlas.parts.find(p=>p.id===id).name)));
 assert.ok(foot.some(id=>/phalanx/.test(atlas.parts.find(p=>p.id===id).name)));
});
test('region membership cannot authorize a structure from outside its union',()=>{
 const f=createCourseFixture();
 assert.throws(()=>resolveAtlasLink({mode:'course',courseId:f.course.courseId,selectionId:f.course.selections[0].id,structureId:f.atlas.concepts.at(-1).id},f.atlas,f.course),/does not belong/);
});
