// Run with Node >=22.13: node --experimental-strip-types scripts/validate-course.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCourseFixture } from './course-fixture.mjs';
import { CourseValidationError, validateCourseOverlay, spaceoRoute } from '../app/course.ts';
import { AtlasLinkError, parseAtlasLink, serializeAtlasLink, resolveAtlasLink, obsidianUrl, spaceoSourceUrl, courseSourceUrl } from '../app/course-navigation.ts';

let checks = 0;
function test(name, run) {
  try { run(); checks++; }
  catch (error) { console.error(`FAIL: ${name}`); throw error; }
}
function rejectCourse(name, change, pattern) {
  test(name, () => {
    const f = createCourseFixture();
    change(f);
    assert.throws(() => validateCourseOverlay(f.course, f.atlas, f.catalogBlobSha), pattern ?? CourseValidationError);
  });
}
function repin(f) {
  const bytes = Buffer.from(JSON.stringify(f.atlas) + '\n');
  f.catalogBlobSha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  f.course.catalog.gitBlobSha = f.catalogBlobSha;
}

test('validated snapshot preserves course order and separate concept/figure laterality', () => {
  const f = createCourseFixture();
  const c = validateCourseOverlay(f.course, f.atlas, f.catalogBlobSha);
  assert.deepEqual(c.selections[0].elements, ['sample-left', 'sample-right', 'sample-midline']);
  assert.equal(c.concepts[0].laterality, 'bilateral');
  assert.equal(c.noteBindings.sample.figures[0].laterality, 'right');
  assert.equal(c.concepts[0].name, 'Synthetic pair');
  assert.deepEqual(c.concepts[0].labels, { sl: 'Primer 1', la: 'Exemplum 1' });
  assert.deepEqual(c.unmappedObjectives[0].mappingStatus, 'unmapped');
});
test('projection never exports copied capture text or arbitrary lesson fields', () => {
  const f = createCourseFixture();
  f.course.noteBindings.sample.capture.quote = 'SYNTHETIC_SENSITIVE_SENTINEL';
  f.course.lessonText = 'SYNTHETIC_SENSITIVE_SENTINEL';
  const result = validateCourseOverlay(f.course, f.atlas, f.catalogBlobSha);
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC_SENSITIVE_SENTINEL'));
  assert.equal(f.course.noteBindings.sample.capture.quote, 'SYNTHETIC_SENSITIVE_SENTINEL');
});
test('ordered selection union deduplicates genuinely overlapping catalogue concepts', () => {
  const f = createCourseFixture();
  f.atlas.concepts[1].elements.unshift('sample-right');
  repin(f);
  assert.deepEqual(validateCourseOverlay(f.course, f.atlas, f.catalogBlobSha).selections[0].elements, ['sample-left', 'sample-right', 'sample-midline']);
});
rejectCourse('unsupported schema is refused', f => { f.course.schemaVersion = 2; });
rejectCourse('unrelated course is refused', f => { f.course.courseId = 'other-course'; });
rejectCourse('privacy flag cannot be removed', f => { f.course.privateCourseMaterial = false; });
rejectCourse('authored mapping is not a generated snapshot', f => { delete f.course.routeBase; f.course.terms = f.course.concepts; delete f.course.concepts; });
rejectCourse('catalogue drift fails closed', f => { f.catalogBlobSha = 'f'.repeat(40); }, /Catalogue drift/);
rejectCourse('actual hash is mandatory', f => { f.catalogBlobSha = ''; });
rejectCourse('catalogue version drift fails closed', f => { f.atlas.version = 'Different catalogue'; });
rejectCourse('upstream English name must match', f => { f.course.concepts[0].name = 'Invented name'; });
rejectCourse('upstream mesh membership cannot be broadened', f => { f.course.concepts[0].elements = [...f.course.concepts[0].elements, 'sample-explorer']; });
rejectCourse('concept mesh order is preserved', f => { f.course.concepts[0].elements = [...f.course.concepts[0].elements].reverse(); });
rejectCourse('a missing actual catalogue mesh fails', f => { f.atlas.parts = f.atlas.parts.filter(part => part.id !== 'sample-right'); repin(f); });
rejectCourse('concept IDs must be unique', f => { f.course.concepts.push(structuredClone(f.course.concepts[0])); });
rejectCourse('duplicate catalogue identities fail', f => { f.atlas.parts.push(structuredClone(f.atlas.parts[0])); repin(f); });
rejectCourse('Slovenian and Latin labels are required', f => { delete f.course.concepts[0].labels.la; });
rejectCourse('laterality must be explicit and supported', f => { f.course.concepts[0].laterality = 'unknown'; });
rejectCourse('selection mesh order cannot be silently rearranged', f => { f.course.selections[0].elements.reverse(); });
rejectCourse('selection cannot invent another catalogue term', f => { f.course.selections[0].conceptIds.push('FMA_SYNTHETIC_EXPLORER'); });
rejectCourse('unused course terms fail', f => { f.course.selections[0].conceptIds.pop(); f.course.selections[0].elements.pop(); });
rejectCourse('duplicate selection IDs fail', f => { f.course.selections.push(structuredClone(f.course.selections[0])); });
rejectCourse('unknown evidence is never shown as professor emphasis', f => { f.course.selections[0].evidence = 'exam-required'; });
rejectCourse('reported emphasis requires an original capture route', f => { delete f.course.noteBindings.sample.capture; });
test('bonus remains a separate valid category with capture provenance', () => {
  const f = createCourseFixture();
  f.course.selections[0].evidence = 'bonus';
  assert.equal(validateCourseOverlay(f.course, f.atlas, f.catalogBlobSha).selections[0].evidence, 'bonus');
});
rejectCourse('bonus cannot bypass capture provenance', f => { f.course.selections[0].evidence = 'bonus'; delete f.course.noteBindings.sample.capture; });
for (const field of ['conceptId', 'conceptIds', 'elements', 'coordinates', 'landmark']) {
  rejectCourse(`unmapped objectives cannot claim ${field}`, f => { f.course.unmappedObjectives[0][field] = []; });
}
rejectCourse('unmapped status cannot be promoted by data alone', f => { f.course.unmappedObjectives[0].mappingStatus = 'mapped'; });
rejectCourse('unmapped context must refer to a real course selection', f => { f.course.unmappedObjectives[0].contextSelectionId = 'unknown'; });
rejectCourse('unknown source references fail', f => { f.course.concepts[0].noteBindingIds = ['missing']; });
rejectCourse('unused source bindings fail', f => { f.course.noteBindings.unused = structuredClone(f.course.noteBindings.sample); });
for (const path of ['/Notes/source.md', 'Notes/../source.md', 'Notes\\source.md', 'Other/source.md', 'Notes//source.md', 'Notes/./source.md', 'Notes/source\0.md']) {
  rejectCourse(`source path cannot escape or be ambiguous: ${JSON.stringify(path)}`, f => { f.course.noteBindings.sample.note.path = path; });
}
rejectCourse('source route cannot become a script URL', f => { f.course.noteBindings.sample.note.route = 'javascript:alert(1)'; });
rejectCourse('exact heading mismatch fails', f => { f.course.noteBindings.sample.note.heading = 'A different heading'; });
rejectCourse('PDF page must be a positive integer', f => { f.course.noteBindings.sample.courseSource.page = 0; });
rejectCourse('PDF fragment must match the bound page', f => { f.course.noteBindings.sample.courseSource.route = 'Notes/Example/source.pdf#page=8'; });
rejectCourse('attribution URLs cannot execute code', f => { f.course.provenance.software.licenseUrl = 'javascript:alert(1)'; });

const fixture = createCourseFixture();
const overlay = validateCourseOverlay(fixture.course, fixture.atlas, fixture.catalogBlobSha);
const courseLink = { mode: 'course', courseId: overlay.courseId };
test('empty hash is a distinct application default', () => {
  assert.equal(parseAtlasLink(''), null);
  assert.equal(parseAtlasLink('#'), null);
});
test('canonical reload links preserve selection, structure, mesh, camera and explicit isolate false', () => {
  const link = { ...courseLink, selectionId: 'sample-selection', structureId: 'FMA_SYNTHETIC_PAIR', meshId: 'sample-right', view: 'back', isolate: false };
  const hash = serializeAtlasLink(link);
  assert.deepEqual(parseAtlasLink(hash), link);
  assert.deepEqual(resolveAtlasLink(parseAtlasLink(hash), fixture.atlas, overlay).elements, ['sample-right']);
});
test('whole selection and bilateral structure resolve to exact meshes', () => {
  assert.deepEqual(resolveAtlasLink({ ...courseLink, selectionId: 'sample-selection' }, fixture.atlas, overlay).elements, ['sample-left', 'sample-right', 'sample-midline']);
  assert.deepEqual(resolveAtlasLink({ ...courseLink, structureId: 'FMA_SYNTHETIC_PAIR' }, fixture.atlas, overlay).elements, ['sample-left', 'sample-right']);
});
test('unmapped objectives always have zero highlighted meshes, including explicit context', () => {
  const link = { ...courseLink, objectiveId: 'sample-unmapped' };
  const plain = resolveAtlasLink(parseAtlasLink(serializeAtlasLink(link)), fixture.atlas, overlay);
  assert.deepEqual(plain.elements, []);
  assert.equal(plain.contextElements, undefined);
  const context = resolveAtlasLink(parseAtlasLink(serializeAtlasLink({ ...link, context: true })), fixture.atlas, overlay);
  assert.deepEqual(context.elements, []);
  assert.deepEqual(context.contextElements, ['sample-left', 'sample-right', 'sample-midline']);
});
test('explorer links retain catalogue structures outside the course and need no course deployment', () => {
  const link = { mode: 'explorer', structureId: 'FMA_SYNTHETIC_EXPLORER', meshId: 'sample-explorer' };
  assert.deepEqual(parseAtlasLink(serializeAtlasLink(link)), link);
  assert.deepEqual(resolveAtlasLink(link, fixture.atlas, null).elements, ['sample-explorer']);
  assert.deepEqual(parseAtlasLink('#explorer=1'), { mode: 'explorer' });
});
test('unknown or inconsistent targets fail without silently selecting other geometry', () => {
  for (const link of [
    { ...courseLink, selectionId: 'missing' },
    { ...courseLink, objectiveId: 'missing' },
    { ...courseLink, structureId: 'FMA_SYNTHETIC_EXPLORER' },
    { ...courseLink, meshId: 'sample-explorer' },
    { ...courseLink, structureId: 'FMA_SYNTHETIC_PAIR', meshId: 'sample-midline' },
    { mode: 'explorer', structureId: 'missing' },
    { mode: 'explorer', meshId: 'missing' },
  ]) assert.throws(() => resolveAtlasLink(link, fixture.atlas, overlay), AtlasLinkError);
  assert.throws(() => resolveAtlasLink(courseLink, fixture.atlas, null), /not available/);
});
test('ambiguous, malformed and unsupported URLs fail', () => {
  for (const hash of [
    '#course=x&course=y', '#course=x&explorer=1', '#course=', '#selection=x', '#objective=x',
    '#course=x&objective=y&structure=z', '#course=x&objective=y&selection=z', '#course=x&context=1',
    '#explorer=0', '#view=diagonal', '#isolate=yes', '#course=x&objective=y&context=0', '#unexpected=1', '#structure=%ZZ',
  ]) assert.throws(() => parseAtlasLink(hash), AtlasLinkError, hash);
});
test('exact source route encoding matches Python exporter semantics', () => {
  assert.equal(spaceoRoute("Notes/Example/Živ test (sample).md", { heading: "Členitev: 'sample' (A)" }), 'Notes/Example/%C5%BDiv%20test%20%28sample%29.md#%C4%8Clenitev%3A%20%27sample%27%20%28A%29');
  assert.equal(spaceoRoute('Notes/Example/source.pdf', { page: 7 }), 'Notes/Example/source.pdf#page=7');
  assert.equal(spaceoRoute('Notes/Example/100% #sample.png'), 'Notes/Example/100%25%20%23sample.png');
});
test('Obsidian exact heading is encoded within the vault-relative file parameter once', () => {
  assert.equal(obsidianUrl(fixture.binding.note.path, 'Test vault', { heading: fixture.binding.note.heading }), 'obsidian://open?vault=Test%20vault&file=Example%2F%C5%BDiv%20test%20%28sample%29.md%23%C4%8Clenitev%3A%20%27sample%27%20%28A%29');
  const repoVault = new URL(obsidianUrl(fixture.binding.note.path, 'Test', { vaultRoot: '' }));
  assert.equal(repoVault.searchParams.get('file'), fixture.binding.note.path);
  const innerVault = new URL(obsidianUrl(fixture.binding.note.path, 'Test', { vaultRoot: 'Notes/Example' }));
  assert.equal(innerVault.searchParams.get('file'), 'Živ test (sample).md');
  assert.throws(() => obsidianUrl(fixture.binding.note.path, 'Test', { vaultRoot: 'Notes/Other' }), /outside/);
  assert.throws(() => obsidianUrl(fixture.binding.note.path, ''), /Vault name/);
});
test('configured existing web note routes preserve exact headings under their base path', () => {
  const route = fixture.binding.note.route;
  assert.equal(spaceoSourceUrl(route, 'https://example.invalid/spaceo'), `https://example.invalid/spaceo/${route}`);
  assert.equal(spaceoSourceUrl(route, '/spaceo/'), `/spaceo/${route}`);
  for (const base of ['javascript:alert(1)', 'data:text/plain,sample', '//outside.example', 'https://user:secret@example.invalid', '/source?token=123']) assert.throws(() => spaceoSourceUrl(route, base), AtlasLinkError);
  for (const invalid of ['Notes/%2E%2E/secret.md', '/Notes/source.md', 'Notes/Example/source.pdf#page=0']) assert.throws(() => spaceoSourceUrl(invalid, '/spaceo'));
});
test('asset links use binding-key allowlists and exact PDF page anchors', () => {
  assert.equal(courseSourceUrl('sample', 'pdf', { page: 7 }), '/api/course/sources/sample/pdf#page=7');
  assert.equal(courseSourceUrl('sample', 'figure'), '/api/course/sources/sample/figure/0');
  assert.equal(courseSourceUrl('sample', 'figure', { index: 2 }), '/api/course/sources/sample/figure/2');
  assert.equal(courseSourceUrl('sample', 'capture'), '/api/course/sources/sample/capture');
  assert.throws(() => courseSourceUrl('..', 'pdf'), /binding ID/);
  assert.throws(() => courseSourceUrl('sample', 'figure', { index: -1 }), /index/);
  assert.throws(() => courseSourceUrl('sample', 'capture', { page: 1 }), /page/);
});

console.log(`Course validation: ${checks} checks passed (public synthetic fixtures only).`);
