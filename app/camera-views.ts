import type {Atlas} from './anatomy';

// Source coordinates: +X is anatomical left, +Y superior, +Z anterior.
// A tiny pole offset keeps OrbitControls' fixed vertical axis well-defined.
export const CAMERA_VIEWS = {
  'three-quarter': {direction: [.35, .06, 1], en: 'Oblique', sl: 'Poševno'},
  front: {direction: [0, 0, 1], en: 'Anterior', sl: 'Od spredaj'},
  back: {direction: [0, 0, -1], en: 'Posterior', sl: 'Od zadaj'},
  'right-side': {direction: [-1, 0, 0], en: 'From right', sl: 'Z desne'},
  side: {direction: [1, 0, 0], en: 'From left', sl: 'Z leve'},
  superior: {direction: [0, 1, .0001], en: 'Superior', sl: 'Od zgoraj'},
  inferior: {direction: [0, -1, .0001], en: 'Inferior', sl: 'Od spodaj'},
} as const;
export type View = keyof typeof CAMERA_VIEWS;

/** Use catalogue membership, never private course IDs, to name regional surfaces. */
function surfaceRegion(atlas: Atlas | null, scope: string[] | undefined): 'hand'|'foot'|undefined {
  const within = (id: string) => {
    const members = new Set(atlas?.regions?.find(region => region.id === id)?.elements);
    return !!scope?.length && scope.every(id => members.has(id));
  };
  return within('hand') ? 'hand' : within('foot') ? 'foot' : undefined;
}

export function defaultStudyView(atlas: Atlas, scope: string[] | undefined): View {
  return surfaceRegion(atlas, scope) === 'foot' ? 'superior' : 'front';
}

export function cameraViewOptions(atlas: Atlas | null, scope: string[] | undefined, side?: 'right'|'left'|'both') {
  const surface = surfaceRegion(atlas, scope), hand = surface === 'hand', foot = surface === 'foot';
  return (Object.keys(CAMERA_VIEWS) as View[]).map(id => {
    let {en, sl}: {en: string; sl: string} = CAMERA_VIEWS[id];
    if (side && side !== 'both' && (id === 'side' || id === 'right-side')) {
      const lateral = (id === 'right-side') === (side === 'right');
      en = lateral ? 'Lateral' : 'Medial';
      sl = lateral ? 'Lateralni pogled' : 'Medialni pogled';
    }
    if (hand && id === 'front') { en = 'Palmar · anterior'; sl = 'Od spredaj · palmarno'; }
    if (hand && id === 'back') { en = 'Dorsal · posterior'; sl = 'Od zadaj · dorzalno'; }
    if (foot && id === 'superior') { en = 'Dorsal · superior'; sl = 'Od zgoraj · dorzalno'; }
    if (foot && id === 'inferior') { en = 'Plantar · inferior'; sl = 'Od spodaj · plantarno'; }
    return {id, en, sl};
  });
}
