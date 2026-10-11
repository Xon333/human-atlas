// Read-only compatibility check against a private SpaceO export. No course data is logged.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {validateCourseOverlay} from '../app/course.ts';
import {resolveAtlasLink} from '../app/course-navigation.ts';

const [coursePath, referencePath] = process.argv.slice(2);
assert.ok(coursePath && referencePath, 'Usage: node --experimental-strip-types scripts/validate-course-compatibility.mjs <private-export.json> <accepted-atlas.json>');
const sha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const originalBytes = await readFile(referencePath);
const candidateBytes = await readFile(new URL('../public/models/atlas.json', import.meta.url));
const original = JSON.parse(originalBytes), candidate = JSON.parse(candidateBytes);
const input = JSON.parse(await readFile(coursePath));
const accepted = validateCourseOverlay(input, original, sha(originalBytes));
const repinned = structuredClone(input);
repinned.catalog.gitBlobSha = sha(candidateBytes);
const next = validateCourseOverlay(repinned, candidate, sha(candidateBytes));
const normalized = structuredClone(next);
normalized.catalog.gitBlobSha = accepted.catalog.gitBlobSha;
assert.ok(isDeepStrictEqual(normalized, structuredClone(accepted)), 'Repacking must not change any course targets, names, labels, evidence, source links or their order');
let routes = 0;
for (const selection of accepted.selections) {
  const base = {mode:'course', courseId:accepted.courseId, selectionId:selection.id};
  for (const link of [base, ...selection.conceptIds.map(structureId => ({...base, structureId}))]) {
    assert.ok(isDeepStrictEqual(resolveAtlasLink(link, candidate, next), resolveAtlasLink(link, original, accepted)), 'A taught route changed its resolved anatomy');
    routes++;
  }
}
for (const objective of accepted.unmappedObjectives) {
  const link = {mode:'course', courseId:accepted.courseId, objectiveId:objective.id, context:true};
  assert.ok(isDeepStrictEqual(resolveAtlasLink(link, candidate, next), resolveAtlasLink(link, original, accepted)), 'An objective context changed its resolved anatomy');
  routes++;
}
console.log(JSON.stringify({status:'passed', selections:next.selections.length, routes, originalCatalogBlob:sha(originalBytes), candidateCatalogBlob:sha(candidateBytes), scope:'Private export unchanged except proposed catalogue pin; serving inputs not written.'}));
