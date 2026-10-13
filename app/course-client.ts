import {useEffect, useState} from 'react';
import type {Atlas} from './anatomy';
import {validateCourseOverlay, type CourseRuntimeResponse} from './course';

/** The static build never imports a course file. Private data only arrives at runtime. */
export async function verifyCourseRuntime(input: unknown, atlas: Atlas, catalogue: string): Promise<CourseRuntimeResponse> {
  if (!input || typeof input !== 'object') throw new Error('Invalid course response.');
  const payload = input as CourseRuntimeResponse;
  if (!/^[a-f0-9]{40}$/.test(payload.catalogBlobSha ?? '')) throw new Error('Missing catalogue verification.');
  const links = payload.links;
  if (!links || typeof links.vaultRoot !== 'string' ||
      !(links.vaultName === null || typeof links.vaultName === 'string') ||
      !(links.noteBaseUrl === null || typeof links.noteBaseUrl === 'string')) throw new Error('Invalid source navigation.');
  // HTTPS/localhost can additionally verify the exact fetched bytes. On plain LAN HTTP,
  // the runtime's Git-blob check plus the same-origin no-store catalogue and complete
  // concept/membership validation remain authoritative; no new crypto dependency.
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(catalogue);
    const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
    const blob = new Uint8Array(header.length + bytes.length);
    blob.set(header); blob.set(bytes, header.length);
    const digest = await crypto.subtle.digest('SHA-1', blob);
    const sha = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (sha !== payload.catalogBlobSha) throw new Error('The course and viewer catalogues do not match.');
  }
  const course = validateCourseOverlay(payload.course, atlas, payload.catalogBlobSha);
  return {course, catalogBlobSha: payload.catalogBlobSha, links};
}

export function usePrivateCourse(atlas: Atlas | null, catalogue: string) {
  const [runtime, setRuntime] = useState<CourseRuntimeResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  useEffect(() => {
    if (!atlas || !catalogue) return;
    const abort = new AbortController();
    setRuntime(null); setStatus('loading');
    (async () => {
      try {
        const response = await fetch('/api/course', {signal: abort.signal, cache: 'no-store', credentials: 'same-origin'});
        abort.signal.throwIfAborted();
        if (response.status === 404) {setStatus('unavailable'); return;}
        // Static SPA hosts may rewrite an unknown API path to their HTML entry point.
        if (response.ok && !response.headers.get('content-type')?.includes('application/json')) {setStatus('unavailable'); return;}
        if (!response.ok) throw new Error('Private runtime unavailable.');
        const verified = await verifyCourseRuntime(await response.json(), atlas, catalogue);
        if (!abort.signal.aborted) {setRuntime(verified); setStatus('ready');}
      } catch {
        if (!abort.signal.aborted) {setRuntime(null); setStatus('error');}
      }
    })();
    return () => abort.abort();
  }, [atlas, catalogue]);
  return {runtime, status};
}
