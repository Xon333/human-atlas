#!/usr/bin/env node
/** Check the private course bundle with the actual Human Atlas consumer.
 * Run after export-course.py; no packages, browser, generated fixtures or installs.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const args = process.argv.slice(2);
assert.equal(args.length, 2, 'Usage: node --experimental-strip-types scripts/verify-course-consumer.mjs --bundle /private/bundle');
assert.equal(args[0], '--bundle');
const root = path.resolve(args[1]);
const atlasRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [{validateCourseOverlay}, {parseAtlasLink, serializeAtlasLink, resolveAtlasLink}, {partSide, regionElements}] = await Promise.all([
  import(pathToFileURL(path.join(atlasRoot, 'app/course.ts')).href),
  import(pathToFileURL(path.join(atlasRoot, 'app/course-navigation.ts')).href),
  import(pathToFileURL(path.join(atlasRoot, 'app/study-region.ts')).href),
]);
const [catalogRaw, snapshotRaw] = await Promise.all([
  readFile(path.join(atlasRoot, 'public/models/atlas.json')),
  readFile(path.join(root, 'course.json')),
]);
const atlas = JSON.parse(catalogRaw);
const snapshot = JSON.parse(snapshotRaw);
const catalogSha = createHash('sha1').update(`blob ${catalogRaw.length}\0`).update(catalogRaw).digest('hex');
const course = validateCourseOverlay(snapshot, atlas, catalogSha);
const receipt = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
assert.equal(createHash('sha256').update(snapshotRaw).digest('hex'), receipt.courseSha256, 'Export hash differs from the producer receipt');
assert.equal(course.sourceInput.sha256, receipt.course.sha256);
assert.equal(catalogSha, receipt.catalogBlobSha);
assert.deepEqual(course.concepts.map(item => item.id), receipt.termIds, 'Regional context must not manufacture course terms');
assert.deepEqual(course.unmappedObjectives.map(item => item.id), receipt.objectiveIds);

const parts = new Map(atlas.parts.map(part => [part.id, part]));
const base = {mode: 'course', courseId: course.courseId};
let meshLinks = 0;
const regions = [];
for (const selection of course.selections) {
  assert.ok(selection.region, `${selection.id}: missing authored regional context`);
  const initial = resolveAtlasLink({...base, selectionId: selection.id}, atlas, course);
  assert.ok(initial.scopeElements.length, `${selection.id}: initial view is empty`);
  assert.ok(selection.elements.some(id => initial.scopeElements.includes(id)), `${selection.id}: default side/layer hides every taught target`);
  assert.equal(initial.isolate, undefined);
  assert.equal(initial.side, selection.region.defaultSide);
  assert.equal(initial.layer, selection.region.defaultLayer);

  for (const side of ['right', 'left', 'both']) for (const layer of ['bones', 'muscles', 'all']) {
    const link = {...base, selectionId: selection.id, side, layer};
    assert.deepEqual(parseAtlasLink(serializeAtlasLink(link)), link);
    const view = resolveAtlasLink(link, atlas, course);
    assert.deepEqual(view.scopeElements, regionElements(atlas, selection.region.elements, side, layer));
    assert.ok(view.scopeElements.every(id => side === 'both' || !partSide(parts.get(id)) || partSide(parts.get(id)) === side));
  }
  for (const id of selection.region.elements) {
    const part = parts.get(id);
    assert.ok(part, `${selection.id}: missing ${id}`);
    const link = {...base, selectionId: selection.id, structureId: part.conceptId, meshId: id};
    const resolved = resolveAtlasLink(parseAtlasLink(serializeAtlasLink(link)), atlas, course);
    assert.deepEqual(resolved.elements, [id]);
    assert.ok(resolved.scopeElements.includes(id));
    assert.ok(resolved.scopeElements.length > 1, `${selection.id}/${id}: contextual pick isolated one mesh`);
    assert.equal(resolved.isolate, undefined);
    meshLinks++;
  }
  regions.push({id: selection.id, label: selection.region.label, defaultMeshes: initial.scopeElements.length, contextMeshes: selection.region.elements.length});
}
for (const objective of course.unmappedObjectives) for (const context of [false, true]) {
  const link = {...base, objectiveId: objective.id, ...(context ? {context: true} : {})};
  const view = resolveAtlasLink(parseAtlasLink(serializeAtlasLink(link)), atlas, course);
  assert.deepEqual(view.elements, [], `${objective.id}: an unmapped objective gained a target highlight`);
  assert.equal(Boolean(view.contextElements), context);
}

// Canonical notes stay on M1; the bundle carries exact native links, not note bodies.
for (const [id, binding] of Object.entries(course.noteBindings)) {
  assert.equal(binding.note.canonicalUrl, receipt.noteLinks[id], `${id}: canonical note destination lost`);
  const url = new URL(binding.note.canonicalUrl);
  assert.equal(url.protocol, 'obsidian:');
  assert.ok(url.searchParams.get('file').split('#').slice(1).join('#'), `${id}: canonical heading absent`);
}
console.log(JSON.stringify({courseConcepts: course.concepts.length, selections: course.selections.length, unmappedObjectives: course.unmappedObjectives.length, meshLinks, canonicalNoteLinks: Object.keys(receipt.noteLinks).length, regions}, null, 2));
