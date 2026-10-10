/** Fail a public build before copying local course files. This never reads runtime input paths. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lstat, readdir, realpath, readFile} from 'node:fs/promises';

const REPO_ROOT = fileURLToPath(new URL('../',import.meta.url));
const CLIENT_ROOTS = ['app','components','hooks','lib','web'];
const CLIENT_SOURCE = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs','.css','.svg','.html']);
// These are the application's existing, redistributable assets. Review provenance before expanding.
const REVIEWED_PUBLIC_FILES = new Set(['ATTRIBUTION.md','favicon.svg','models/atlas.json']);
const REVIEWED_CLIENT_ASSETS = new Set();
const PRIVATE_SEGMENTS = new Set(['.private-course','.spaceo','Notes','Attachments']);
const PRIVATE_FILENAMES = new Set(['human-atlas-course.json','course.private.json','course.json']);
function slash(value) { return value.split(path.sep).join('/'); }
function contained(root, filename) {
  const rel = path.relative(root,filename);
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`));
}
function unsafeName(relative) {
  const parts = slash(relative).split('/');
  return parts.some(part=>PRIVATE_SEGMENTS.has(part)) || PRIVATE_FILENAMES.has(parts.at(-1)) || parts.some(part=>part.startsWith('.env'));
}
function fail(relative, reason) { throw new Error(`Public build privacy guard: ${relative}: ${reason}. Keep runtime course inputs in .private-course/ or the SpaceO checkout, outside public/client sources.`); }
export function approvedPublicFile(relative) {
  return REVIEWED_PUBLIC_FILES.has(slash(relative)) || /^models\/body-\d+\.bin(?:\.gz)?$/.test(slash(relative));
}
export function privateJson(bytes) {
  let value;
  try { value = JSON.parse(String(bytes)); } catch { return false; }
  const pending = [value];
  while (pending.length) {
    const item = pending.pop();
    if (!item || typeof item !== 'object') continue;
    if (item.privateCourseMaterial === true || (item.routeBase === 'spaceo-repository-root' && item.noteBindings)) return true;
    pending.push(...Object.values(item).filter(child=>child && typeof child === 'object'));
  }
  return false;
}
async function walk(root, visit, prefix = '') {
  let names;
  try { names = await readdir(path.join(root,prefix)); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const name of names) {
    const relative = prefix ? `${prefix}/${name}` : name;
    const filename = path.join(root,relative);
    const info = await lstat(filename);
    if (info.isSymbolicLink()) fail(relative,'symlinks are not allowed in public or client input trees');
    if (info.isDirectory()) await walk(root,visit,relative);
    else if (info.isFile()) await visit(relative,filename);
    else fail(relative,'only regular build input files are allowed');
  }
}
export async function checkPublicInputs(repoRoot = REPO_ROOT, exposedEnv = {}) {
  for (const [name,value] of Object.entries(exposedEnv)) {
    if (/^VITE_.*(?:COURSE|SPACEO|VAULT|LECTURE|CAPTURE)/i.test(name) || privateJson(value)) fail(name,'private integration settings must be runtime ATLAS_* variables, never VITE_* build values');
  }
  await walk(path.join(repoRoot,'public'),async (relative,filename)=>{
    if (unsafeName(relative) || !approvedPublicFile(relative)) fail(`public/${relative}`,'this file is not on the reviewed public asset allowlist');
    if (path.extname(relative)==='.json' && privateJson(await readFile(filename))) fail(`public/${relative}`,'private course overlay detected');
  });
  for (const directory of CLIENT_ROOTS) {
    await walk(path.join(repoRoot,directory),async (relative)=>{
      const local = `${directory}/${relative}`;
      if (unsafeName(relative) || (!CLIENT_SOURCE.has(path.extname(relative)) && !REVIEWED_CLIENT_ASSETS.has(local))) fail(local,'unreviewed local data/media in a client build input tree');
    });
  }
}
export function approvedBuildFile(relative) {
  const bundledCode = relative === 'index.html' || /^assets\/[A-Za-z0-9_.-]+\.(?:js|css|js\.map|css\.map)$/.test(relative);
  return !unsafeName(relative) && (bundledCode || approvedPublicFile(relative));
}
export async function checkBundleOutput(distRoot) {
  await walk(distRoot,async (relative,filename)=>{
    if (!approvedBuildFile(relative)) fail(`dist/${relative}`,'unreviewed generated/public asset');
    if (path.extname(relative)==='.json' && privateJson(await readFile(filename))) fail(`dist/${relative}`,'private course overlay detected');
  });
}
/** @returns {import('vite').Plugin} */
export function privateBuildGuard(repoRoot = REPO_ROOT) {
  let root, dependencies, config;
  return {
    name:'human-atlas-private-build-guard', enforce:'pre', apply:'build',
    async configResolved(resolved) {
      config = resolved;
      root = await realpath(repoRoot);
      dependencies = await realpath(path.join(root,'node_modules'));
    },
    async buildStart() { await checkPublicInputs(root,config.env); },
    async load(id) {
      if (id.startsWith('\0') || !path.isAbsolute(id)) return null;
      const filename = id.split('?')[0];
      // Every bundled local module must be in the known application tree; runtime and tests stay server-side.
      const canonical = await realpath(filename).catch(()=>filename);
      if (contained(dependencies,canonical)) return null;
      if (!contained(root,canonical)) fail(filename,'imports outside the application checkout cannot enter a public bundle');
      const relative = slash(path.relative(root,canonical));
      if (unsafeName(relative) || (!CLIENT_ROOTS.some(directory=>relative.startsWith(`${directory}/`)) && !approvedPublicFile(relative.replace(/^public\//,'')))) fail(relative,'this runtime/private file is not a client module');
      if (!CLIENT_SOURCE.has(path.extname(relative)) && !REVIEWED_CLIENT_ASSETS.has(relative)) fail(relative,'imported data/media is not a reviewed client asset');
      return null;
    },
    generateBundle(_options,bundle) {
      for (const entry of Object.values(bundle)) {
        if (!approvedBuildFile(entry.fileName)) fail(entry.fileName,'unreviewed asset would enter the generated public bundle');
        if (entry.type === 'asset' && entry.fileName.endsWith('.json') && privateJson(entry.source)) fail(entry.fileName,'private course overlay would enter the generated public bundle');
      }
    },
    async writeBundle() { await checkBundleOutput(config.build.outDir); },
  };
}
