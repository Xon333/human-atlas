import type { Atlas, View } from './anatomy';
import type { CourseOverlay } from './course';
import { encodeCourseText, spaceoRoute, validateSpaceOPath } from './course.ts';

export interface AtlasLink {
  mode: 'course' | 'explorer';
  courseId?: string;
  selectionId?: string;
  structureId?: string;
  meshId?: string;
  objectiveId?: string;
  context?: boolean;
  view?: View;
  isolate?: boolean;
}
export interface ResolvedAtlasLink extends AtlasLink {
  elements: string[];
  // Surrounding anatomy is focused separately; it is never a highlighted objective.
  contextElements?: string[];
}
export class AtlasLinkError extends Error {
  constructor(message: string) { super(message); this.name = 'AtlasLinkError'; }
}
function requireLink(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AtlasLinkError(message);
}
function nonempty(value: string, label: string): string {
  requireLink(value.trim().length > 0 && !/[\u0000-\u001f\u007f]/u.test(value), `${label}: invalid value`);
  return value;
}
const VIEWS = ['three-quarter', 'front', 'back', 'side'];
function validateLink(link: AtlasLink): void {
  requireLink(link.mode === 'course' || link.mode === 'explorer', 'Unknown atlas view');
  for (const field of ['courseId', 'selectionId', 'structureId', 'meshId', 'objectiveId'] as const) if (link[field] !== undefined) nonempty(link[field], field);
  if (link.mode === 'course') requireLink(!!link.courseId, 'A course link requires courseId');
  else requireLink(!link.courseId && !link.selectionId && !link.objectiveId && !link.context, 'Explorer links cannot contain course targets');
  if (link.objectiveId) requireLink(!link.selectionId && !link.structureId && !link.meshId, 'An unmapped objective cannot also select a structure');
  requireLink(!link.context || !!link.objectiveId, 'Context is only available for an unmapped objective');
  requireLink(link.context === undefined || typeof link.context === 'boolean', 'Invalid context');
  requireLink(link.isolate === undefined || typeof link.isolate === 'boolean', 'Invalid isolate mode');
  requireLink(link.view === undefined || VIEWS.includes(link.view), 'Invalid camera view');
}

/** Empty hash means use the application default. Invalid links must be shown as errors, not silently retargeted. */
export function parseAtlasLink(hash: string): AtlasLink | null {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!value) return null;
  requireLink(value.length <= 4096, 'Atlas link is too long');
  try { decodeURIComponent(value); } catch { throw new AtlasLinkError('Atlas link has invalid encoding'); }
  const parameters = new URLSearchParams(value);
  const allowed = new Set(['course', 'explorer', 'selection', 'structure', 'mesh', 'objective', 'context', 'view', 'isolate']);
  for (const [key, entry] of parameters) {
    requireLink(allowed.has(key), `Unknown atlas link field ${key}`);
    requireLink(parameters.getAll(key).length === 1, `Duplicate atlas link field ${key}`);
    nonempty(entry, key);
  }
  requireLink(!(parameters.has('course') && parameters.has('explorer')), 'A link cannot open course and explorer together');
  if (parameters.has('explorer')) requireLink(parameters.get('explorer') === '1', 'Invalid explorer mode');
  if (parameters.has('context')) requireLink(parameters.get('context') === '1', 'Invalid context mode');
  if (parameters.has('isolate')) requireLink(['0', '1'].includes(parameters.get('isolate')!), 'Invalid isolate mode');
  const link: AtlasLink = { mode: parameters.has('course') ? 'course' : 'explorer' };
  for (const [parameter, field] of [['course', 'courseId'], ['selection', 'selectionId'], ['structure', 'structureId'], ['mesh', 'meshId'], ['objective', 'objectiveId']] as const) {
    if (parameters.has(parameter)) link[field] = parameters.get(parameter)!;
  }
  if (parameters.has('context')) link.context = true;
  if (parameters.has('view')) link.view = parameters.get('view') as View;
  if (parameters.has('isolate')) link.isolate = parameters.get('isolate') === '1';
  validateLink(link);
  return link;
}
export function serializeAtlasLink(link: AtlasLink): string {
  validateLink(link);
  const parameters: [string, string][] = [link.mode === 'course' ? ['course', link.courseId!] : ['explorer', '1']];
  for (const [field, parameter] of [['selectionId', 'selection'], ['structureId', 'structure'], ['meshId', 'mesh'], ['objectiveId', 'objective']] as const) if (link[field]) parameters.push([parameter, link[field]!]);
  if (link.context) parameters.push(['context', '1']);
  if (link.view) parameters.push(['view', link.view]);
  if (link.isolate !== undefined) parameters.push(['isolate', link.isolate ? '1' : '0']);
  return `#${parameters.map(([key, value]) => `${key}=${encodeCourseText(value)}`).join('&')}`;
}
export function resolveAtlasLink(link: AtlasLink, atlas: Atlas, course: CourseOverlay | null): ResolvedAtlasLink {
  validateLink(link);
  let elements: string[] = [];
  const selection = link.selectionId ? course?.selections.find(item => item.id === link.selectionId) : undefined;
  if (link.mode === 'course') {
    requireLink(course && link.courseId === course.courseId, 'This course is not available in this deployment');
    if (link.selectionId) requireLink(selection, `Unknown course selection ${link.selectionId}`);
    if (link.objectiveId) {
      const objective = course.unmappedObjectives.find(item => item.id === link.objectiveId);
      requireLink(objective, `Unknown course objective ${link.objectiveId}`);
      const context = course.selections.find(item => item.id === objective.contextSelectionId);
      requireLink(context, 'The objective has no valid context selection');
      return { ...link, elements: [], ...(link.context ? { contextElements: [...context.elements] } : {}) };
    }
    if (selection) elements = [...selection.elements];
  }
  const concept = link.structureId ? atlas.concepts.find(item => item.id === link.structureId) : undefined;
  if (link.structureId) {
    requireLink(concept, `Unknown atlas structure ${link.structureId}`);
    if (link.mode === 'course') {
      requireLink(course!.concepts.some(item => item.id === concept.id), 'This structure is outside the prepared course overlay');
      if (selection) requireLink(selection.conceptIds.includes(concept.id), 'This structure does not belong to the linked selection');
    }
    elements = [...concept.elements];
  }
  if (link.meshId) {
    requireLink(atlas.parts.some(item => item.id === link.meshId), `Unknown atlas mesh ${link.meshId}`);
    if (concept) requireLink(concept.elements.includes(link.meshId), 'This mesh does not belong to the linked structure');
    if (selection) requireLink(selection.elements.includes(link.meshId), 'This mesh does not belong to the linked selection');
    if (link.mode === 'course') requireLink(course!.concepts.some(item => item.elements.includes(link.meshId!)), 'This mesh is outside the prepared course overlay');
    elements = [link.meshId];
  }
  return { ...link, elements };
}

/** `file` includes the exact heading before URI encoding; the path is relative to the observed vault root. */
export function obsidianUrl(path: string, vaultName: string, options: { heading?: string; page?: number; vaultRoot?: string } = {}): string {
  validateSpaceOPath(path);
  nonempty(vaultName, 'Vault name');
  const root = options.vaultRoot ?? 'Notes';
  requireLink(root === '' || (root.split('/').every(part => part && part !== '.' && part !== '..') && !root.includes('\\') && !/[\u0000-\u001f\u007f]/u.test(root)), 'Invalid repository-relative vault root');
  requireLink(!root || path.startsWith(`${root}/`), 'Source is outside the configured vault root');
  let file = root ? path.slice(root.length + 1) : path;
  requireLink(!(options.heading !== undefined && options.page !== undefined), 'A source cannot have both a heading and a page');
  if (options.heading !== undefined) file += `#${nonempty(options.heading, 'Heading')}`;
  if (options.page !== undefined) {
    requireLink(Number.isSafeInteger(options.page) && options.page > 0, 'Invalid PDF page');
    file += `#page=${options.page}`;
  }
  return `obsidian://open?vault=${encodeCourseText(vaultName)}&file=${encodeCourseText(file)}`;
}
/** Connect an exported exact route to an existing repo-root web note service, if configured. */
export function spaceoSourceUrl(route: string, baseUrl: string): string {
  const segments = route.split('#');
  requireLink(segments.length <= 2, 'Invalid source route');
  let path: string;
  let heading: string | undefined;
  try { path = decodeURIComponent(segments[0]); if (segments[1] !== undefined && !segments[1].startsWith('page=')) heading = decodeURIComponent(segments[1]); }
  catch { throw new AtlasLinkError('Invalid source route encoding'); }
  const page = segments[1]?.startsWith('page=') ? Number(segments[1].slice(5)) : undefined;
  requireLink(route === spaceoRoute(path, { heading, page }), 'Source route must preserve exact path and anchor encoding');
  requireLink(baseUrl.startsWith('/') || /^https?:\/\//u.test(baseUrl), 'Source base must be a root-relative or HTTP(S) URL');
  requireLink(!baseUrl.startsWith('//'), 'Protocol-relative source bases are not supported');
  let base: URL;
  try { base = new URL(baseUrl, 'https://atlas.invalid'); } catch { throw new AtlasLinkError('Invalid source base URL'); }
  requireLink(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password && !base.search && !base.hash, 'Invalid source base URL');
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const result = new URL(route, base);
  return baseUrl.startsWith('/') ? `${result.pathname}${result.hash}` : result.href;
}
/** Assets are served only through the runtime's validated binding allowlist, never by an arbitrary file path. */
export function courseSourceUrl(bindingId: string, kind: 'pdf' | 'figure' | 'capture', options: { index?: number; page?: number } = {}): string {
  nonempty(bindingId, 'Binding ID');
  requireLink(bindingId !== '.' && bindingId !== '..', 'Invalid binding ID');
  requireLink(['pdf', 'figure', 'capture'].includes(kind), 'Invalid source kind');
  let route = `/api/course/sources/${encodeCourseText(bindingId)}/${kind}`;
  if (kind === 'figure') {
    const index = options.index ?? 0;
    requireLink(Number.isSafeInteger(index) && index >= 0, 'Invalid figure index');
    route += `/${index}`;
  } else requireLink(options.index === undefined, 'An index is only valid for figures');
  if (options.page !== undefined) {
    requireLink(kind === 'pdf' && Number.isSafeInteger(options.page) && options.page > 0, 'Invalid PDF page');
    route += `#page=${options.page}`;
  }
  return route;
}
