import {type BufferGeometry} from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Keep one set of vertex/index arrays for rendering and per-part raycasting.
 * Three's indexed raycaster respects drawRange, including the merged vertex offsets.
 * The existing per-part bounds and transforms remain authoritative for picking.
 */
export function mergePickerGeometries(pickers:BufferGeometry[]):BufferGeometry {
  if(!pickers.length||pickers.some(geometry=>!geometry.index))throw new Error('Could not assemble anatomy geometry.');
  const merged=mergeGeometries(pickers,false);
  if(!merged)throw new Error('Could not assemble anatomy geometry.');
  let start=0;
  for(const geometry of pickers){
    const count=geometry.index!.count;
    geometry.setAttribute('position',merged.getAttribute('position'));
    geometry.setAttribute('normal',merged.getAttribute('normal'));
    geometry.deleteAttribute('partIndex');
    geometry.setIndex(merged.index);
    geometry.setDrawRange(start,count);
    start+=count;
  }
  return merged;
}
