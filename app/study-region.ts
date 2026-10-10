import type {Atlas, Part} from './anatomy';

/** A view of existing catalogue groups, not a second set of models or a syllabus. */
export type StudySide = 'right' | 'left' | 'both';
export type StudyLayer = 'bones' | 'muscles' | 'all';
export interface StudyRegion {
  label?: string;
  conceptIds: string[];
  elements: string[];
  defaultSide: StudySide;
  defaultLayer: StudyLayer;
}

// These original flexor-pollicis-brevis meshes occupy the hand opposite to the
// side in their source names. Keep their IDs, names and geometry untouched, but
// do not assign either to a single-side view until its source identity is verified.
const SOURCE_SIDE_CONFLICTS = new Set(['FJ1469', 'FJ1469M']);
export function hasSourceSideConflict(elements: readonly string[]): boolean {
  return elements.some(id => SOURCE_SIDE_CONFLICTS.has(id));
}

export function partSide(part: Pick<Part, 'name'>): 'right' | 'left' | null {
  const right = /\bright\b/i.test(part.name), left = /\bleft\b/i.test(part.name);
  return right === left ? null : right ? 'right' : 'left';
}

/** Layer membership uses the source's anatomical class groups when present.
 * This avoids treating e.g. fibularis (misfiled as skeletal in display metadata)
 * as a bone. Original mesh IDs, material colours and catalogue bytes stay intact.
 */
export function regionElements(atlas: Atlas, elements: readonly string[], side: StudySide, layer: StudyLayer): string[] {
  const included = new Set(elements);
  const boneClass = atlas.concepts.find(item => item.id === 'FMA5018'); // bone organ
  const muscleClass = atlas.concepts.find(item => item.id === 'FMA5022'); // muscle organ
  const bones = boneClass ? new Set(boneClass.elements) : null;
  const muscles = muscleClass ? new Set(muscleClass.elements) : null;
  return atlas.parts.filter(part => {
    if (!included.has(part.id)) return false;
    if (side !== 'both' && SOURCE_SIDE_CONFLICTS.has(part.id)) return false;
    const sided = partSide(part);
    if (side !== 'both' && sided && sided !== side) return false;
    const bone = bones ? bones.has(part.id) : part.system === 'skeletal';
    const muscle = muscles?.has(part.id) || part.system === 'muscular';
    return layer === 'all' || bone || (layer === 'muscles' && muscle);
  }).map(part => part.id);
}
