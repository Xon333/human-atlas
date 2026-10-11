import type {Atlas,SceneState} from './anatomy';
/** Render-only projection. The original catalogue remains the course/link authority. */
export function requestedGeometry(state:SceneState):string[]|undefined {
  const scope=state.scope??(state.context?.length?state.context:undefined);
  if(scope===undefined)return undefined; // Preserve complete Explorer behavior.
  return [...new Set([...scope,...(state.context??[]),...state.selected])].sort();
}
export function projectGeometry(atlas:Atlas,requested:string[]|undefined):Atlas {
  if(requested===undefined)return atlas;
  const ids=new Set(requested),parts=atlas.parts.filter(part=>ids.has(part.id));
  if(parts.length===atlas.parts.length)return atlas;
  const oldChunks=[...new Set(parts.map(part=>part.chunk))].sort((a,b)=>a-b);
  const remap=new Map(oldChunks.map((old,index)=>[old,index]));
  // Chunk URLs, sizes, byte offsets, coordinates and geometry precision are unchanged.
  // The existing loader merges only these parts and releases the source chunk buffer.
  return {...atlas,parts:parts.map(part=>({...part,chunk:remap.get(part.chunk)!})),
    chunks:oldChunks.map(index=>atlas.chunks[index]),
    triangles:parts.reduce((sum,part)=>sum+part.indexCount/3,0)};
}
