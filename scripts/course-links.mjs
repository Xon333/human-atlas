/** Print private, runtime-derived scene links for the existing SpaceO notes. Nothing is written to Git. */
import {parseArgs} from 'node:util';
import {serializeAtlasLink} from '../app/course-navigation.ts';

const {values} = parseArgs({options:{origin:{type:'string'},api:{type:'string'}}});
try {
  const rawOrigin = values.origin || process.env.ATLAS_ORIGIN;
  if (!rawOrigin) throw new Error('Pass --origin with the observed private atlas origin.');
  const origin = new URL(rawOrigin);
  if (!['http:','https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('--origin must be an HTTP(S) origin, without a path or credentials.');
  const api = new URL(values.api || `http://127.0.0.1:${process.env.ATLAS_PORT || '3016'}`);
  if (!['http:','https:'].includes(api.protocol) || api.username || api.password) throw new Error('--api must be a local/private HTTP(S) runtime URL.');
  const response = await fetch(new URL('/api/course',api), {cache:'no-store',signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error(`Private runtime returned HTTP ${response.status}. Provision the real exporter snapshot first.`);
  const {course} = await response.json();
  if (course?.schemaVersion !== 1 || course.courseId !== 'spaceo-uni-anatomija' || !Array.isArray(course.selections) || !Array.isArray(course.unmappedObjectives)) throw new Error('Expected the validated schemaVersion 1 runtime response.');
  const safeLabel = value => String(value).replace(/[\\[\]]/g,'\\$&');
  for (const [kind,items] of [['selection',course.selections],['objective',course.unmappedObjectives]]) {
    for (const item of items) {
      const link = {mode:'course',courseId:course.courseId,[kind === 'selection' ? 'selectionId' : 'objectiveId']:item.id};
      const label = item.label || item.shortLabel || item.labels.sl;
      console.log(`- [${safeLabel(label)}](${origin.origin}/${serializeAtlasLink(link)})${kind === 'objective' ? ' — no mapped 3D target' : ''}`);
      for (const id of item.noteBindingIds) {
        const note = course.noteBindings[id].note;
        console.log(`  ${note.path} → ${note.heading}`);
      }
    }
  }
} catch (error) {
  console.error(`Course links: ${error.message}`);
  process.exitCode = 1;
}
