import type { Atlas, Concept } from './anatomy';
import type {StudyRegion, StudySide, StudyLayer} from './study-region';

export const SPACE_O_COURSE_ID = 'spaceo-uni-anatomija';
export type Evidence = 'course-material' | 'student-reported-emphasis' | 'bonus';
export type Laterality = 'right' | 'left' | 'bilateral' | 'midline';
export interface CourseLabels { sl: string; la: string }
export interface SourceFile { path: string; route: string }
export interface NoteSource extends SourceFile { heading: string }
export interface PdfSource extends SourceFile { page: number }
export interface FigureSource extends SourceFile { laterality?: Laterality }
export interface NoteBinding {
  note: NoteSource;
  courseSource: PdfSource;
  figures: FigureSource[];
  capture?: SourceFile;
}
export interface CourseConcept extends Concept {
  labels: CourseLabels;
  laterality: Laterality;
  noteBindingIds: string[];
}
export interface CourseSelection {
  region?: StudyRegion;
  id: string;
  label: string;
  conceptIds: string[];
  elements: string[];
  noteBindingIds: string[];
  evidence: Evidence;
  orderDescription?: string;
}
export interface UnmappedObjective {
  id: string;
  labels: CourseLabels;
  mappingStatus: 'unmapped';
  reason: string;
  noteBindingIds: string[];
  evidence: Evidence;
  contextSelectionId: string;
  shortLabel?: string;
}
export interface CourseOverlay {
  schemaVersion: 1;
  courseId: typeof SPACE_O_COURSE_ID;
  label: string;
  locale: string;
  scopeNote: string;
  privateCourseMaterial: true;
  routeBase: 'spaceo-repository-root';
  sourceInput: { path: string; sha256: string };
  catalog: { repositoryUrl: string; ref: string; path: string; gitBlobSha: string; version: string };
  provenance: {
    software: { name: string; license: string; licenseUrl: string };
    models: { name: string; creator: string; license: string; licenseUrl: string; datasetUrl: string; adaptationAttributionUrl: string };
    labels: { source: string; identifierNamespace: string };
  };
  noteBindings: Record<string, NoteBinding>;
  concepts: CourseConcept[];
  selections: CourseSelection[];
  unmappedObjectives: UnmappedObjective[];
}
export interface CourseLinks {
  vaultName: string | null;
  vaultRoot: string;
  noteBaseUrl: string | null;
}
export interface CourseRuntimeResponse { course: CourseOverlay; catalogBlobSha: string; links: CourseLinks }

export class CourseValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'CourseValidationError'; }
}
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CourseValidationError(message);
}
function object(value: unknown, context: string): Record<string, unknown> {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), `${context}: expected an object`);
  return value as Record<string, unknown>;
}
function text(value: unknown, context: string): string {
  requireValue(typeof value === 'string' && value.trim().length > 0, `${context}: expected nonempty text`);
  return value;
}
function list(value: unknown, context: string, empty = false): unknown[] {
  requireValue(Array.isArray(value) && (empty || value.length > 0), `${context}: expected ${empty ? 'a' : 'a nonempty'} list`);
  return value;
}
function strings(value: unknown, context: string): string[] {
  const result = list(value, context).map(item => text(item, context));
  requireValue(new Set(result).size === result.length, `${context}: duplicate values`);
  return result;
}
function equalList(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((item, index) => item === expected[index]);
}
function labels(value: unknown, context: string): CourseLabels {
  const item = object(value, `${context}.labels`);
  return { sl: text(item.sl, `${context}.labels.sl`), la: text(item.la, `${context}.labels.la`) };
}
function laterality(value: unknown, context: string): Laterality {
  requireValue(['right', 'left', 'bilateral', 'midline'].includes(value as string), `${context}: invalid laterality`);
  return value as Laterality;
}
function httpsUrl(value: unknown, context: string): string {
  const result = text(value, context);
  let url: URL;
  try { url = new URL(result); } catch { throw new CourseValidationError(`${context}: invalid URL`); }
  requireValue(url.protocol === 'https:' && !url.username && !url.password, `${context}: expected an HTTPS URL`);
  return result;
}

// Matches urllib.parse.quote(..., safe='') used by SpaceO's exporter.
export function encodeCourseText(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
export function validateSpaceOPath(value: unknown): string {
  const path = text(value, 'SpaceO path');
  const parts = path.split('/');
  requireValue(parts.length > 1 && parts[0] === 'Notes' && !path.includes('\\') && !/[\u0000-\u001f\u007f]/u.test(path) && parts.every(part => part !== '' && part !== '.' && part !== '..'), 'SpaceO path: expected a relative file beneath Notes/');
  return path;
}
export function spaceoRoute(path: string, options: { heading?: string; page?: number } = {}): string {
  validateSpaceOPath(path);
  requireValue(!(options.heading !== undefined && options.page !== undefined), 'A source route cannot have both a heading and a page');
  let route = path.split('/').map(encodeCourseText).join('/');
  if (options.heading !== undefined) route += `#${encodeCourseText(text(options.heading, 'Source heading'))}`;
  if (options.page !== undefined) {
    requireValue(Number.isSafeInteger(options.page) && options.page > 0, 'Source page must be a positive integer');
    route += `#page=${options.page}`;
  }
  return route;
}
function source(value: unknown, context: string, kind: 'note' | 'pdf' | 'figure' | 'capture'): SourceFile | NoteSource | PdfSource | FigureSource {
  const item = object(value, context);
  const path = validateSpaceOPath(item.path);
  const result: SourceFile = { path, route: text(item.route, `${context}.route`) };
  if (kind === 'note') {
    requireValue(path.endsWith('.md'), `${context}: expected Markdown`);
    const heading = text(item.heading, `${context}.heading`);
    requireValue(result.route === spaceoRoute(path, { heading }), `${context}: route must preserve the exact encoded heading`);
    return { ...result, heading };
  }
  if (kind === 'pdf') {
    requireValue(path.toLowerCase().endsWith('.pdf'), `${context}: expected PDF`);
    const page = item.page;
    requireValue(typeof page === 'number' && Number.isSafeInteger(page) && page > 0, `${context}: invalid page`);
    requireValue(result.route === spaceoRoute(path, { page }), `${context}: route must preserve the exact PDF page`);
    return { ...result, page };
  }
  requireValue(result.route === spaceoRoute(path), `${context}: invalid encoded source route`);
  if (kind === 'figure' && item.laterality !== undefined) return { ...result, laterality: laterality(item.laterality, context) };
  return result;
}

/** Validate a generated snapshot against the actual catalogue; never accept authored terms as a snapshot.
 * The runtime supplies the Git blob SHA-1 computed over exact catalogue bytes. A browser can also
 * compute it with Web Crypto; an HTTP LAN browser relies on the trusted runtime and these membership checks.
 * The returned projection intentionally excludes unsupported fields and copied capture text.
 */
export function validateCourseOverlay(input: unknown, atlas: Atlas, catalogBlobSha: string): CourseOverlay {
  const course = object(input, 'Course');
  requireValue(course.schemaVersion === 1, 'Unsupported course schemaVersion');
  requireValue(course.courseId === SPACE_O_COURSE_ID, 'Unsupported courseId');
  requireValue(course.privateCourseMaterial === true, 'Private course material flag must remain true');
  requireValue(course.routeBase === 'spaceo-repository-root', 'Unsupported course routeBase; import the generated snapshot');
  const catalog = object(course.catalog, 'catalog');
  requireValue(/^[0-9a-f]{40}$/.test(catalogBlobSha), 'Actual catalogue Git blob SHA is required');
  requireValue(catalog.gitBlobSha === catalogBlobSha, 'Catalogue drift: regenerate only after reviewing the actual catalogue mapping');
  requireValue(catalog.version === atlas.version, 'Catalogue version does not match');
  requireValue(catalog.path === 'public/models/atlas.json', 'Unsupported catalogue path');
  const catalogRef = text(catalog.ref, 'catalog.ref');
  requireValue(/^[0-9a-f]{40}$/.test(catalogRef), 'catalog.ref: expected a commit SHA');
  const sourceInput = object(course.sourceInput, 'sourceInput');
  const sourcePath = validateSpaceOPath(sourceInput.path);
  requireValue(sourcePath.endsWith('.json'), 'sourceInput.path: expected authored JSON');
  const sourceSha = text(sourceInput.sha256, 'sourceInput.sha256');
  requireValue(/^[0-9a-f]{64}$/.test(sourceSha), 'sourceInput.sha256: expected SHA-256');
  requireValue(Array.isArray(atlas.concepts) && Array.isArray(atlas.parts), 'Invalid atlas catalogue');
  const catalogueConcepts = new Map(atlas.concepts.map(concept => [concept.id, concept]));
  const meshIds = new Set(atlas.parts.map(part => part.id));
  requireValue(catalogueConcepts.size === atlas.concepts.length && meshIds.size === atlas.parts.length, 'Duplicate catalogue identities');
  const bindingEntries = Object.entries(object(course.noteBindings, 'noteBindings'));
  requireValue(bindingEntries.length > 0, 'noteBindings cannot be empty');
  const bindings: Record<string, NoteBinding> = Object.create(null);
  for (const [id, raw] of bindingEntries) {
    text(id, 'Binding ID');
    const item = object(raw, `binding ${id}`);
    bindings[id] = {
      note: source(item.note, `${id}.note`, 'note') as NoteSource,
      courseSource: source(item.courseSource, `${id}.courseSource`, 'pdf') as PdfSource,
      figures: list(item.figures, `${id}.figures`, true).map(figure => source(figure, `${id}.figure`, 'figure') as FigureSource),
      ...(item.capture !== undefined ? { capture: source(item.capture, `${id}.capture`, 'capture') as SourceFile } : {}),
    };
  }
  const usedBindings = new Set<string>();
  const bindingIds = (value: unknown, context: string): string[] => {
    const ids = strings(value, `${context}.noteBindingIds`);
    for (const id of ids) { requireValue(Object.hasOwn(bindings, id), `${context}: unknown note binding ${id}`); usedBindings.add(id); }
    return ids;
  };
  const evidence = (item: Record<string, unknown>, ids: string[], context: string): Evidence => {
    requireValue(['course-material', 'student-reported-emphasis', 'bonus'].includes(item.evidence as string), `${context}: invalid evidence category`);
    if (item.evidence !== 'course-material') requireValue(ids.some(id => bindings[id].capture), `${context}: reported emphasis or bonus requires an original capture`);
    return item.evidence as Evidence;
  };
  const conceptIds = new Set<string>();
  const concepts = list(course.concepts, 'concepts').map(raw => {
    const item = object(raw, 'Course concept');
    const id = text(item.id, 'Course concept.id');
    requireValue(!conceptIds.has(id), `Duplicate course concept ${id}`);
    conceptIds.add(id);
    const original = catalogueConcepts.get(id);
    requireValue(original, `Unknown catalogue concept ${id}`);
    const name = text(item.name, `${id}.name`);
    const elements = strings(item.elements, `${id}.elements`);
    requireValue(name === original.name && equalList(elements, original.elements), `${id}: name or mesh membership differs from the catalogue`);
    requireValue(elements.every(element => meshIds.has(element)), `${id}: unknown mesh ID`);
    return { id, name, elements, labels: labels(item.labels, id), laterality: laterality(item.laterality, id), noteBindingIds: bindingIds(item.noteBindingIds, id) };
  });
  const selectedConcepts = new Set<string>();
  const selectionIds = new Set<string>();
  const selections = list(course.selections, 'selections').map(raw => {
    const item = object(raw, 'Selection');
    const id = text(item.id, 'Selection.id');
    requireValue(!selectionIds.has(id), `Duplicate selection ${id}`);
    selectionIds.add(id);
    const ids = strings(item.conceptIds, `${id}.conceptIds`);
    const expectedElements: string[] = [];
    const seen = new Set<string>();
    for (const conceptId of ids) {
      requireValue(conceptIds.has(conceptId), `${id}: unknown course concept ${conceptId}`);
      selectedConcepts.add(conceptId);
      for (const element of catalogueConcepts.get(conceptId)!.elements) if (!seen.has(element)) { seen.add(element); expectedElements.push(element); }
    }
    const elements = strings(item.elements, `${id}.elements`);
    requireValue(equalList(elements, expectedElements), `${id}: selection meshes must be the ordered, deduplicated concept union`);
    const noteBindingIds = bindingIds(item.noteBindingIds, id);
    let region: StudyRegion | undefined;
    if (item.region !== undefined) {
      const input = object(item.region, `${id}.region`);
      const regionConcepts = strings(input.conceptIds, `${id}.region.conceptIds`);
      const expected: string[] = [];
      const seen = new Set<string>();
      for (const key of regionConcepts) {
        const concept = catalogueConcepts.get(key);
        requireValue(concept, `${id}: unknown regional catalogue concept ${key}`);
        for (const mesh of concept.elements) {
          requireValue(meshIds.has(mesh), `${id}: unknown regional mesh ${mesh}`);
          if (!seen.has(mesh)) { seen.add(mesh); expected.push(mesh); }
        }
      }
      const regionMeshes = strings(input.elements, `${id}.region.elements`);
      requireValue(equalList(regionMeshes, expected), `${id}: regional meshes must match their catalogue union`);
      requireValue(elements.every(mesh => seen.has(mesh)), `${id}: region must contain every taught target`);
      requireValue(['right','left','both'].includes(input.defaultSide as string), `${id}: invalid regional side`);
      requireValue(['bones','muscles','all'].includes(input.defaultLayer as string), `${id}: invalid regional layer`);
      region = {conceptIds: regionConcepts, elements: regionMeshes, defaultSide: input.defaultSide as StudySide, defaultLayer: input.defaultLayer as StudyLayer, ...(input.label !== undefined ? {label: text(input.label, `${id}.region.label`)} : {})};
    }
    return { id, label: text(item.label, `${id}.label`), conceptIds: ids, elements, noteBindingIds, evidence: evidence(item, noteBindingIds, id), ...(region ? {region} : {}), ...(item.orderDescription !== undefined ? { orderDescription: text(item.orderDescription, `${id}.orderDescription`) } : {}) };
  });
  requireValue(selectedConcepts.size === conceptIds.size, 'Some course concepts are unused by selections');
  const objectiveIds = new Set<string>();
  const unmappedObjectives = list(course.unmappedObjectives, 'unmappedObjectives', true).map(raw => {
    const item = object(raw, 'Unmapped objective');
    const id = text(item.id, 'Objective.id');
    requireValue(!objectiveIds.has(id), `Duplicate objective ${id}`);
    objectiveIds.add(id);
    requireValue(!['conceptId', 'conceptIds', 'elements', 'coordinates', 'landmark'].some(key => Object.hasOwn(item, key)), `${id}: unmapped objectives cannot claim catalogue IDs or geometry`);
    requireValue(item.mappingStatus === 'unmapped', `${id}: expected mappingStatus=unmapped`);
    const contextSelectionId = text(item.contextSelectionId, `${id}.contextSelectionId`);
    requireValue(selectionIds.has(contextSelectionId), `${id}: unknown context selection`);
    const noteBindingIds = bindingIds(item.noteBindingIds, id);
    return { id, labels: labels(item.labels, id), mappingStatus: 'unmapped' as const, reason: text(item.reason, `${id}.reason`), noteBindingIds, evidence: evidence(item, noteBindingIds, id), contextSelectionId, ...(item.shortLabel !== undefined ? { shortLabel: text(item.shortLabel, `${id}.shortLabel`) } : {}) };
  });
  requireValue(usedBindings.size === bindingEntries.length, 'Some note bindings are unused');
  const provenance = object(course.provenance, 'provenance');
  const software = object(provenance.software, 'provenance.software');
  const models = object(provenance.models, 'provenance.models');
  const labelSource = object(provenance.labels, 'provenance.labels');
  return {
    schemaVersion: 1, courseId: SPACE_O_COURSE_ID, privateCourseMaterial: true, routeBase: 'spaceo-repository-root',
    label: text(course.label, 'label'), locale: text(course.locale, 'locale'), scopeNote: text(course.scopeNote, 'scopeNote'),
    sourceInput: { path: sourcePath, sha256: sourceSha },
    catalog: { repositoryUrl: httpsUrl(catalog.repositoryUrl, 'catalog.repositoryUrl'), ref: catalogRef, path: 'public/models/atlas.json', gitBlobSha: catalogBlobSha, version: atlas.version },
    provenance: {
      software: { name: text(software.name, 'software.name'), license: text(software.license, 'software.license'), licenseUrl: httpsUrl(software.licenseUrl, 'software.licenseUrl') },
      models: { name: text(models.name, 'models.name'), creator: text(models.creator, 'models.creator'), license: text(models.license, 'models.license'), licenseUrl: httpsUrl(models.licenseUrl, 'models.licenseUrl'), datasetUrl: httpsUrl(models.datasetUrl, 'models.datasetUrl'), adaptationAttributionUrl: httpsUrl(models.adaptationAttributionUrl, 'models.adaptationAttributionUrl') },
      labels: { source: text(labelSource.source, 'labels.source'), identifierNamespace: text(labelSource.identifierNamespace, 'labels.identifierNamespace') },
    },
    noteBindings: bindings, concepts, selections, unmappedObjectives,
  };
}
