import type { Atlas, View } from './anatomy';
import {CAMERA_VIEWS} from './camera-views.ts';
import type { CourseOverlay } from './course';
import {atlasRegions, regionForElements} from './atlas-regions.ts';
import { encodeCourseText, spaceoRoute, validateSpaceOPath } from './course.ts';
import {regionElements, partSide, hasSourceSideConflict, type StudySide, type StudyLayer} from './study-region.ts';

export interface AtlasLink {
  mode: 'course' | 'region' | 'explorer';
  regionId?: string;
  courseId?: string;
  selectionId?: string;
  structureId?: string;
  meshId?: string;
  objectiveId?: string;
  context?: boolean;
  view?: View;
  isolate?: boolean;
  side?: StudySide;
  layer?: StudyLayer;
}
export interface ResolvedAtlasLink extends AtlasLink {
  elements: string[];
  scopeElements?: string[];
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
const VIEWS = Object.keys(CAMERA_VIEWS);
function validateLink(link: AtlasLink): void {
  requireLink(['course', 'region', 'explorer'].includes(link.mode), 'Unknown atlas view');
  for (const field of ['courseId', 'regionId', 'selectionId', 'structureId', 'meshId', 'objectiveId'] as const) if (link[field] !== undefined) nonempty(link[field], field);
  if (link.mode === 'course') requireLink(!!link.courseId && !link.regionId, 'A course link requires courseId and no public region');
  else if (link.mode === 'region') requireLink(!!link.regionId && !link.courseId && !link.selectionId && !link.objectiveId && !link.context, 'A region link requires regionId and no course targets');
  else requireLink(!link.regionId && !link.courseId && !link.selectionId && !link.objectiveId && !link.context && !link.side && !link.layer, 'Explorer links cannot contain course targets');
  if (link.objectiveId) requireLink(!link.selectionId && !link.structureId && !link.meshId, 'An unmapped objective cannot also select a structure');
  requireLink(!link.context || !!link.objectiveId, 'Context is only available for an unmapped objective');
  requireLink(link.context === undefined || typeof link.context === 'boolean', 'Invalid context');
  requireLink(link.isolate === undefined || typeof link.isolate === 'boolean', 'Invalid isolate mode');
  requireLink(link.view === undefined || VIEWS.includes(link.view), 'Invalid camera view');
  requireLink(link.side === undefined || ['right','left','both'].includes(link.side), 'Invalid regional side');
  requireLink(link.layer === undefined || ['bones','muscles','all'].includes(link.layer), 'Invalid regional layer');
}

/** Empty hash opens the lightweight chooser. Invalid links must be shown as errors, not silently retargeted. */
export function parseAtlasLink(hash: string): AtlasLink | null {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!value) return null;
  requireLink(value.length <= 4096, 'Atlas link is too long');
  try { decodeURIComponent(value); } catch { throw new AtlasLinkError('Atlas link has invalid encoding'); }
  const parameters = new URLSearchParams(value);
  const allowed = new Set(['course', 'region', 'explorer', 'selection', 'structure', 'mesh', 'objective', 'context', 'view', 'isolate', 'side', 'layer']);
  for (const [key, entry] of parameters) {
    requireLink(allowed.has(key), `Unknown atlas link field ${key}`);
    requireLink(parameters.getAll(key).length === 1, `Duplicate atlas link field ${key}`);
    nonempty(entry, key);
  }
  requireLink(['course', 'region', 'explorer'].filter(key => parameters.has(key)).length === 1, 'A link requires exactly one course, region or explorer mode');
  if (parameters.has('explorer')) requireLink(parameters.get('explorer') === '1', 'Invalid explorer mode');
  if (parameters.has('context')) requireLink(parameters.get('context') === '1', 'Invalid context mode');
  if (parameters.has('isolate')) requireLink(['0', '1'].includes(parameters.get('isolate')!), 'Invalid isolate mode');
  const link: AtlasLink = { mode: parameters.has('course') ? 'course' : parameters.has('region') ? 'region' : 'explorer' };
  for (const [parameter, field] of [['course', 'courseId'], ['region', 'regionId'], ['selection', 'selectionId'], ['structure', 'structureId'], ['mesh', 'meshId'], ['objective', 'objectiveId']] as const) {
    if (parameters.has(parameter)) link[field] = parameters.get(parameter)!;
  }
  if (parameters.has('side')) link.side = parameters.get('side') as StudySide;
  if (parameters.has('layer')) link.layer = parameters.get('layer') as StudyLayer;
  if (parameters.has('context')) link.context = true;
  if (parameters.has('view')) link.view = parameters.get('view') as View;
  if (parameters.has('isolate')) link.isolate = parameters.get('isolate') === '1';
  validateLink(link);
  return link;
}
export function serializeAtlasLink(link: AtlasLink): string {
  validateLink(link);
  const parameters: [string, string][] = [link.mode === 'course' ? ['course', link.courseId!] : link.mode === 'region' ? ['region', link.regionId!] : ['explorer', '1']];
  for (const [field, parameter] of [['selectionId', 'selection'], ['structureId', 'structure'], ['meshId', 'mesh'], ['objectiveId', 'objective']] as const) if (link[field]) parameters.push([parameter, link[field]!]);
  if (link.side) parameters.push(['side', link.side]);
  if (link.layer) parameters.push(['layer', link.layer]);
  if (link.context) parameters.push(['context', '1']);
  if (link.view) parameters.push(['view', link.view]);
  if (link.isolate !== undefined) parameters.push(['isolate', link.isolate ? '1' : '0']);
  return `#${parameters.map(([key, value]) => `${key}=${encodeCourseText(value)}`).join('&')}`;
}
export function resolveAtlasLink(link: AtlasLink, atlas: Atlas, course: CourseOverlay | null): ResolvedAtlasLink {
  validateLink(link);
  let elements: string[] = [];
  const part = link.meshId ? atlas.parts.find(item => item.id === link.meshId) : undefined;
  const concept = link.structureId ? atlas.concepts.find(item => item.id === link.structureId) : undefined;
  if (link.meshId) requireLink(part, `Unknown atlas mesh ${link.meshId}`);
  if (link.structureId) requireLink(concept, `Unknown atlas structure ${link.structureId}`);
  if (part && concept) requireLink(concept.elements.includes(part.id), 'This mesh does not belong to the linked structure');
  let selection = link.selectionId ? course?.selections.find(item => item.id === link.selectionId) : undefined;
  let scopeElements: string[] | undefined;
  let side = link.side, layer = link.layer;
  if (link.mode === 'course') {
    requireLink(course && link.courseId === course.courseId, 'This course is not available in this deployment');
    if (link.selectionId) requireLink(selection, `Unknown course selection ${link.selectionId}`);
    if (link.objectiveId) {
      const objective = course.unmappedObjectives.find(item => item.id === link.objectiveId);
      requireLink(objective, `Unknown course objective ${link.objectiveId}`);
      const context = course.selections.find(item => item.id === objective.contextSelectionId);
      requireLink(context, 'The objective has no valid context selection');
      const contextIds = context.region ? regionElements(atlas, context.region.elements, side ?? context.region.defaultSide, layer ?? context.region.defaultLayer) : context.elements;
      return {...link, elements: [], ...(link.context ? {contextElements: [...contextIds]} : {})};
    }
    if (!selection && (concept || part)) {
      // Existing note links name a taught target without a selection. Reuse its
      // authored region so old links gain the same context as a list/canvas pick.
      // Region membership alone must not authorize an unrelated legacy target.
      const term = course.concepts.find(item => concept ? item.id === concept.id : item.elements.includes(part!.id));
      requireLink(term, 'This structure is outside the prepared course overlay');
      selection = course.selections.find(item => item.conceptIds.includes(term.id));
    }
    if (selection) {
      const region = selection.region;
      const allowed = region?.elements ?? selection.elements;
      if (concept && !part) requireLink(concept.elements.every(id => allowed.includes(id)), 'This structure does not belong to the linked selection');
      if (part) requireLink(allowed.includes(part.id), 'This mesh does not belong to the linked selection');
      const targetIds = part ? [part.id] : concept?.elements ?? [];
      const conflictingSide = !!region && hasSourceSideConflict(targetIds);
      requireLink(!conflictingSide || side === undefined || side === 'both', 'The source side label conflicts with the mesh position; choose both sides to view this structure.');
      const targetSides = new Set(atlas.parts.filter(item => targetIds.includes(item.id)).map(partSide).filter(Boolean));
      side = side ?? (conflictingSide ? 'both' : targetSides.size === 1 ? [...targetSides][0] ?? undefined : undefined) ?? region?.defaultSide;
      layer = layer ?? region?.defaultLayer;
      scopeElements = region ? regionElements(atlas, allowed, side ?? 'both', layer ?? 'all') : [...allowed];
      if ((part && !scopeElements.includes(part.id)) || (concept && !concept.elements.some(id => scopeElements!.includes(id)))) {
        // A link to a non-bone must not silently select nothing under the default bone layer.
        requireLink(link.layer === undefined, 'The target is outside the selected layer or side');
        layer = 'all';
        scopeElements = region ? regionElements(atlas, allowed, side ?? 'both', layer) : [...allowed];
      }
      requireLink(scopeElements.length > 0, 'This regional view has no available meshes');
      if (part) requireLink(scopeElements.includes(part.id), 'This mesh is outside the selected side');
      if (concept) requireLink(concept.elements.some(id => scopeElements!.includes(id)), 'This structure is outside the selected side');
      elements = [...selection.elements];
    }
  }
  if (link.mode === 'region') {
    const region = atlasRegions(atlas).find(item => item.id === link.regionId);
    requireLink(region, `Unknown atlas region ${link.regionId}`);
    const targetIds = part ? [part.id] : concept?.elements ?? [];
    requireLink(targetIds.every(id => region.elements.includes(id)), 'This structure does not belong to the linked region');
    const conflict = hasSourceSideConflict(targetIds);
    requireLink(!conflict || side === undefined || side === 'both', 'The source side label conflicts with the mesh position; choose both sides to view this structure.');
    const sides = new Set(atlas.parts.filter(item => targetIds.includes(item.id)).map(partSide).filter(Boolean));
    side = side ?? (conflict ? 'both' : sides.size === 1 ? [...sides][0] ?? 'both' : 'both');
    const defaultLayer = regionElements(atlas, region.elements, side, 'bones').length ? 'bones' : 'all';
    layer = layer ?? defaultLayer;
    scopeElements = regionElements(atlas, region.elements, side, layer);
    if (targetIds.length && !targetIds.some(id => scopeElements!.includes(id))) {
      requireLink(link.layer === undefined, 'The target is outside the selected layer or side');
      layer = 'all';
      scopeElements = regionElements(atlas, region.elements, side, layer);
    }
    requireLink(scopeElements.length > 0, 'This regional view has no available meshes');
    if (part) requireLink(scopeElements.includes(part.id), 'This mesh is outside the selected side');
    if (concept) requireLink(concept.elements.some(id => scopeElements!.includes(id)), 'This structure is outside the selected side');
  }
  if (concept) elements = [...concept.elements];
  if (part) elements = [part.id];
  if (scopeElements && (concept || part)) elements = elements.filter(id => scopeElements!.includes(id));
  return {...link, ...(selection && link.mode === 'course' ? {selectionId: selection.id} : {}), ...(side ? {side} : {}), ...(layer ? {layer} : {}), elements, ...(scopeElements ? {scopeElements} : {})};
}

export type AtlasRoute =
  | {status:'chooser'}
  | {status:'pending'}
  | {status:'scene'; request:AtlasLink; resolved:ResolvedAtlasLink};

/** No scene is authorized until its catalogue and (for UNI) verified course are ready. */
export function resolveAtlasRoute(hash:string, atlas:Atlas|null, course:CourseOverlay|null, courseStatus:'loading'|'ready'|'unavailable'|'error'):AtlasRoute {
  const request = parseAtlasLink(hash);
  if (!request) return {status:'chooser'};
  if (!atlas || (request.mode === 'course' && courseStatus === 'loading')) return {status:'pending'};
  if (request.mode === 'course' && !request.selectionId && !request.structureId && !request.meshId && !request.objectiveId) {
    requireLink(course && request.courseId === course.courseId, 'This course is not available in this deployment');
    requireLink(course.selections.length, 'This course has no available selections');
    request.selectionId = course.selections[0].id;
  }
  return {status:'scene', request, resolved:resolveAtlasLink(request, atlas, course)};
}

/** A picker target stays in an anatomical assembly, including picks outside the current region. */
export function publicTargetLink(atlas: Atlas, target: {structureId?: string; meshId?: string}, current?: AtlasLink): AtlasLink {
  const concept = target.structureId ? atlas.concepts.find(item => item.id === target.structureId) : undefined;
  if (target.structureId) requireLink(concept, `Unknown atlas structure ${target.structureId}`);
  if (target.meshId && concept) requireLink(concept.elements.includes(target.meshId), 'This mesh does not belong to the linked structure');
  const ids = target.meshId ? [target.meshId] : concept?.elements ?? [];
  requireLink(ids.length && ids.every(id => atlas.parts.some(part => part.id === id)), 'Unknown atlas target');
  const regions = atlasRegions(atlas);
  const previous = current?.mode === 'region' ? regions.find(region => region.id === current.regionId) : undefined;
  const region = previous && ids.every(id => previous.elements.includes(id)) ? previous : regionForElements(atlas, ids);
  // A source concept spanning several regions has no honest single regional scope.
  // Keep the current assembly and use a member mesh, or require the explicit Explorer.
  requireLink(region || current?.mode === 'explorer', 'This structure spans multiple regions. Choose a member structure or open Full Body Explorer.');
  if (current?.mode === 'explorer') return {mode:'explorer', ...target, isolate:false};
  const same = previous?.id === region!.id;
  let side = same ? current?.side : undefined, layer = same ? current?.layer : undefined;
  if (hasSourceSideConflict(ids)) side = 'both';
  if (!regionElements(atlas, region!.elements, side ?? 'both', 'all').some(id => ids.includes(id))) {
    const sides = new Set(atlas.parts.filter(part => ids.includes(part.id)).map(partSide).filter(Boolean));
    side = sides.size === 1 ? [...sides][0] ?? 'both' : 'both';
  }
  if (!regionElements(atlas, region!.elements, side ?? 'both', layer ?? 'bones').some(id => ids.includes(id))) {
    layer = regionElements(atlas, region!.elements, side ?? 'both', 'muscles').some(id => ids.includes(id)) ? 'muscles' : 'all';
  }
  return {mode:'region', regionId:region!.id, ...target, side, layer, isolate:false};
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
