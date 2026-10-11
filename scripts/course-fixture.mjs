// Public synthetic fixture. No SpaceO terms, captures, course labels, or teaching assets.
import { createHash } from 'node:crypto';
import { spaceoRoute } from '../app/course.ts';

export function createCourseFixture() {
  const part = (id, conceptId) => ({ id, name: `Synthetic ${id}`, conceptId, system: 'skeletal', chunk: 0, positions: 0, normals: 0, indices: 0, vertexCount: 0, indexCount: 0, bounds: [[0, 0, 0], [1, 1, 1]] });
  const atlas = {
    version: 'Synthetic catalogue 1',
    parts: [part('sample-left', 'FMA_SYNTHETIC_PAIR'), part('sample-right', 'FMA_SYNTHETIC_PAIR'), part('sample-midline', 'FMA_SYNTHETIC_MIDLINE'), part('sample-explorer', 'FMA_SYNTHETIC_EXPLORER')],
    concepts: [
      { id: 'FMA_SYNTHETIC_PAIR', name: 'Synthetic pair', elements: ['sample-left', 'sample-right'] },
      { id: 'FMA_SYNTHETIC_MIDLINE', name: 'Synthetic midline', elements: ['sample-midline'] },
      { id: 'FMA_SYNTHETIC_EXPLORER', name: 'Synthetic explorer', elements: ['sample-explorer'] },
    ],
    chunks: [], triangles: 0,
  };
  const rawCatalog = JSON.stringify(atlas) + '\n';
  const catalogBytes = Buffer.from(rawCatalog);
  const catalogBlobSha = createHash('sha1').update(`blob ${catalogBytes.length}\0`).update(catalogBytes).digest('hex');
  const notePath = "Notes/Example/Živ test (sample).md";
  const heading = "Členitev: 'sample' (A)";
  const pdfPath = 'Notes/Example/source.pdf';
  const figurePath = 'Notes/Example/figure.png';
  const capturePath = 'Notes/Example/capture.txt';
  const binding = {
    note: { path: notePath, heading, route: spaceoRoute(notePath, { heading }) },
    courseSource: { path: pdfPath, page: 7, route: spaceoRoute(pdfPath, { page: 7 }) },
    figures: [{ path: figurePath, laterality: 'right', route: spaceoRoute(figurePath) }],
    capture: { path: capturePath, route: spaceoRoute(capturePath) },
  };
  const course = {
    schemaVersion: 1, courseId: 'spaceo-uni-anatomija', label: 'Synthetic integration fixture', locale: 'sl',
    scopeNote: 'Synthetic fixture only; not course material.', privateCourseMaterial: true, routeBase: 'spaceo-repository-root',
    sourceInput: { path: 'Notes/Example/course.json', sha256: '2'.repeat(64) },
    catalog: { repositoryUrl: 'https://example.invalid/atlas', ref: '1'.repeat(40), path: 'public/models/atlas.json', gitBlobSha: catalogBlobSha, version: atlas.version },
    provenance: {
      software: { name: 'Synthetic software', license: 'MIT', licenseUrl: 'https://example.invalid/license' },
      models: { name: 'Synthetic data', creator: 'Fixture author', license: 'CC-BY-4.0', licenseUrl: 'https://example.invalid/data-license', datasetUrl: 'https://example.invalid/data', adaptationAttributionUrl: 'https://example.invalid/attribution' },
      labels: { source: 'Synthetic examples', identifierNamespace: 'Fictional test identifiers' },
    },
    noteBindings: { sample: binding },
    concepts: atlas.concepts.slice(0, 2).map((concept, index) => ({ ...concept, labels: { sl: `Primer ${index + 1}`, la: `Exemplum ${index + 1}` }, laterality: index === 0 ? 'bilateral' : 'midline', noteBindingIds: ['sample'] })),
    selections: [{ id: 'sample-selection', label: 'Synthetic ordered selection', conceptIds: ['FMA_SYNTHETIC_PAIR', 'FMA_SYNTHETIC_MIDLINE'], elements: ['sample-left', 'sample-right', 'sample-midline'], noteBindingIds: ['sample'], evidence: 'student-reported-emphasis', orderDescription: 'Synthetic pair, then midline.' }],
    unmappedObjectives: [{ id: 'sample-unmapped', labels: { sl: 'Primer brez preslikave', la: 'Exemplum' }, mappingStatus: 'unmapped', reason: 'No separate synthetic mesh.', noteBindingIds: ['sample'], evidence: 'student-reported-emphasis', contextSelectionId: 'sample-selection' }],
  };
  return { atlas, course, rawCatalog, catalogBytes, catalogBlobSha, binding };
}
