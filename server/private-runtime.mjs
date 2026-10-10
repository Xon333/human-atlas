/** Optional local server for the existing static build. Private inputs are read only at runtime. */
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open, realpath, stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {validateCourseOverlay} from '../app/course.ts';
import {approvedBuildFile,privateJson} from '../scripts/private-build-guard.mjs';

const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
const MAX_COURSE_BYTES = 2 * 1024 * 1024;
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.pdf':'application/pdf','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.ico':'image/x-icon','.bin':'application/octet-stream','.gz':'application/gzip','.woff2':'font/woff2'};
const SOURCE_EXTENSIONS = {pdf:new Set(['.pdf']), figure:new Set(['.png','.jpg','.jpeg','.webp','.gif']), capture:new Set(['.txt','.md'])};

export function gitBlobSha(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
function inside(root, filename) {
  const relative = path.relative(root, filename);
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}
function relativeFile(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value) || path.isAbsolute(value) || value.split('/').some(piece=>!piece || piece==='.' || piece==='..')) throw new Error('Invalid relative source path');
  return value;
}
function absoluteSetting(value, name) {
  if (!value) return null;
  if (!path.isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return path.resolve(value);
}
function optionalWebUrl(value, name, originOnly = false) {
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be an absolute HTTP(S) URL`); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (originOnly && url.pathname !== '/')) throw new Error(`${name} must be a plain HTTP(S) ${originOnly ? 'origin' : 'base URL'}`);
  return originOnly ? url.origin : url.href;
}
export function runtimeConfig(env = process.env, repoRoot = REPO_ROOT) {
  const port = env.ATLAS_PORT ? Number(env.ATLAS_PORT) : 3016;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('ATLAS_PORT must be an integer from 0 to 65535');
  const vaultRoot = env.ATLAS_VAULT_ROOT || 'Notes';
  relativeFile(vaultRoot);
  return {
    repoRoot:path.resolve(repoRoot), distRoot:path.join(repoRoot, 'dist'),
    host:env.ATLAS_HOST || '127.0.0.1', port,
    courseFile:absoluteSetting(env.ATLAS_COURSE_FILE, 'ATLAS_COURSE_FILE'),
    spaceoRoot:absoluteSetting(env.ATLAS_SPACEO_ROOT, 'ATLAS_SPACEO_ROOT'),
    origin:optionalWebUrl(env.ATLAS_ORIGIN, 'ATLAS_ORIGIN', true),
    links:{vaultName:env.ATLAS_VAULT_NAME || null,vaultRoot,noteBaseUrl:optionalWebUrl(env.ATLAS_NOTE_BASE_URL, 'ATLAS_NOTE_BASE_URL')},
  };
}
async function boundedRead(filename, maxBytes) {
  const handle = await open(filename, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maxBytes) throw new Error('Private snapshot is not a regular file within the size limit');
    const bytes = await handle.readFile();
    if (bytes.length > maxBytes) throw new Error('Private snapshot exceeds the size limit');
    return bytes;
  } finally { await handle.close(); }
}

/** Opens only a regular, contained file. The requested path is never a client input. */
export async function openContainedFile(root, relative, extensions) {
  relativeFile(relative);
  const lexical = path.resolve(root, relative);
  if (!inside(root, lexical)) throw new Error('Source escapes its configured root');
  const canonical = await realpath(lexical);
  if (!inside(root, canonical)) throw new Error('Source symlink escapes its configured root');
  if (extensions && !extensions.has(path.extname(relative).toLowerCase())) throw new Error('Source file type is not supported');
  const handle = await open(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || await realpath(lexical) !== canonical) throw new Error('Source changed while being opened');
    return {handle, info, filename:relative};
  } catch (error) { await handle.close(); throw error; }
}
function boundSources(course) {
  const sources = new Map();
  for (const [id, binding] of Object.entries(course.noteBindings)) {
    const base = `/api/course/sources/${encodeURIComponent(id)}`;
    sources.set(`${base}/pdf`, {path:binding.courseSource.path,kind:'pdf'});
    binding.figures.forEach((figure, index)=>sources.set(`${base}/figure/${index}`, {path:figure.path,kind:'figure'}));
    if (binding.capture) sources.set(`${base}/capture`, {path:binding.capture.path,kind:'capture'});
  }
  return sources;
}
function publicCandidate(filename, config) {
  return filename === config.distRoot || inside(config.distRoot, filename) || filename === path.join(config.repoRoot,'public') || inside(path.join(config.repoRoot,'public'), filename);
}
async function createCourseStore(config, reportError) {
  let atlas, catalogBlobSha, catalogSignature, lastSignature, lastState, loading;
  async function refresh() {
    if (!config.courseFile) return {status:'absent'};
    try {
      if (!config.spaceoRoot) throw new Error('ATLAS_SPACEO_ROOT is required when ATLAS_COURSE_FILE is set');
      const snapshot = await realpath(config.courseFile);
      if (publicCandidate(snapshot, config) || publicCandidate(config.courseFile, config)) throw new Error('Private snapshot must remain outside public and dist');
      const info = await stat(snapshot, {bigint:true});
      // A deployment can replace dist without restarting Node. Recheck the catalogue served to browsers.
      const catalogPath = path.join(config.distRoot,'models','atlas.json');
      const catalogInfo = await stat(catalogPath, {bigint:true});
      const currentCatalogSignature = `${catalogInfo.ino}:${catalogInfo.mtimeNs}:${catalogInfo.ctimeNs}:${catalogInfo.size}`;
      if (catalogSignature !== currentCatalogSignature) {
        const file = await openContainedFile(config.distRoot,'models/atlas.json');
        let bytes;
        try { bytes = await file.handle.readFile(); } finally { await file.handle.close(); }
        atlas = JSON.parse(bytes);
        catalogBlobSha = gitBlobSha(bytes);
        catalogSignature = currentCatalogSignature;
      }
      const signature = `${snapshot}:${info.ino}:${info.mtimeNs}:${info.ctimeNs}:${info.size}:${catalogSignature}`;
      if (lastSignature === signature) return lastState;
      const root = await realpath(config.spaceoRoot);
      if (publicCandidate(root, config)) throw new Error('SpaceO source root must remain outside public and dist');
      const raw = await boundedRead(snapshot, MAX_COURSE_BYTES);
      const course = validateCourseOverlay(JSON.parse(raw), atlas, catalogBlobSha);
      const sources = boundSources(course);
      const checked = new Set();
      for (const source of sources.values()) {
        if (checked.has(source.path)) continue;
        const file = await openContainedFile(root, source.path, SOURCE_EXTENSIONS[source.kind]);
        await file.handle.close();
        checked.add(source.path);
      }
      lastState = {status:'ready',course,catalogBlobSha,root,sources};
      lastSignature = signature;
      return lastState;
    } catch (error) {
      // A failed update cannot keep serving the previous private snapshot or source allowlist.
      lastSignature = null;
      lastState = {status:'invalid'};
      reportError(error);
      return lastState;
    }
  }
  return {
    async get() {
      if (!loading) loading = refresh().finally(()=>{ loading = null; });
      return loading;
    },
  };
}
function privateHeaders(res) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('X-Content-Type-Options','nosniff');
}
function json(res, status, value, head = false) {
  const body = JSON.stringify(value);
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body)});
  res.end(head ? undefined : body);
}
function errorResponse(res,status,code,head = false) { json(res,status,{error:{code}},head); }
function requestPath(target) {
  if (!target || !target.startsWith('/') || target.startsWith('//')) throw new Error('Invalid request target');
  const raw = target.split('?')[0];
  const decoded = decodeURIComponent(raw);
  if (decoded.includes('\\') || /[\x00-\x1f\x7f]/.test(decoded) || decoded.split('/').some(piece=>piece==='.' || piece==='..')) throw new Error('Invalid request path');
  return decoded;
}
function privateRequestAllowed(req, config) {
  const host = req.headers.host;
  if (typeof host !== 'string' || /[\s/@\\]/.test(host)) return false;
  let hostname;
  try { hostname = new URL(`http://${host}`).hostname; } catch { return false; }
  const allowed = ['localhost','127.0.0.1','[::1]'].includes(hostname) || (config.origin && host === new URL(config.origin).host) || (!['0.0.0.0','::'].includes(config.host) && hostname === config.host);
  if (!allowed || req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  return !origin || origin === `http://${host}` || origin === config.origin;
}
export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size === 0) throw new Error('Unsupported byte range');
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error('Invalid suffix range');
    start = Math.max(0,size-suffix); end = size-1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size-1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) throw new Error('Range outside file');
    end = Math.min(end,size-1);
  }
  return {start,end};
}
async function sendFile(req,res,file,isPrivate) {
  const {handle, info, filename} = file;
  let range;
  try { range = parseRange(req.headers.range, info.size); }
  catch {
    await handle.close();
    res.writeHead(416, {'Content-Range':`bytes */${info.size}`,'Content-Length':'0'}); res.end(); return;
  }
  const headers = {'Content-Type':MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream','Accept-Ranges':'bytes','Content-Length':range ? range.end-range.start+1 : info.size};
  if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`;
  if (isPrivate) headers['Content-Disposition'] = `inline; filename*=UTF-8''${encodeURIComponent(path.basename(filename)).replace(/['()*]/g,c=>`%${c.charCodeAt(0).toString(16)}`)}`;
  else headers['Cache-Control'] = filename.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === 'HEAD' || info.size === 0) { await handle.close(); res.end(); return; }
  try { await pipeline(handle.createReadStream({start:range?.start ?? 0,...(range?{end:range.end}:{}),autoClose:true}),res); }
  catch (error) { if (!['ERR_STREAM_PREMATURE_CLOSE','ECONNRESET'].includes(error.code)) throw error; }
}

export async function createPrivateServer(options = {}) {
  const config = {...runtimeConfig({}, options.repoRoot || REPO_ROOT),...options};
  config.distRoot = await realpath(config.distRoot);
  // Report setup errors locally only; browser responses never expose absolute paths or source content.
  let previousError = '';
  const reportError = options.onError || (error=>{
    if (error.message !== previousError) process.stderr.write(`Private course unavailable: ${error.message}\n`);
    previousError = error.message;
  });
  const store = await createCourseStore(config, reportError);
  const initialCourse = await store.get();
  const server = http.createServer(async (req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    let pathname;
    try { pathname = requestPath(req.url); }
    catch { privateHeaders(res); errorResponse(res,400,'INVALID_PATH',req.method==='HEAD'); return; }
    const privateRoute = pathname === '/api/course' || pathname.startsWith('/api/course/');
    if (privateRoute) privateHeaders(res);
    if (!['GET','HEAD'].includes(req.method)) {
      res.setHeader('Allow','GET, HEAD'); errorResponse(res,405,'METHOD_NOT_ALLOWED'); return;
    }
    try {
      if (privateRoute) {
        if (!privateRequestAllowed(req,config)) { errorResponse(res,403,'ORIGIN_NOT_ALLOWED',req.method==='HEAD'); return; }
        const state = await store.get();
        if (state.status !== 'ready') { errorResponse(res,state.status==='absent'?404:503,state.status==='absent'?'COURSE_NOT_CONFIGURED':'COURSE_INVALID',req.method==='HEAD'); return; }
        if (pathname === '/api/course') {
          json(res,200,{course:state.course,catalogBlobSha:state.catalogBlobSha,links:config.links},req.method==='HEAD'); return;
        }
        // Decode only for routing, then re-encode the single binding key exactly as the allowlist does.
        const match = /^\/api\/course\/sources\/([^/]+)\/(pdf|capture|figure\/\d+)$/.exec(req.url.split('?')[0]);
        const key = match ? `/api/course/sources/${encodeURIComponent(decodeURIComponent(match[1]))}/${match[2]}` : '';
        const source = state.sources.get(key);
        if (!source) { errorResponse(res,404,'SOURCE_NOT_FOUND',req.method==='HEAD'); return; }
        let file;
        try { file = await openContainedFile(state.root,source.path,SOURCE_EXTENSIONS[source.kind]); }
        catch (error) { reportError(error); errorResponse(res,404,'SOURCE_UNAVAILABLE',req.method==='HEAD'); return; }
        await sendFile(req,res,file,true); return;
      }
      if (pathname.startsWith('/api/')) { privateHeaders(res); errorResponse(res,404,'NOT_FOUND',req.method==='HEAD'); return; }
      if (pathname.split('/').some(piece=>piece.startsWith('.'))) { errorResponse(res,404,'NOT_FOUND',req.method==='HEAD'); return; }
      let relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      // A file copied into dist after building must not silently become a public/static route.
      if (!approvedBuildFile(relative)) {
        if (path.extname(relative) || relative.startsWith('models/') || relative.startsWith('assets/')) { errorResponse(res,404,'NOT_FOUND',req.method==='HEAD'); return; }
        relative = 'index.html';
      }
      let file;
      try { file = await openContainedFile(config.distRoot,relative); }
      catch {
        // Existing SPA routes may reload; missing models/assets must remain real 404s.
        if (path.extname(relative) || relative.startsWith('models/') || relative.startsWith('assets/')) { errorResponse(res,404,'NOT_FOUND',req.method==='HEAD'); return; }
        file = await openContainedFile(config.distRoot,'index.html');
      }
      if (relative === 'models/atlas.json' && privateJson(await file.handle.readFile())) {
        await file.handle.close(); privateHeaders(res); errorResponse(res,404,'NOT_FOUND',req.method==='HEAD'); return;
      }
      await sendFile(req,res,file,false);
    } catch (error) {
      reportError(error);
      if (!res.headersSent) errorResponse(res,500,'SERVER_ERROR',req.method==='HEAD');
      else res.destroy();
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return {server,config,courseStatus:initialCourse.status};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const {server,config,courseStatus} = await createPrivateServer(runtimeConfig());
    server.listen(config.port,config.host,()=>{
      const address = server.address();
      process.stdout.write(`Human Atlas: http://${config.host.includes(':')?`[${config.host}]`:config.host}:${address.port}\n`);
      process.stdout.write(courseStatus === 'ready' ? 'Private course validated; serve only through the existing private deployment boundary.\n' : courseStatus === 'invalid' ? 'Explorer available; private course validation failed (see setup error above).\n' : 'Explorer only; no private course configured.\n');
    });
    server.on('error',error=>{process.stderr.write(`Server failed: ${error.message}\n`); process.exitCode = 1;});
    for (const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>server.close(()=>process.exit(0)));
  } catch (error) { process.stderr.write(`Server setup failed: ${error.message}\n`); process.exitCode = 1; }
}
