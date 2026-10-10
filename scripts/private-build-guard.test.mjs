import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {checkPublicInputs,checkBundleOutput,privateJson} from './private-build-guard.mjs';
import {createCourseFixture} from './course-fixture.mjs';

async function fixture(t) {
  const root=await mkdtemp(path.join(os.tmpdir(),'atlas-build-test-'));
  for (const dir of ['public/models','app','scripts','.private-course']) await mkdir(path.join(root,dir),{recursive:true});
  await writeFile(path.join(root,'public/models/atlas.json'),'{"version":"Synthetic public catalogue"}');
  await writeFile(path.join(root,'public/models/body-0.bin'),'synthetic public mesh');
  await writeFile(path.join(root,'app/page.tsx'),'export default ()=>null;');
  t.after(()=>rm(root,{recursive:true,force:true}));return root;
}
test('private staging and synthetic server tests remain outside public build inputs',async t=>{
  const root=await fixture(t);const snapshot=JSON.stringify(createCourseFixture().course);
  await writeFile(path.join(root,'.private-course/human-atlas-course.json'),snapshot);
  await writeFile(path.join(root,'scripts/synthetic-fixture.json'),snapshot);
  await checkPublicInputs(root,{VITE_PUBLIC_FEATURE:'example'});
  assert.equal(privateJson(snapshot),true);assert.equal(privateJson('{"a":{"privateCourseMaterial":true}}'),true);assert.equal(privateJson('code mentioning privateCourseMaterial'),false);
});
test('copied or renamed private JSON and lecture assets cannot enter public',async t=>{
  const root=await fixture(t);
  for (const [name,contents] of [['course.json',JSON.stringify(createCourseFixture().course)],['renamed.json','{}'],['source.pdf','%PDF'],['renamed.png','image bytes']]) {
    const target=path.join(root,'public',name);await writeFile(target,contents);await assert.rejects(checkPublicInputs(root),/privacy guard/);await rm(target);
  }
  await writeFile(path.join(root,'public/models/atlas.json'),JSON.stringify(createCourseFixture().course));await assert.rejects(checkPublicInputs(root),/private course overlay detected/);
});
test('private client imports/assets and symlinked assets are rejected',async t=>{
  const root=await fixture(t);
  for (const name of ['lecture.png','renamed.json','course.json']) {const target=path.join(root,'app',name);await writeFile(target,'synthetic');await assert.rejects(checkPublicInputs(root),/privacy guard/);await rm(target);}
  await symlink(path.join(root,'.private-course'),path.join(root,'app','private-link'));await assert.rejects(checkPublicInputs(root),/symlinks/);
});
test('private VITE values fail while runtime ATLAS values are never read by build guard',async t=>{
  const root=await fixture(t);
  await assert.rejects(checkPublicInputs(root,{VITE_COURSE_FILE:'/private/course.json'}),/runtime ATLAS/);
  await assert.rejects(checkPublicInputs(root,{VITE_OTHER:JSON.stringify(createCourseFixture().course)}),/runtime ATLAS/);
  const previous=process.env.ATLAS_COURSE_FILE;process.env.ATLAS_COURSE_FILE='/this-private-input-does-not-exist.json';
  try { await checkPublicInputs(root); } finally {if (previous===undefined) delete process.env.ATLAS_COURSE_FILE;else process.env.ATLAS_COURSE_FILE=previous;}
});
test('finished build scan allows current bundles and rejects unexpected private output',async t=>{
  const root=await fixture(t);const dist=path.join(root,'dist');await mkdir(path.join(dist,'assets'),{recursive:true});
  await writeFile(path.join(dist,'index.html'),'<html>synthetic</html>');await writeFile(path.join(dist,'assets','index-hash.js'),'console.log("synthetic")');
  await checkBundleOutput(dist);await writeFile(path.join(dist,'assets','lecture-image.png'),'private image');await assert.rejects(checkBundleOutput(dist),/privacy guard/);
});
