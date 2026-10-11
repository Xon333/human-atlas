import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {ATLAS_REGIONS} from '../app/atlas-regions.ts';
import {partSide, hasSourceSideConflict} from '../app/study-region.ts';

export const CHUNK_TARGET_BYTES = 4_000_000;
const BASE_IDS = ['head','neck','thorax','abdomen','pelvis','shoulder','arm','forearm','hand','thigh','leg','foot','body-surface'];
const UPPER = ['shoulder','arm','elbow','forearm','wrist','hand'];
const LOWER = ['hip','thigh','knee','leg','ankle','foot'];
// Bounds use the catalogue's metres / Y-up pose. These are reproducible display
// windows, not newly asserted anatomical boundaries or clipped meshes.
export const SPATIAL_RULES = {
  units:'metres',axes:'Y up; source right is negative X',
  base:{headMinY:1.56,neckMinY:1.42,thoraxMinY:1.19,abdomenMinY:1.02,pelvisMinY:.83,
    handMinAbsX:.195,shoulderMinY:1.31,shoulderMinAbsX:.115,armMinY:1.11,handMinY:.70,handMaxY:.885,
    armMedialXAtShoulder:.14,armMedialSlope:.25,forearmMedialXAtElbow:.195,forearmMedialSlope:.10,
    thighMinY:.46,legMinY:.09},
  lowerFace:{maxAbsX:.06,minY:1.50,maxY:1.56,minZ:.03,maxZ:.12},
  centralPelvis:{maxAbsX:.035,minY:.75,maxY:.83},
  joints:{elbow:{minAbsX:.17,maxAbsX:.28,minY:1.065,maxY:1.16},
    wrist:{minAbsX:.21,maxAbsX:.31,minY:.85,maxY:.915},
    hip:{minAbsX:.035,maxAbsX:.17,minY:.84,maxY:.97},
    knee:{minAbsX:.025,maxAbsX:.16,minY:.40,maxY:.50},
    ankle:{minAbsX:.045,maxAbsX:.16,minY:.045,maxY:.115}},
  back:{maxAbsX:.145,minY:.83,maxY:1.56,maxZ:-.04},
  sourceOwnership:'Smallest accepted base-region source anchor by element count; otherwise majority of vertices in base windows. Ties use definition order.',
  sourceGuards:{head:{minY:1.48},neck:{minY:1.35,maxY:1.57},thorax:{minY:1.14,maxY:1.45},
    abdomen:{minY:.99,maxY:1.22},pelvis:{minY:.75,maxY:1.055},
    shoulder:{minAbsX:.04,minY:1.25,maxY:1.47},arm:{minAbsX:.13,minY:1.07,maxY:1.35},
    forearm:{minAbsX:.18,minY:.85,maxY:1.16},hand:{minAbsX:.19,minY:.70,maxY:.915},
    thigh:{minAbsX:.035,minY:.40,maxY:.97},leg:{minY:.045,maxY:.50},foot:{maxY:.115}},
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function geometrySegments(part, chunks) {
  const buffer = chunks[part.chunk];
  if (!buffer) throw new Error(`${part.id}: missing chunk`);
  return [['positions',part.vertexCount*12],['normals',part.vertexCount*6],['indices',part.indexCount*4]].map(([key,length]) => {
    const offset=part[key];
    if (offset%4 || !Number.isSafeInteger(length) || offset<0 || offset+length>buffer.length) throw new Error(`${part.id}: invalid ${key}`);
    return buffer.subarray(offset,offset+length);
  });
}
export const geometryHash = (part,chunks) => hash(Buffer.concat(geometrySegments(part,chunks)));
export function catalogueGeometryHash(atlas,chunks) {
  const digest=createHash('sha256');
  for(const part of atlas.parts) {
    digest.update(`${part.id}\0`);
    for(const segment of geometrySegments(part,chunks)) digest.update(segment);
  }
  return digest.digest('hex');
}
function inside(x,y,z,window) {
  const ax=Math.abs(x);
  return (window.minAbsX===undefined||ax>=window.minAbsX) && (window.maxAbsX===undefined||ax<=window.maxAbsX)
    && (window.minY===undefined||y>=window.minY) && (window.maxY===undefined||y<=window.maxY)
    && (window.minZ===undefined||z>=window.minZ) && (window.maxZ===undefined||z<=window.maxZ);
}
function baseRegion(x,y,z) {
  const a=Math.abs(x),r=SPATIAL_RULES.base;
  if(y>=r.headMinY || inside(x,y,z,SPATIAL_RULES.lowerFace)) return 'head';
  if(y>=r.neckMinY && a<r.shoulderMinAbsX) return 'neck';
  if(y>=r.shoulderMinY && a>=r.shoulderMinAbsX) return 'shoulder';
  // The elbow's existing occupancy window joins the arm and forearm envelopes.
  // Its medial vertices must not fall through to trunk or hand classification.
  if(inside(x,y,z,SPATIAL_RULES.joints.elbow)) return y>=r.armMinY?'arm':'forearm';
  if(y>=r.armMinY && a>=r.armMedialXAtShoulder+(r.shoulderMinY-y)*r.armMedialSlope) return 'arm';
  if(y>=r.handMaxY && a>=r.forearmMedialXAtElbow+(r.armMinY-y)*r.forearmMedialSlope) return 'forearm';
  // Above the hand window, its former lateral fallback belongs to forearm.
  // Keep the correction below the elbow rather than widening the arm envelope.
  if(y>=r.handMaxY && y<r.armMinY && a>=r.handMinAbsX) return 'forearm';
  if(y>=r.handMinY && y<=r.handMaxY && a>=r.handMinAbsX) return 'hand';
  if(y>=r.thoraxMinY) return 'thorax';
  if(y>=r.abdomenMinY) return 'abdomen';
  if(y>=r.pelvisMinY || inside(x,y,z,SPATIAL_RULES.centralPelvis)) return 'pelvis';
  if(y>=r.thighMinY) return 'thigh';
  return y>=r.legMinY?'leg':'foot';
}

export function assignRegions(atlas,chunks) {
  const concepts=new Map(atlas.concepts.map(c=>[c.id,c]));
  const anchors=new Map(atlas.parts.map(p=>[p.id,[]]));
  for(const definition of ATLAS_REGIONS) for(const id of definition.conceptIds??[]) {
    const concept=concepts.get(id);
    if(!concept) throw new Error(`Missing source anchor ${id}`);
    for(const element of concept.elements) anchors.get(element)?.push({regionId:definition.id,conceptId:id});
  }
  const order=ATLAS_REGIONS.map(r=>r.id);
  return atlas.parts.map(part=> {
    const seeds=anchors.get(part.id),counts=new Map(),members=new Set(),acceptedSources=new Set();
    // The one original skin mesh spans the entire body. Local downloads must
    // not pull it in just because its vertices occur everywhere.
    const wholeSurface=part.id==='FJ2810';
    if(wholeSurface) {members.add('body-surface');counts.set('body-surface',part.vertexCount);}
    else {
      const [positions]=geometrySegments(part,chunks);
      for(let offset=0;offset<positions.length;offset+=12) {
        const x=positions.readFloatLE(offset),y=positions.readFloatLE(offset+4),z=positions.readFloatLE(offset+8);
        if(![x,y,z].every(Number.isFinite)) throw new Error(`${part.id}: nonfinite position`);
        const base=baseRegion(x,y,z);members.add(base);counts.set(base,(counts.get(base)??0)+1);
        for(const [id,window] of Object.entries(SPATIAL_RULES.joints)) if(inside(x,y,z,window)) members.add(id);
        if(inside(x,y,z,SPATIAL_RULES.back)) members.add('back');
        for(const seed of seeds) {
          const guard=SPATIAL_RULES.sourceGuards[seed.regionId]??SPATIAL_RULES.joints[seed.regionId];
          if(guard && inside(x,y,z,guard)) {members.add(seed.regionId);acceptedSources.add(seed.conceptId);}
        }
      }
      // Spine is an existing source-defined composite, including cervical and
      // sacral vertebrae outside the posterior-trunk display window.
      for(const seed of seeds) if(seed.regionId==='back') {members.add('back');acceptedSources.add(seed.conceptId);}
      if(part.system==='integumentary') members.add('body-surface');
    }
    if(UPPER.some(id=>members.has(id))) members.add('upper-limb');
    if(LOWER.some(id=>members.has(id))) members.add('lower-limb');
    const sourceOwner=seeds.filter(seed=>BASE_IDS.includes(seed.regionId)&&acceptedSources.has(seed.conceptId))
      .sort((a,b)=>concepts.get(a.conceptId).elements.length-concepts.get(b.conceptId).elements.length || order.indexOf(a.regionId)-order.indexOf(b.regionId))[0];
    const regionOwner=sourceOwner?.regionId??BASE_IDS.reduce((best,id)=>(counts.get(id)??0)>(counts.get(best)??0)?id:best,BASE_IDS[0]);
    const partitionSide=hasSourceSideConflict([part.id])?'shared':partSide(part)??'shared';
    return {regionOwner,regionIds:order.filter(id=>members.has(id)),partitionSide,
      regionAssignment:{method:wholeSurface?'body-surface':acceptedSources.size?'source+spatial':'spatial',sourceConceptIds:[...acceptedSources].sort()}};
  });
}

/** Repack only raw source spans. No decoding/re-encoding of positions, normals,
 * or indices; no welding, simplification, new identities, or mesh splitting.
 * Groups have identical memberships: requesting any region cannot decode a
 * co-packaged mesh absent from that region. Side follows regionElements policy.
 */
export function partitionAtlas(input,sourceChunks,sourceCatalogBytes,{chunkTargetBytes=CHUNK_TARGET_BYTES}={}) {
  if(!Number.isSafeInteger(chunkTargetBytes)||chunkTargetBytes<=0) throw new Error('Invalid chunk target');
  const atlas=structuredClone(input),assignments=assignRegions(input,sourceChunks),groups=new Map(),outputs=[];
  const sourceGeometrySha256=catalogueGeometryHash(input,sourceChunks);
  let geometryBytes=0;
  atlas.parts.forEach((part,index)=> {
    Object.assign(part,assignments[index]);
    part.geometrySha256=geometryHash(input.parts[index],sourceChunks);
    const key=JSON.stringify([part.regionOwner,part.partitionSide,part.regionIds,hasSourceSideConflict([part.id])]);
    const group=groups.get(key)??[];group.push(index);groups.set(key,group);
  });
  atlas.chunks=[];
  for(const group of groups.values()) {
    let pending=[],bytes=0,pendingIndices=[];
    const flush=()=> {
      if(!pending.length) return;
      const buffer=Buffer.concat(pending),sha256=hash(buffer),first=atlas.parts[pendingIndices[0]];
      const url=`/models/region-${first.regionOwner}-${first.partitionSide}-${sha256.slice(0,16)}.bin`;
      const compressed=gzipSync(buffer,{level:9});
      const descriptor={url,bytes:buffer.length,gzip:url+'.gz',gzipBytes:compressed.length,
        regionIds:[...first.regionIds],ownerRegionId:first.regionOwner,side:first.partitionSide,sha256};
      for(const index of pendingIndices) atlas.parts[index].chunk=atlas.chunks.length;
      atlas.chunks.push(descriptor);outputs.push({descriptor,buffer,compressed});pending=[];bytes=0;pendingIndices=[];
    };
    for(const index of group) {
      const original=input.parts[index],part=atlas.parts[index],segments=geometrySegments(original,sourceChunks);
      const required=segments.reduce((sum,b)=>sum+b.length+(4-b.length%4)%4,0);
      if(bytes && bytes+required>chunkTargetBytes) flush();
      for(let i=0;i<segments.length;i++) {
        const padding=(4-bytes%4)%4;
        if(padding) {pending.push(Buffer.alloc(padding));bytes+=padding;}
        part[['positions','normals','indices'][i]]=bytes;
        pending.push(segments[i]);bytes+=segments[i].length;geometryBytes+=segments[i].length;
      }
      pendingIndices.push(index);
    }
    flush();
  }
  atlas.regions=ATLAS_REGIONS.map(definition=>({...definition,elements:atlas.parts.filter(p=>p.regionIds.includes(definition.id)).map(p=>p.id)}));
  const geometrySha256=catalogueGeometryHash(atlas,outputs.map(o=>o.buffer));
  if(geometrySha256!==sourceGeometrySha256) throw new Error('Geometry preservation check failed');
  atlas.geometryPartition={version:1,sourceCatalogSha256:input.geometryPartition?.sourceCatalogSha256??hash(sourceCatalogBytes),
    sourceGeometrySha256,geometrySha256,geometryBytes,partCount:atlas.parts.length,chunkTargetBytes,rules:SPATIAL_RULES,
    limitations:['Regional source groups are incomplete; membership supplements guarded source anchors with actual vertex occupancy in the recorded pose windows.',
      'Display windows approximate anatomy and do not establish anatomical boundaries. Crossing meshes remain whole and may extend well outside a requested region.',
      'Joint views include whole intersecting meshes, including long bones; they do not create separately addressable joint surfaces or unrepresented structures.',
      'The indivisible Skin mesh is available in Body surface and the explicit whole-body Explorer only; local regions retain other local surface meshes.',
      'Laterality follows existing source names and regionElements; unsided meshes are shared. FJ1469 and FJ1469M retain their source-name/geometry conflict and are shared chunks, excluded from single-side views.']};
  return {atlas,outputs};
}

export function writePartition(directory) {
  const manifestPath=path.join(directory,'atlas.json'),sourceCatalogBytes=fs.readFileSync(manifestPath),input=JSON.parse(sourceCatalogBytes);
  const sourceChunks=input.chunks.map(chunk=>fs.readFileSync(path.join(directory,path.basename(chunk.url))));
  const {atlas,outputs}=partitionAtlas(input,sourceChunks,sourceCatalogBytes);
  // Write and verify every new file before replacing the catalogue. Originals
  // remain in Git; delete only superseded files named by the input catalogue.
  for(const output of outputs) {
    for(const [url,bytes] of [[output.descriptor.url,output.buffer],[output.descriptor.gzip,output.compressed]]) {
      const filename=path.join(directory,path.basename(url));fs.writeFileSync(filename,bytes);
      if(!fs.readFileSync(filename).equals(bytes)) throw new Error(`Write mismatch: ${filename}`);
    }
  }
  const temporary=manifestPath+'.partition-tmp';fs.writeFileSync(temporary,JSON.stringify(atlas));fs.renameSync(temporary,manifestPath);
  const keep=new Set(outputs.flatMap(o=>[path.basename(o.descriptor.url),path.basename(o.descriptor.gzip)]));
  for(const old of input.chunks.flatMap(c=>[c.url,c.gzip].filter(Boolean))) {
    const filename=path.basename(old);if(!keep.has(filename)) fs.unlinkSync(path.join(directory,filename));
  }
  return {parts:atlas.parts.length,regions:atlas.regions.length,chunks:atlas.chunks.length,geometryBytes:atlas.geometryPartition.geometryBytes,
    binaryBytes:atlas.chunks.reduce((sum,c)=>sum+c.bytes,0),gzipBytes:atlas.chunks.reduce((sum,c)=>sum+c.gzipBytes,0),geometrySha256:atlas.geometryPartition.geometrySha256};
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(writePartition(process.argv[2]??fileURLToPath(new URL('../public/models/',import.meta.url)))));
}
