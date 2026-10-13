import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,writeFile,rename,rm,symlink,unlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createPrivateServer,runtimeConfig,parseRange,gitBlobSha} from '../server/private-runtime.mjs';
import {createCourseFixture} from './course-fixture.mjs';
import {courseSourceUrl} from '../app/course-navigation.ts';
import {spaceoRoute,validateSpaceOPath,validateCourseOverlay} from '../app/course.ts';

const PDF = Buffer.from('%PDF-1.4\nSynthetic PDF bytes for range checks only.\n');
async function fixture(t,{enabled = true,mutate} = {}) {
  const temporary = await mkdtemp(path.join(os.tmpdir(),'atlas-runtime-test-'));
  const repoRoot = path.join(temporary,'atlas');
  const spaceoRoot = path.join(temporary,'spaceo');
  const distRoot = path.join(repoRoot,'dist');
  const courseFile = path.join(spaceoRoot,'.spaceo','tmp','human-atlas-course.json');
  const data = createCourseFixture();
  if (mutate) mutate(data);
  for (const directory of [path.join(distRoot,'models'),path.join(distRoot,'assets'),path.dirname(courseFile),path.join(spaceoRoot,'Notes','Example')]) await mkdir(directory,{recursive:true});
  await writeFile(path.join(distRoot,'models','atlas.json'),data.rawCatalog);
  await writeFile(path.join(distRoot,'index.html'),'<!doctype html><title>Synthetic explorer</title>');
  await writeFile(path.join(distRoot,'assets','app-test.js'),'console.log("synthetic")');
  await writeFile(courseFile,JSON.stringify(data.course));
  await mkdir(path.dirname(path.join(spaceoRoot,data.binding.courseSource.path)),{recursive:true});
  await writeFile(path.join(spaceoRoot,data.binding.courseSource.path),PDF);
  await writeFile(path.join(spaceoRoot,data.binding.figures[0].path),'Synthetic image bytes');
  await writeFile(path.join(spaceoRoot,data.binding.capture.path),'Synthetic original capture');
  await writeFile(path.join(spaceoRoot,data.binding.note.path),`# ${data.binding.note.heading}\nSynthetic note, never served.`);
  await writeFile(path.join(spaceoRoot,'not-allowlisted.txt'),'MUST_NOT_SERVE');
  const errors = [];
  const config = runtimeConfig({ATLAS_PORT:'0',...(enabled?{ATLAS_COURSE_FILE:courseFile,ATLAS_SPACEO_ROOT:spaceoRoot}:{}),ATLAS_VAULT_NAME:'Synthetic vault'},repoRoot);
  const {server} = await createPrivateServer({...config,onError:error=>errors.push(error.message)});
  await new Promise((resolve,reject)=>{server.once('error',reject); server.listen(0,'127.0.0.1',resolve);});
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(temporary,{recursive:true,force:true});});
  return {...data,temporary,repoRoot,spaceoRoot,courseFile,distRoot,errors,server,url:`http://127.0.0.1:${server.address().port}`};
}
async function replaceCourse(f,course) {
  const temporary = `${f.courseFile}.new`;
  await writeFile(temporary,typeof course==='string'?course:JSON.stringify(course));
  await rename(temporary,f.courseFile);
}
function rawRequest(f,requestPath,headers = {}) {
  return new Promise((resolve,reject)=>{
    http.get(`${f.url}/`,{path:requestPath,headers},response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(chunk));
      response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks).toString()}));
    }).on('error',reject);
  });
}

test('runtime settings default to loopback and reject unsafe/path or URL configuration',()=>{
  const config=runtimeConfig({});
  assert.equal(config.host,'127.0.0.1');assert.equal(config.port,3016);assert.equal(config.courseFile,null);
  assert.equal(config.links.vaultRoot,'Notes');
  for (const env of [{ATLAS_COURSE_FILE:'relative.json'},{ATLAS_SPACEO_ROOT:'relative'},{ATLAS_VAULT_ROOT:'../Notes'},{ATLAS_ORIGIN:'https://user:password@example.invalid'},{ATLAS_ORIGIN:'https://example.invalid/path'},{ATLAS_NOTE_BASE_URL:'javascript:alert(1)'},{ATLAS_PORT:'-1'}]) assert.throws(()=>runtimeConfig(env));
  assert.equal(runtimeConfig({ATLAS_ORIGIN:'https://private.example.invalid',ATLAS_VAULT_ROOT:'Notes/Example'}).origin,'https://private.example.invalid');
});

test('unconfigured runtime keeps explorer and reloads working; private endpoints stay absent',async t=>{
  const f=await fixture(t,{enabled:false});
  const response=await fetch(`${f.url}/api/course`);
  assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:{code:'COURSE_NOT_CONFIGURED'}});
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.match(await (await fetch(`${f.url}/?mode=explore&structure=synthetic`)).text(),/Synthetic explorer/);
  assert.equal((await fetch(`${f.url}/models/missing.bin`)).status,404);
  assert.equal((await fetch(`${f.url}/api/unknown`)).status,404);
  assert.equal((await fetch(`${f.url}/.env`)).status,404);
});

test('validated runtime returns actual catalogue hash and exact allowlisted sources',async t=>{
  const f=await fixture(t);
  const response=await fetch(`${f.url}/api/course`);assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.catalogBlobSha,gitBlobSha(f.catalogBytes));assert.equal(body.course.label,f.course.label);
  assert.deepEqual(body.links,{vaultName:'Synthetic vault',vaultRoot:'Notes',noteBaseUrl:null});
  assert.equal(response.headers.get('cross-origin-resource-policy'),'same-origin');
  assert.equal(response.headers.get('access-control-allow-origin'),null);
  for (const [url,mime,text] of [['pdf','application/pdf','%PDF-1.4'],['figure/0','image/png','Synthetic image'],['capture','text/plain','Synthetic original capture']]) {
    const source=await fetch(`${f.url}/api/course/sources/sample/${url}`);
    assert.equal(source.status,200);assert.match(source.headers.get('content-type'),new RegExp(mime));assert.match(source.headers.get('cache-control'),/no-store/);assert.ok((await source.text()).startsWith(text));
  }
  for (const route of ['note','figure/1','figure/00','unknown','pdf/not-allowlisted.txt']) assert.equal((await fetch(`${f.url}/api/course/sources/sample/${route}`)).status,404);
  assert.equal((await fetch(`${f.url}/Notes/Example/source.pdf`)).status,404);
  assert.equal((await fetch(`${f.url}/not-allowlisted.txt`)).status,404);
  const query=await fetch(`${f.url}/api/course/sources/sample/pdf?path=../../not-allowlisted.txt`);assert.equal(query.status,200);assert.equal(Buffer.from(await query.arrayBuffer()).equals(PDF),true);
});

test('PDF GET/HEAD single-byte ranges, suffix ranges, bounds and invalid ranges',async t=>{
  const f=await fixture(t);const url=`${f.url}/api/course/sources/sample/pdf`;
  for (const [range,start,end] of [['bytes=0-7',0,7],['bytes=5-',5,PDF.length-1],['bytes=-4',PDF.length-4,PDF.length-1],['bytes=0-9999',0,PDF.length-1]]) {
    const response=await fetch(url,{headers:{Range:range}});
    assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes ${start}-${end}/${PDF.length}`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),PDF.subarray(start,end+1));
    const head=await fetch(url,{method:'HEAD',headers:{Range:range}});assert.equal(head.status,206);assert.equal(head.headers.get('content-length'),String(end-start+1));assert.equal((await head.text()).length,0);
  }
  for (const range of ['bytes=999-','bytes=8-1','bytes=-0','bytes=0-1,3-4','invalid','bytes=9007199254740992-']) { const response=await fetch(url,{headers:{Range:range}});assert.equal(response.status,416);assert.equal(response.headers.get('content-range'),`bytes */${PDF.length}`); }
  const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(PDF.length));assert.equal(await head.text(),'');
  assert.throws(()=>parseRange('bytes=0-',0));
});

test('snapshot replacement reloads; malformed/rejected update fails closed without stale private data',async t=>{
  const f=await fixture(t);assert.equal((await fetch(`${f.url}/api/course`)).status,200);
  await replaceCourse(f,'{broken json');
  for (const route of ['/api/course','/api/course/sources/sample/pdf']) {const response=await fetch(f.url+route);assert.equal(response.status,503);const text=await response.text();assert.equal(text.includes(f.spaceoRoot),false);assert.equal(text.includes(f.course.label),false);}
  assert.equal((await fetch(`${f.url}/`)).status,200);
  const updated=structuredClone(f.course);updated.label='Synthetic updated fixture';await replaceCourse(f,updated);
  const next=await (await fetch(`${f.url}/api/course`)).json();assert.equal(next.course.label,updated.label);
  updated.concepts[0].elements=['sample-explorer'];await replaceCourse(f,updated);
  assert.equal((await fetch(`${f.url}/api/course`)).status,503);
});

test('runtime rejects exact catalogue-byte drift, including a deployment changed after startup',async t=>{
  const f=await fixture(t);assert.equal((await fetch(`${f.url}/api/course`)).status,200);
  await writeFile(path.join(f.distRoot,'models','atlas.json'),f.rawCatalog+' ');
  const response=await fetch(`${f.url}/api/course`);assert.equal(response.status,503);
  assert.ok(f.errors.some(error=>/catalogue|catalog|drift|blob/i.test(error)));
});

test('source path/symlink containment fails closed both before import and after import',async t=>{
  const f=await fixture(t);assert.equal((await fetch(`${f.url}/api/course`)).status,200);
  const pdf=path.join(f.spaceoRoot,f.binding.courseSource.path);
  const outside=path.join(f.temporary,'outside.pdf');await writeFile(outside,'MUST_NOT_SERVE');await unlink(pdf);await symlink(outside,pdf);
  const response=await fetch(`${f.url}/api/course/sources/sample/pdf`);assert.equal(response.status,404);assert.equal((await response.text()).includes('MUST_NOT_SERVE'),false);
  await replaceCourse(f,f.course);assert.equal((await fetch(`${f.url}/api/course`)).status,503);
  await unlink(pdf);await writeFile(pdf,PDF);
  const invalid=structuredClone(f.course);invalid.noteBindings.sample.courseSource.path='../outside.pdf';invalid.noteBindings.sample.courseSource.route='../outside.pdf#page=7';await replaceCourse(f,invalid);
  assert.equal((await fetch(`${f.url}/api/course`)).status,503);
});

test('HTTP boundary blocks path decoding tricks, untrusted hosts/origins and writing methods',async t=>{
  const f=await fixture(t);
  for (const route of ['/api/course/sources/../sample/pdf','/api/course/sources/%2e%2e/pdf','/api/course/%5csecret','/%00','/%zz','//other-host/api/course','/../spaceo/not-allowlisted.txt']) {const response=await rawRequest(f,route);assert.equal(response.status,400,route);assert.equal(response.body.includes('MUST_NOT_SERVE'),false);}
  for (const headers of [{Host:'evil.example.invalid'},{Origin:'https://evil.example.invalid'},{'Sec-Fetch-Site':'cross-site'}]) assert.equal((await rawRequest(f,'/api/course',headers)).status,403);
  const post=await fetch(`${f.url}/api/course`,{method:'POST',body:'not an upload endpoint'});assert.equal(post.status,405);assert.equal(post.headers.get('allow'),'GET, HEAD');
});

test('private snapshot in public/dist and oversized snapshots cannot be enabled',async t=>{
  const f=await fixture(t);
  const publicFile=path.join(f.distRoot,'unsafe-course.json');await writeFile(publicFile,JSON.stringify(f.course));await unlink(f.courseFile);await symlink(publicFile,f.courseFile);
  assert.equal((await fetch(`${f.url}/api/course`)).status,503);
  assert.equal((await fetch(`${f.url}/unsafe-course.json`)).status,404);
  await writeFile(path.join(f.distRoot,'models','atlas.json'),JSON.stringify(f.course));
  assert.equal((await fetch(`${f.url}/models/atlas.json`)).status,404);
  await writeFile(path.join(f.distRoot,'models','atlas.json'),f.rawCatalog);
  await unlink(f.courseFile);await writeFile(f.courseFile,' '.repeat(2*1024*1024+1));assert.equal((await fetch(`${f.url}/api/course`)).status,503);
});


test('exact encoded binding keys round-trip from the shared source helper',async t=>{
  const f=await fixture(t);
  for (const id of ["Primer: Členitev's (A)!",'synthetic/key']) {
    const course=structuredClone(f.course);
    course.noteBindings={[id]:course.noteBindings.sample};
    for (const entry of [...course.concepts,...course.selections,...course.unmappedObjectives]) entry.noteBindingIds=[id];
    await replaceCourse(f,course);
    const route=courseSourceUrl(id,'pdf',{page:7});
    assert.ok(route.endsWith('#page=7'));
    const response=await fetch(f.url+route);assert.equal(response.status,200,id);assert.deepEqual(Buffer.from(await response.arrayBuffer()),PDF);
  }
});


test('registered exported books reuse private PDF GET/HEAD/ranges without exposing a directory', async t => {
  const exportedPath = 'Exports/Synthetic course/Book.pdf';
  const f = await fixture(t,{mutate:data=>{
    data.binding.courseSource.path = exportedPath;
    data.binding.courseSource.page = 337;
    data.binding.courseSource.route = spaceoRoute(exportedPath,{page:337});
  }});
  assert.equal((await fetch(`${f.url}/api/course`)).status,200);
  const url = `${f.url}/api/course/sources/sample/pdf`;
  const head = await fetch(url,{method:'HEAD'});
  assert.equal(head.status,200); assert.equal(Number(head.headers.get('content-length')),PDF.length);
  const range = await fetch(url,{headers:{Range:'bytes=0-4'}});
  assert.equal(range.status,206); assert.equal(await range.text(),'%PDF-');
  const full = await fetch(url); assert.deepEqual(Buffer.from(await full.arrayBuffer()),PDF);
  for (const route of ['/Exports/Synthetic%20course/Book.pdf','/api/course/sources/unregistered/pdf','/Exports/']) {
    assert.equal((await fetch(f.url+route)).status,404);
  }
});

test('Exports exception is PDF-binding only and never relaxes note, capture or traversal validation', () => {
  assert.throws(()=>validateSpaceOPath('Exports/Synthetic/Book.pdf'));
  for (const bad of ['Exports/../secret.pdf','Exports//Book.pdf','Exports/Synthetic/Book.txt','Other/Book.pdf']) {
    assert.throws(()=>validateSpaceOPath(bad,true),bad);
  }
  for (const kind of ['note','capture']) {
    const f=createCourseFixture();
    f.binding[kind].path='Exports/Synthetic/Book.pdf';
    assert.throws(()=>validateCourseOverlay(f.course,f.atlas,f.catalogBlobSha));
  }
  const f=createCourseFixture(); f.binding.figures[0].path='Exports/Synthetic/image.png';
  assert.throws(()=>validateCourseOverlay(f.course,f.atlas,f.catalogBlobSha));
});
