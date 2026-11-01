#!/usr/bin/env node
/** Exercise registered real private sources through the actual Atlas runtime on loopback.
 * No deployment, copied private assets, external listener or browser is required.
 */
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp, mkdir, copyFile, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const args = process.argv.slice(2);
assert.equal(args.length, 2, 'Usage: node --experimental-strip-types scripts/verify-course-sources.mjs --bundle /private/bundle');
assert.equal(args[0], '--bundle');
const root = path.resolve(args[1]);
const atlasRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {createPrivateServer} = await import(pathToFileURL(path.join(atlasRoot,'server/private-runtime.mjs')).href);
const temp = await mkdtemp(path.join(os.tmpdir(),'atlas-source-check-'));
let server;
try {
  const distRoot = path.join(temp,'dist');
  await mkdir(path.join(distRoot,'models'),{recursive:true});
  await copyFile(path.join(atlasRoot,'public/models/atlas.json'),path.join(distRoot,'models/atlas.json'));
  await writeFile(path.join(distRoot,'index.html'),'<title>Source check only</title>');
  const created = await createPrivateServer({repoRoot:atlasRoot,distRoot,host:'127.0.0.1',port:0,sourceRoot:root,courseFile:path.join(root,'course.json')});
  server = created.server;
  assert.equal(created.courseStatus,'ready');
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base+'/api/course'); assert.equal(response.status,200);
  const {course} = await response.json();
  const unique = new Map(); let bindings=0, figures=0;
  for (const [id,binding] of Object.entries(course.noteBindings)) {
    const prefix = `/api/course/sources/${encodeURIComponent(id)}`;
    const head = await fetch(base+prefix+'/pdf',{method:'HEAD'});
    assert.equal(head.status,200,`${id}: PDF HEAD`);
    assert.equal(head.headers.get('content-type'),'application/pdf');
    assert.ok(Number(head.headers.get('content-length'))>0);
    assert.match(head.headers.get('cache-control'),/no-store/);
    bindings++;
    if (!unique.has(binding.courseSource.path)) {
      const range = await fetch(base+prefix+'/pdf',{headers:{Range:'bytes=0-4'}});
      assert.equal(range.status,206,`${id}: PDF range`);
      assert.equal(await range.text(),'%PDF-',`${id}: PDF signature`);
      unique.set(binding.courseSource.path,Number(head.headers.get('content-length')));
    }
    for (let i=0;i<binding.figures.length;i++) {
      const image = await fetch(base+prefix+`/figure/${i}`,{method:'HEAD'});
      assert.equal(image.status,200,`${id}: figure ${i}`);
      assert.match(image.headers.get('content-type'),/^image\//); figures++;
    }
    if (binding.capture) {
      const capture = await fetch(base+prefix+'/capture');
      assert.equal(capture.status,200,`${id}: capture GET`);
      assert.match(capture.headers.get('content-type'),/^text\/markdown/);
      assert.deepEqual(Buffer.from(await capture.arrayBuffer()), await readFile(path.join(root,binding.capture.path)));
    }
  }
  for (const route of ['/Exports/','/Notes/','/api/course/sources/unregistered/pdf']) {
    const blocked = await fetch(base+route); assert.equal(blocked.status,404,route); await blocked.arrayBuffer();
  }
  console.log(JSON.stringify({courseConcepts:course.concepts.length,selections:course.selections.length,pdfBindings:bindings,uniquePdfs:unique.size,figureBindings:figures,privateDirectoryExposure:false}));
} finally {
  if (server) {server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));}
  await rm(temp,{recursive:true,force:true});
}
