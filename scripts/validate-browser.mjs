// Optional real-browser regression check. Course expectations come from the private
// runtime response; this file contains no copied course data or teaching assets.
// ATLAS_TEST_SCOPE=dark runs only the theme, source-control, and responsive-rendering checks.
// ATLAS_TEST_SCOPE=resource checks on-demand rendering; ATLAS_RESOURCE_BASELINE=1 only records its older baseline.
import assert from 'node:assert/strict';
import {regionalChecks} from './regional-browser-checks.mjs';
import {resolveAtlasLink} from '../app/course-navigation.ts';
import {once} from 'node:events';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createPrivateServer, runtimeConfig} from '../server/private-runtime.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(process.env.ATLAS_TEST_OUTPUT || path.join(root, '.private-course/browser-checks'));
const scope = process.env.ATLAS_TEST_SCOPE || 'all';
assert.ok(['all', 'dark', 'region', 'resource'].includes(scope), 'ATLAS_TEST_SCOPE must be all, dark, region, or resource');
const darkOnly = scope === 'dark';
const inspectDark = scope === 'dark' || scope === 'all';
const resourceOnly = scope === 'resource';
const minimumGpuFrameMs = Number(process.env.ATLAS_TEST_GPU_FRAME_MS || 0);
assert.ok(Number.isFinite(minimumGpuFrameMs) && minimumGpuFrameMs >= 0 && minimumGpuFrameMs <= 5000, 'ATLAS_TEST_GPU_FRAME_MS must be between 0 and 5000');
const playwrightModule = process.env.PLAYWRIGHT_MODULE || 'playwright';
const {chromium} = await import(path.isAbsolute(playwrightModule) ? pathToFileURL(playwrightModule).href : playwrightModule);
await mkdir(output, {recursive: true});

let server;
let base = process.env.ATLAS_TEST_URL;
if (!base) {
  // An ephemeral loopback server uses the existing built app and runtime configuration.
  // It does not modify or launch the accepted Mac/OMV deployment.
  ({server} = await createPrivateServer({...runtimeConfig(), host: '127.0.0.1', port: 0, origin: null}));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/`;
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  headless: true,
  args: process.env.ATLAS_SOFTWARE_GL === '1' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [],
});
const context = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce', colorScheme: 'light'});
// Exercise the supported fallback used when clipboard access is unavailable on a private HTTP origin.
await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {configurable: true, get: () => undefined}));
await context.addInitScript(({minimumGpuFrameMs}) => {
  // Test-only instrumentation: no renderer debug API, production polling, or new dependency.
  const probe = window.__atlasResourceProbe = {callbacks: 0, draws: 0, triangles: 0, frames: 0, stamp: 0, drawnStamp: -1, lastDrawAt: 0, pending: new Set()};
  const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => {
    const id = request(time => {probe.pending.delete(id); probe.callbacks++; probe.stamp = time; callback(time);});
    probe.pending.add(id); return id;
  };
  window.cancelAnimationFrame = id => {probe.pending.delete(id); cancel(id);};
  // Slow-GPU regression: delay only the test's observation of an existing fence.
  // The real GPU must still signal completion; geometry, draws and timeouts stay unchanged.
  if (minimumGpuFrameMs && window.WebGL2RenderingContext) {
    const gl = window.WebGL2RenderingContext.prototype, submitted = new WeakMap();
    const fenceSync = gl.fenceSync, clientWaitSync = gl.clientWaitSync;
    gl.fenceSync = function (...args) {const fence = fenceSync.apply(this, args); if (fence) submitted.set(fence, performance.now()); return fence;};
    gl.clientWaitSync = function (fence, ...args) {
      const at = submitted.get(fence);
      return at !== undefined && performance.now() - at < minimumGpuFrameMs ? this.TIMEOUT_EXPIRED : clientWaitSync.call(this, fence, ...args);
    };
  }
  for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext].filter(Boolean)) {
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      if (!Object.hasOwn(type.prototype, name)) continue;
      const draw = type.prototype[name];
      type.prototype[name] = function (...args) {
        probe.draws++; probe.lastDrawAt = performance.now();
        if (probe.drawnStamp !== probe.stamp) {probe.frames++; probe.drawnStamp = probe.stamp;}
        const count = args[name.startsWith('drawArrays') ? 2 : 1], instances = name.endsWith('Instanced') ? args.at(-1) : 1;
        if (args[0] === this.TRIANGLES) probe.triangles += count / 3 * instances;
        return draw.apply(this, args);
      };
    }
  }
}, {minimumGpuFrameMs});
const page = await context.newPage();
page.setDefaultTimeout(30_000);
page.setDefaultNavigationTimeout(60_000);
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
const report = {browser: browser.version(), softwareGL: process.env.ATLAS_SOFTWARE_GL === '1', scope, emulatedColorScheme: 'light', course: false, checks: [], screenshots: []};
const record = check => { report.checks.push(check); console.log(`PASS ${check}`); };
const params = () => new URLSearchParams(new URL(page.url()).hash.slice(1));
const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const state = async (name, expected) => {
  await page.waitForFunction(({name, expected}) => document.querySelector('main')?.getAttribute(name) === String(expected), {name, expected});
};
const ready = async () => {
  await page.locator('.scene canvas').waitFor();
  await page.locator('.loading').waitFor({state: 'hidden', timeout: 60_000});
  await frame();
  assert.equal(await page.locator('.loading.error').count(), 0, 'The model must load without an error');
};
const screenshot = async (name, inspectSelection = false, inspectNeutral = false) => {
  await frame();
  // Observe the real demand renderer settling. Two animation callbacks alone
  // can run before a queued GPU frame permits the newest selection to render.
  await page.waitForFunction(() => window.__atlasResourceProbe.pending.size === 0 && performance.now() - window.__atlasResourceProbe.lastDrawAt > 150, null, {polling: 100, timeout: 30_000});
  const started = performance.now();
  const png = await page.screenshot({path: path.join(output, `${name}.png`), timeout: 60_000});
  (report.screenshotTimings ??= []).push({name, milliseconds: Math.round(performance.now() - started)});
  report.screenshots.push(`${name}.png`);
  if (!inspectSelection && !inspectNeutral && !inspectDark) return;
  // Read the rendered image, excluding UI, so a correct DOM count cannot hide a lost camera fit.
  // This checks the existing renderer's green selection tint without exposing a scene debug API.
  const measurement = await page.evaluate(async ({encoded, inspectNeutral}) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const scale = canvas.width / innerWidth;
    // Include the existing focus rings outside control boxes; their mint color is UI, not anatomy.
    const excluded = [...document.querySelectorAll('.course-panel,.layers-panel,.detail-sheet,.top-actions,.mode-switch,.view-controls,.bottom-dock,.identity,.scene-caption,.studio-footer')].filter(element => getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none').map(element => element.getBoundingClientRect()).filter(box => box.width && box.height).map(box => ({left: box.left - 8, right: box.right + 8, top: box.top - 8, bottom: box.bottom + 8}));
    const points = [];
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    const neutral = {pixels: 0, left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity};
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4, r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      const cssX = x / scale, cssY = y / scale;
      if (inspectNeutral && r > 70 && r >= g - 3 && g >= b + 4 && !excluded.some(box => cssX >= box.left && cssX <= box.right && cssY >= box.top && cssY <= box.bottom)) {
        neutral.pixels++; neutral.left = Math.min(neutral.left, cssX); neutral.right = Math.max(neutral.right, cssX); neutral.top = Math.min(neutral.top, cssY); neutral.bottom = Math.max(neutral.bottom, cssY);
      }
      if (g <= r + 8 || b <= r + 3 || g < b - 5) continue;
      if (excluded.some(box => cssX >= box.left && cssX <= box.right && cssY >= box.top && cssY <= box.bottom)) continue;
      points.push({x: cssX, y: cssY});
      left = Math.min(left, cssX); right = Math.max(right, cssX); top = Math.min(top, cssY); bottom = Math.max(bottom, cssY);
    }
    const cornerLuminance = [[2, 2], [canvas.width - 3, 2], [2, canvas.height - 3]].map(([x, y]) => {
      const offset = (y * canvas.width + x) * 4;
      const linear = [pixels[offset], pixels[offset + 1], pixels[offset + 2]].map(value => {const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;});
      return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
    });
    return {pixels: points.length, width: right - left, height: bottom - top, sample: points[Math.floor(points.length / 2)], ...(inspectNeutral ? {neutral: {pixels: neutral.pixels, width: neutral.right - neutral.left, height: neutral.bottom - neutral.top}} : {}), cornerLuminance};
  }, {encoded: png.toString('base64'), inspectNeutral});
  if (inspectSelection) {
    assert.ok(measurement.pixels >= 80 && measurement.width >= 12 && measurement.height >= 12, `Focused anatomy must remain visibly framed after viewport changes: ${JSON.stringify(measurement)}`);
    (report.renderedSelections ??= []).push({screenshot: `${name}.png`, ...measurement});
  }
  if (inspectDark) assert.ok(measurement.cornerLuminance.every(value => value < .1), `The rendered stage must remain dark: ${JSON.stringify(measurement.cornerLuminance)}`);
  if (inspectNeutral) (report.renderedContext ??= []).push({screenshot: `${name}.png`, ...measurement});
  return measurement;
};
const hash = async values => {
  const target = new URL(base);
  target.hash = new URLSearchParams(values).toString();
  await page.goto(target.href, {waitUntil: 'domcontentloaded'});
};
const insideViewport = async selector => {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, `${selector} must be visible`);
  const viewport = page.viewportSize();
  assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${selector} must fit ${viewport.width}x${viewport.height}`);
};
const openSearch = async text => {
  await page.getByRole('button', {name: /^(Search anatomy|Poišči strukturo)$/}).click();
  await page.locator('.search-panel input[role=combobox]').fill(text);
  await page.getByRole('option').first().waitFor();
};

const darkSurfaces = async (selector, target = page) => {
  const values = await target.locator(selector).evaluateAll(elements => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    const rgba = css => {ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const color = [...ctx.getImageData(0, 0, 1, 1).data]; color[3] /= 255; return color;};
    const over = (front, back) => front.slice(0, 3).map((value, index) => value * front[3] + back[index] * (1 - front[3]));
    const luminance = color => {const c = color.map(value => {const x = value / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;}); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];};
    return elements.filter(element => {
      const style = getComputedStyle(element), box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width && box.height;
    }).map(element => {
      const ancestors = []; for (let node = element; node; node = node.parentElement) ancestors.unshift(node);
      let background = [255, 255, 255];
      for (const ancestor of ancestors) background = over(rgba(getComputedStyle(ancestor).backgroundColor), background);
      const foreground = over(rgba(getComputedStyle(element).color), background), bg = luminance(background), fg = luminance(foreground);
      return {tag: element.tagName, background, foreground, backgroundLuminance: bg, contrast: (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05)};
    });
  });
  assert.ok(values.length, `${selector} must expose a visible surface`);
  for (const value of values) {
    assert.ok(value.backgroundLuminance < .1, `${selector} must have a dark background: ${JSON.stringify(value)}`);
    assert.ok(value.contrast >= 4.5, `${selector} must keep readable text contrast: ${JSON.stringify(value)}`);
  }
  (report.darkSurfaces ??= []).push({selector, count: values.length, minimumContrast: Math.min(...values.map(value => value.contrast))});
};

const darkFirstPaint = async () => {
  const initial = await browser.newContext({viewport: {width: 900, height: 640}, javaScriptEnabled: false, colorScheme: 'light'});
  try {
    const initialPage = await initial.newPage();
    // A delayed bundle or stylesheet must not expose a white initial canvas.
    await initialPage.route('**/*', route => ['script', 'stylesheet'].includes(route.request().resourceType()) ? route.abort() : route.continue());
    await initialPage.goto(base, {waitUntil: 'domcontentloaded'});
    const initialStyle = await initialPage.evaluate(() => ({lightPreference: matchMedia('(prefers-color-scheme: light)').matches, colorScheme: getComputedStyle(document.documentElement).colorScheme}));
    assert.ok(initialStyle.lightPreference && initialStyle.colorScheme.includes('dark'), 'The initial document must request dark browser controls independently of the OS preference');
    await darkSurfaces('html,body', initialPage);
    await initialPage.screenshot({path: path.join(output, 'dark-first-paint.png')});
    report.screenshots.push('dark-first-paint.png');
    report.firstPaint = {...initialStyle, scriptsAndStylesheetsBlocked: true};
    record('The first HTML paint is dark with OS light preference and external scripts/stylesheets blocked');
  } finally {await initial.close();}
};

const darkChecks = async (course, atlas) => {
  await darkSurfaces('html,body');
  if (course) {
    report.course = true; report.selectionCount = course.selections.length; report.objectiveCount = course.unmappedObjectives.length;
    const first = course.selections[0], term = course.concepts.find(item => item.id === first.conceptIds[0]);
    await hash({course: course.courseId, selection: first.id});
    await state('data-mode', 'course');
    await state('data-selected-count', 0);
    await darkSurfaces('.mode-switch,.course-panel,.course-detail,.course-dock');
    await darkSurfaces('.course-term-name strong,.course-term-name [lang],.course-side,.course-order,.course-evidence');
    await page.locator('.source-disclosure > summary').click();
    await page.locator('.course-sources').scrollIntoViewIfNeeded();
    await darkSurfaces('.source-heading,.course-source-actions a');
    const source = page.locator('.course-source-actions a').first();
    await source.hover(); await darkSurfaces('.course-source-actions a');
    await source.focus(); await source.press('Tab');
    assert.ok(await page.evaluate(() => {const element = document.activeElement, style = getComputedStyle(element); return element.matches('.course-source-actions a') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;}), 'Source links must retain a visible keyboard focus indicator');
    await screenshot('dark-source-controls');
    const copy = page.getByRole('button', {name: 'Kopiraj povezavo do trenutnega izbora', exact: true});
    await copy.click(); await page.locator('.copy-fallback input').waitFor();
    assert.equal(await page.locator('.copy-fallback input').inputValue(), page.url());
    await darkSurfaces('.copy-fallback,.copy-fallback input');
    await screenshot('dark-clipboard');
    await page.locator('.copy-fallback input').press('Escape');
    await page.locator('.copy-fallback').waitFor({state: 'hidden'});
    record('UNI surfaces, source links, keyboard focus, and clipboard fallback remain dark and readable');

    await openSearch(term.labels.sl);
    await darkSurfaces('.search-panel,.anatomy-search-results,.anatomy-search-results [data-slot=combobox-item]');
    assert.equal(await page.locator('.anatomy-search-results').evaluate(element => !!element.closest('main')), false, 'Search popup coverage must include its portalled surface');
    await screenshot('dark-search-portal');
    await page.getByRole('option').first().click();
    await state('data-selected-count', resolveAtlasLink({mode: 'course', courseId: course.courseId, selectionId: first.id, structureId: term.id}, atlas, course).elements.length);
    await page.getByRole('button', {name: 'About this atlas', exact: true}).click();
    await page.locator('.about-sheet').waitFor();
    await darkSurfaces('.about-sheet,.about-copy,.about-sheet [data-slot=sheet-description]');
    await screenshot('dark-about-portal');
    await page.locator('.about-sheet [data-slot=sheet-close]').click();
    await page.locator('.about-sheet').waitFor({state: 'hidden'});
    record('Portalled search results and About content inherit the default dark theme');

    await hash({course: course.courseId, selection: first.id, structure: term.id});
    await state('data-selected-count', resolveAtlasLink({mode: 'course', courseId: course.courseId, selectionId: first.id, structureId: term.id}, atlas, course).elements.length);
    for (const [width, height] of [[1440, 1000], [1024, 768], [768, 820], [390, 844], [320, 568], [844, 390]]) {
      await page.setViewportSize({width, height});
      await insideViewport('.course-detail');
      await darkSurfaces('.course-detail,.course-dock');
      assert.ok(await page.locator('.course-detail .detail-scroll').evaluate(element => element.clientHeight >= 40), 'The study list must retain a usable scroll region');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Dark study controls must not create horizontal overflow');
      await screenshot(`dark-course-${width}x${height}`, true);
    }
    record('Dark course framing survives desktop, split pane, portrait, 320px, and landscape resizing');

    await page.setViewportSize({width: 1440, height: 1000});
    const objective = course.unmappedObjectives[0];
    if (objective) {
      const surrounding = course.selections.find(selection => selection.id === objective.contextSelectionId);
      const target = surrounding.conceptIds[0];
      await hash({course: course.courseId, selection: surrounding.id, structure: target});
      await state('data-selected-count', resolveAtlasLink({mode: 'course', courseId: course.courseId, selectionId: surrounding.id, structureId: target}, atlas, course).elements.length);
      const highlighted = await screenshot('dark-highlighted-context-selection', true);
      await hash({course: course.courseId, objective: objective.id, context: '1'});
      await state('data-selected-count', 0); await state('data-context-count', resolveAtlasLink({mode: 'course', courseId: course.courseId, objectiveId: objective.id, context: true}, atlas, course).contextElements.length);
      await darkSurfaces('.unmapped-notice,.context-explanation,.context-action');
      const neutral = await screenshot('dark-neutral-context', false, true);
      assert.ok(neutral.neutral.pixels >= 80 && neutral.neutral.width >= 12 && neutral.neutral.height >= 12, `Neutral surrounding geometry must remain visible: ${JSON.stringify(neutral)}`);
      assert.ok(neutral.pixels <= Math.max(80, highlighted.pixels * .04), `Unmapped context must not acquire the selection tint: ${JSON.stringify({selectedPixels: highlighted.pixels, contextPixels: neutral.pixels})}`);
      record('Selected meshes retain their highlight while unmapped context shows visible neutral geometry without the selection tint');
    }
  }
  await hash({explorer: '1'}); await state('data-mode', 'explorer'); await state('data-selected-count', 0);
  await darkSurfaces('.layers-panel,.bottom-dock,.view-controls');
  const slider = page.getByRole('slider');
  await slider.focus(); await slider.press('ArrowRight');
  assert.ok(await page.locator('.explode-control [data-slot=slider-thumb]').evaluate(element => {
    const input = element.querySelector('input'), style = getComputedStyle(element);
    return input === document.activeElement && input.matches(':focus-visible') && style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2;
  }), 'Keyboard focus on the range input must outline its visible slider thumb');
  await slider.press('Home');
  assert.equal(await slider.inputValue(), '0');
  record('The explorer slider exposes a visible thumb outline during keyboard interaction');
  await screenshot('dark-full-explorer');
  const bone = atlas.concepts.find(concept => concept.name.toLowerCase() === 'femur');
  await openSearch(bone.name);
  await darkSurfaces('.search-panel,.anatomy-search-results');
  await page.getByRole('option').first().click(); await state('data-selected-count', bone.elements.length);
  await darkSurfaces('.detail-sheet,.structure-description,.structure-meta');
  await page.getByRole('button', {name: 'Isolate structure', exact: true}).click();
  await page.getByRole('button', {name: 'Show surrounding anatomy', exact: true}).waitFor();
  await screenshot('dark-explorer-isolated', true);
  record('The full explorer, its controls, and isolated geometry remain usable on the dark 3D stage');
};

const resourceChecks = async atlas => {
  const baseline = process.env.ATLAS_RESOURCE_BASELINE === '1';
  report.resource = {baseline, viewport: page.viewportSize(), minimumGpuFrameMs, note: 'Headless rendering work only; these are not Mac RAM, energy, or device FPS measurements.', measurements: {}};
  const read = () => page.evaluate(() => {
    const p = window.__atlasResourceProbe;
    return {callbacks: p.callbacks, draws: p.draws, triangles: p.triangles, frames: p.frames, pending: p.pending.size, at: performance.now()};
  });
  const measure = async (name, action = async () => {}, expectDraw = false) => {
    const before = await read(); await action();
    if (expectDraw) await page.waitForFunction(draws => window.__atlasResourceProbe.draws > draws, before.draws, {polling: 100, timeout: 30_000});
    await page.waitForTimeout(1000); const after = await read();
    const result = Object.fromEntries(['callbacks', 'draws', 'triangles', 'frames'].map(key => [key, after[key] - before[key]]));
    Object.assign(result, {milliseconds: Math.round(after.at - before.at), pending: after.pending, drawsPerFrame: result.frames ? result.draws / result.frames : 0, trianglesPerFrame: result.frames ? result.triangles / result.frames : 0});
    report.resource.measurements[name] = result; console.log(`RESOURCE ${name} ${JSON.stringify(result)}`); return result;
  };
  const quiet = async name => {
    // Timer polling belongs only to this bounded test, so it cannot create measured animation callbacks.
    await page.waitForFunction(baseline => performance.now() - window.__atlasResourceProbe.lastDrawAt > 600 && (baseline || window.__atlasResourceProbe.pending.size === 0), baseline, {polling: 100, timeout: 30_000});
    const value = await measure(name);
    if (!baseline) assert.ok(value.callbacks === 0 && value.draws === 0 && value.pending === 0, `${name} must have no idle animation work: ${JSON.stringify(value)}`);
    return value;
  };
  const advances = async (name, action) => {const value = await measure(name, action, true); assert.ok(value.draws > 0, `${name} must render`); return value;};
  const centerFrame = () => page.screenshot({clip: {x: 500, y: 210, width: 430, height: 530}});
  const moves = async (name, action) => {const before = await centerFrame(); await advances(name, action); await quiet(`${name}-idle`); assert.ok(!before.equals(await centerFrame()), `${name} must change the rendered anatomy`);};
  await state('data-mode', 'explorer'); await quiet('default-idle');
  const full = await advances('default-camera', () => page.getByRole('button', {name: 'front view', exact: true}).click());
  await quiet('default-camera-idle');
  await advances('skeleton-change', () => page.getByRole('button', {name: 'Skeleton', exact: true}).click());
  await quiet('skeleton-idle');
  if (baseline) {record('Baseline idle callbacks and default/skeleton draw work recorded at the same viewport'); return;}
  await page.getByRole('button', {name: 'Rotate body', exact: true}).click();
  const skeleton = await advances('skeleton-rotation');
  if (!baseline) assert.ok(skeleton.trianglesPerFrame < full.trianglesPerFrame && skeleton.drawsPerFrame < full.drawsPerFrame, 'Hidden systems must reduce submitted geometry and draw calls');
  for (const [name, property, value] of [['hidden', 'display', 'none'], ['offscreen', 'transform', 'translateX(200vw)']]) {
    await page.locator('.scene').evaluate((element, {property, value}) => {element.style[property] = value;}, {property, value});
    await page.waitForFunction(() => window.__atlasResourceProbe.pending.size === 0, null, {polling: 100, timeout: 30_000});
    const suspended = await measure(`${name}-rotation`);
    if (!baseline) assert.ok(suspended.callbacks === 0 && suspended.draws === 0 && suspended.pending === 0, `${name} stage must suspend rotation`);
    await advances(`${name}-resume`, () => page.locator('.scene').evaluate((element, property) => {element.style[property] = '';}, property));
  }
  await page.getByRole('button', {name: 'Pause rotation', exact: true}).click(); await quiet('rotation-stopped');
  await moves('camera-change', () => page.getByRole('button', {name: 'side view', exact: true}).click());
  await moves('orbit', async () => {await page.mouse.move(780, 440); await page.mouse.down(); await page.mouse.move(860, 470, {steps: 8}); await page.mouse.up();});
  await moves('zoom', async () => {await page.mouse.move(740, 430); await page.mouse.wheel(0, -180);});
  await moves('explode', async () => {await page.getByRole('slider').focus(); await page.getByRole('slider').press('End');});
  assert.equal(await page.getByRole('slider').inputValue(), '100');
  // Exercise the original failing transition directly: Reset must restore every
  // system while reassembling an exploded inventory, without an intermediate Home.
  await advances('reset-from-skeleton-inventory', () => page.getByRole('button', {name: 'Assemble and reset', exact: true}).click());
  await quiet('reset-from-skeleton-inventory-idle');
  assert.equal(await page.getByRole('slider').inputValue(), '0');
  await screenshot('resource-full-body-after-reset');
  await moves('all-system-explode', () => page.getByRole('slider').press('End'));
  await advances('reset-from-all-system-inventory', () => page.getByRole('button', {name: 'Assemble and reset', exact: true}).click());
  await quiet('reset-from-all-system-inventory-idle');
  await screenshot('resource-full-body-after-all-system-reset');
  await page.getByRole('button', {name: 'Hide all', exact: true}).click(); await quiet('hidden-systems-idle');
  const femur = atlas.concepts.find(concept => concept.name.toLowerCase() === 'femur');
  await openSearch(femur.name);
  const selected = await advances('hidden-layer-selection', () => page.getByRole('option').first().click());
  await state('data-selected-count', femur.elements.length); await quiet('selection-idle');
  if (!baseline) assert.ok(selected.trianglesPerFrame < skeleton.trianglesPerFrame, 'A selected part must restore only its required batch');
  await screenshot('resource-hidden-layer-selection', true);
  await advances('isolate-selection', () => page.getByRole('button', {name: 'Isolate structure', exact: true}).click()); await quiet('isolated-idle');
  const rendered = await screenshot('resource-isolated-selection', true);
  await page.mouse.click(rendered.sample.x, rendered.sample.y); await state('data-selected-count', 1); await quiet('picked-idle');
  assert.ok(femur.elements.includes(params().get('mesh')), 'The shared geometry must preserve exact picking');
  record('Resource lifecycle, camera/orbit/zoom/explosion, hidden-layer highlight, isolation, and exact picking remain functional');
  if (!baseline) {
    let release, intercepted;
    const waiting = new Promise(resolve => {release = resolve;}), requested = new Promise(resolve => {intercepted = resolve;});
    await page.route(/\/models\/body-\d+\.bin(?:\.gz)?$/, async route => {intercepted(); await waiting; await route.continue().catch(() => {});});
    await page.reload({waitUntil: 'domcontentloaded'}); await page.locator('.scene canvas').waitFor(); await requested;
    // Exercise the real error handler before delayed model downloads can report 100%.
    await page.locator('.scene canvas').evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost', {cancelable: true})));
    release(); await page.locator('.loading.error').waitFor(); await quiet('context-lost-during-load');
    assert.match(await page.locator('.loading.error').innerText(), /paused.*Reload/s);
    record('Context loss during a delayed model load keeps the reload message and stops animation callbacks');
  }
};

const explorerChecks = async atlas => {
  await page.setViewportSize({width: 1440, height: 1000});
  await hash({explorer: '1'});
  await state('data-mode', 'explorer');
  await ready();
  const heart = atlas.concepts.find(concept => concept.name.toLowerCase() === 'heart');
  assert.ok(heart, 'The existing explorer reference contains its original heart concept');
  await openSearch(heart.name);
  await page.getByRole('option').first().click();
  await state('data-selected-count', heart.elements.length);
  await page.getByRole('button', {name: 'Isolate structure', exact: true}).click();
  await page.getByRole('button', {name: 'Show surrounding anatomy', exact: true}).waitFor();
  await page.getByRole('button', {name: 'Clear selection', exact: true}).click();
  await page.getByRole('button', {name: 'back view', exact: true}).click();
  await openSearch(heart.name);
  await page.getByRole('option').first().click();
  await state('data-selected-count', heart.elements.length);
  assert.equal(params().get('view'), 'back', 'An ordinary explorer selection must preserve the camera view');
  assert.equal(await page.getByRole('button', {name: 'back view', exact: true}).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', {name: 'Clear selection', exact: true}).click();
  await page.getByRole('button', {name: 'Skeleton', exact: true}).click();
  await page.getByRole('slider').focus();
  await page.getByRole('slider').press('End');
  await page.waitForFunction(() => document.querySelector('.explode-control input[type=range]')?.value === '100');
  assert.ok(await page.getByRole('button', {name: 'back view', exact: true}).isDisabled());
  const femur = atlas.concepts.find(concept => concept.name.toLowerCase() === 'femur');
  assert.ok(femur, 'The explorer reference contains the original femur concept');
  await openSearch(femur.name);
  await page.getByRole('option').first().click();
  await state('data-selected-count', femur.elements.length);
  assert.equal(await page.getByRole('slider').inputValue(), '100', 'Selecting from inventory must preserve its explosion amount');
  assert.equal(params().get('view'), 'front');
  const rendered = await screenshot('explorer-selected-inventory', true);
  await page.mouse.click(rendered.sample.x, rendered.sample.y);
  await state('data-selected-count', 1);
  assert.ok(femur.elements.includes(params().get('mesh')), 'A click on rendered inventory geometry must pick the exact visible part');
  assert.equal(await page.getByRole('slider').inputValue(), '100', 'Picking geometry must preserve its explosion amount');
  record('Explorer camera view survives ordinary selections; exploded inventory survives search and direct mesh picking');
  await page.getByRole('button', {name: 'Assemble and reset', exact: true}).click();
  await state('data-selected-count', 0);
  await screenshot('preserved-explorer');
  record('Full explorer search, isolation, skeleton preset, exploded inventory, and reset remain functional');
};

try {
  if (!resourceOnly) await darkFirstPaint();
  if (resourceOnly) await hash({explorer: '1'});
  else await page.goto(base, {waitUntil: 'domcontentloaded'});
  await ready();
  const atlas = await (await page.request.get(new URL('/models/atlas.json', base).href)).json();
  const response = await page.request.get(new URL('/api/course', base).href);
  const runtime = response.ok() && response.headers()['content-type']?.includes('application/json') ? await response.json() : null;
  if (process.env.ATLAS_TEST_REQUIRE_COURSE === '1' || process.env.ATLAS_COURSE_FILE) assert.ok(runtime?.course, 'The configured private course must be available');
  const course = runtime?.course;
  record('The existing catalogue and WebGL renderer load');

  if (resourceOnly) await resourceChecks(atlas);
  else if (scope === 'region') await regionalChecks({page,course,atlas,runtime,base,state,hash,ready,screenshot,record,insideViewport,openSearch,report});
  else if (darkOnly) await darkChecks(course, atlas);
  else {
    if (course) await regionalChecks({page,course,atlas,runtime,base,state,hash,ready,screenshot,record,insideViewport,openSearch,report});
    await darkChecks(course, atlas);
    await explorerChecks(atlas);
  }
  assert.deepEqual(pageErrors, [], 'Browser runtime must not throw uncaught errors');
  record('No uncaught page errors');
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Browser checks complete. Local screenshots/report: ${output}`);
} catch (error) {
  await page.screenshot({path: path.join(output, 'failed.png'), timeout: 60_000}).catch(() => {});
  await writeFile(path.join(output, 'failure.json'), `${JSON.stringify({error: error.message, pageErrors, completed: report.checks, resource: report.resource, screenshotTimings: report.screenshotTimings}, null, 2)}\n`);
  throw error;
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
