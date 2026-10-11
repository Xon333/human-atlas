import type {Atlas} from './anatomy';

export interface AtlasRegionDefinition {
  id: string;
  label: string;
  description?: string;
  conceptIds?: string[];
}
export interface AtlasRegion {
  id: string;
  label: string;
  elements: string[];
}

/** Permanent views of the existing source meshes. Concepts are source anchors,
 * not exhaustive regional membership: the generated catalogue supplies that.
 * A mesh crossing a boundary stays whole and can occur in several views.
 */
export const ATLAS_REGIONS: AtlasRegionDefinition[] = [
  {id:'head',label:'Head',conceptIds:['FMA7154','FMA9616','FMA50801','FMA12516','FMA59816']},
  {id:'neck',label:'Neck',conceptIds:['FMA7155','FMA9617']},
  {id:'thorax',label:'Thorax',conceptIds:['FMA9576','FMA7088','FMA7309','FMA7310']},
  {id:'abdomen',label:'Abdomen',conceptIds:['FMA9577','FMA7148','FMA7196','FMA7197','FMA7198','FMA7202','FMA7203','FMA7206','FMA7200','FMA7201']},
  {id:'pelvis',label:'Pelvis',conceptIds:['FMA9578','FMA37367','FMA15900','FMA14544','FMA7210','FMA7160','FMA9579','FMA18247','FMA19617','FMA19618','FMA19667','FMA19795','FMA21354','FMA21384']},
  {id:'back',label:'Back and spine',conceptIds:['FMA13478','FMA24189','FMA24217','FMA61681'],description:'Posterior trunk and vertebral column; crossing structures remain whole.'},
  {id:'shoulder',label:'Shoulder',conceptIds:['FMA33642','FMA33531','FMA23218','FMA23219']},
  {id:'arm',label:'Upper arm',conceptIds:['FMA24895','FMA24896','FMA37370']},
  {id:'elbow',label:'Elbow',description:'Whole meshes intersecting the elbow window, including adjacent arm and forearm structures.'},
  {id:'forearm',label:'Forearm',conceptIds:['FMA11345','FMA11346','FMA37371']},
  {id:'wrist',label:'Wrist',conceptIds:['FMA24940','FMA24941'],description:'Whole meshes intersecting the wrist window, including adjacent forearm and hand structures.'},
  {id:'hand',label:'Hand',conceptIds:['FMA9713','FMA9714','FMA24940','FMA24941','FMA37372']},
  {id:'upper-limb',label:'Whole upper limb',conceptIds:['FMA7185','FMA7186','FMA9621'],description:'Shoulder, arm, elbow, forearm, wrist and hand, referencing the same source meshes.'},
  {id:'hip',label:'Hip',conceptIds:['FMA24965','FMA24966'],description:'Whole meshes intersecting the hip window, including adjacent pelvis and thigh structures.'},
  {id:'thigh',label:'Thigh',conceptIds:['FMA24968','FMA24969','FMA22470']},
  {id:'knee',label:'Knee',conceptIds:['FMA24977','FMA24978'],description:'Whole meshes intersecting the knee window, including adjacent thigh and leg structures.'},
  {id:'leg',label:'Lower leg',conceptIds:['FMA24980','FMA24981','FMA22471']},
  {id:'ankle',label:'Ankle',description:'Whole meshes intersecting the ankle window, including adjacent leg and foot structures.'},
  {id:'foot',label:'Foot',conceptIds:['FMA11343','FMA11344','FMA37369']},
  {id:'lower-limb',label:'Whole lower limb',conceptIds:['FMA7187','FMA7188','FMA9622'],description:'Hip, thigh, knee, lower leg, ankle and foot, referencing the same source meshes.'},
  {id:'body-surface',label:'Body surface',description:'The source skin and other surface meshes. The indivisible whole-body skin is kept out of local region downloads.'},
];

/** Catalogue order is the sole authority for identities and generated membership.
 * Do not substitute incomplete concept unions for a missing partition catalogue.
 */
export function atlasRegions(atlas: Atlas): AtlasRegion[] {
  const catalogue = atlas as Atlas & {regions?: AtlasRegion[]};
  if (!catalogue.regions) return [];
  const entries = new Map(catalogue.regions.map(region => [region.id, region]));
  return ATLAS_REGIONS.flatMap(definition => {
    const region = entries.get(definition.id);
    return region ? [{id:definition.id,label:definition.label,elements:[...region.elements]}] : [];
  });
}

/** Smallest complete containing view; definition order resolves equal sizes.
 * Unknown, empty, or uncontained multi-region requests return null. Opening the
 * whole body is a separate explicit Explorer action, never a regional fallback.
 */
export function regionForElements(atlas: Atlas, ids: readonly string[]): AtlasRegion | null {
  if (!ids.length) return null;
  const requested = new Set(ids);
  let best: AtlasRegion | null = null;
  for (const region of atlasRegions(atlas)) {
    if (best && best.elements.length <= region.elements.length) continue;
    const elements = new Set(region.elements);
    if ([...requested].every(id => elements.has(id))) best = region;
  }
  return best;
}
