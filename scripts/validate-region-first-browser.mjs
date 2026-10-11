// Representative region-first checks on the caller's actual Playwright page.
// No browser dependency, benchmark, repeated memory cycle, or device-memory claim.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseAtlasLink, resolveAtlasLink, serializeAtlasLink, obsidianUrl, spaceoSourceUrl, courseSourceUrl} from '../app/course-navigation.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const geometryPath = url => /\/models\/[^/]+\.bin(?:\.gz)?$/.test(new URL(url).pathname);
const sceneModulePath = url => /\/(?:app\/)?scene(?:-renderer)?(?:[.-])/.test(new URL(url).pathname);

// Adapted from validate-memory-browser.mjs: observe actual buffer ownership and
// the browser's context-lost event. Losing a context never counts as deletion.
function installOwnershipProbe() {
  const contexts = new WeakMap(), buffers = new WeakMap(), records = new Map(), observedExtensions = new WeakSet();
  let contextId = 0, bufferId = 0;
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const gl = getContext.apply(this, args);
    if (gl && ['webgl', 'webgl2', 'experimental-webgl'].includes(args[0]) && !contexts.has(gl)) {
      const id = ++contextId, main = document.querySelector('main');
      contexts.set(gl, id); this.dataset.regionCheckContext = String(id);
      const record = {buffers: new Map(), bindings: new Map(), created: 0, deleted: 0, draws: 0, contextLost: false, contextLostEvent: false,
        initialRoute: {mode: main?.dataset.mode, scope: Number(main?.dataset.scopeCount ?? 0), selected: Number(main?.dataset.selectedCount ?? 0)}};
      records.set(id, record);
      this.addEventListener('webglcontextlost', () => {record.contextLost = true; record.contextLostEvent = true;});
      this.addEventListener('webglcontextrestored', () => {record.contextLost = false;});
    }
    return gl;
  };
  for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext].filter(Boolean)) {
    for (const name of ['getExtension', 'createBuffer', 'bindBuffer', 'bufferData', 'deleteBuffer', 'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      if (!Object.hasOwn(type.prototype, name)) continue;
      const original = type.prototype[name];
      type.prototype[name] = function (...args) {
        const result = original.apply(this, args), record = records.get(contexts.get(this));
        if (!record) return result;
        if (name === 'getExtension' && args[0] === 'WEBGL_lose_context' && result && !observedExtensions.has(result)) {
          observedExtensions.add(result);
          const lose = result.loseContext, gl = this;
          result.loseContext = function (...values) {
            const value = lose.apply(this, values);
            // Observe the real context state, not merely a request. A detached
            // canvas can be collected before its asynchronous loss event arrives.
            record.contextLost = gl.isContextLost();
            return value;
          };
        }
        if (name === 'createBuffer' && result) {
          const id = ++bufferId; buffers.set(result, id); record.buffers.set(id, 0); record.created++;
        }
        if (name === 'bindBuffer') record.bindings.set(args[0], args[1] ? buffers.get(args[1]) : null);
        if (name === 'bufferData') {
          const id = record.bindings.get(args[0]), source = args[1];
          if (id !== undefined && id !== null) {
            let bytes = typeof source === 'number' ? source : source?.byteLength || 0;
            if (ArrayBuffer.isView(source) && args.length > 3) {
              const width = source.BYTES_PER_ELEMENT || 1, offset = args[3] || 0;
              bytes = args[4] ? args[4] * width : Math.max(0, source.byteLength - offset * width);
            }
            record.buffers.set(id, bytes);
          }
        }
        if (name === 'deleteBuffer' && args[0] && record.buffers.delete(buffers.get(args[0]))) record.deleted++;
        if (name.startsWith('draw')) record.draws++;
        return result;
      };
    }
  }
  window.__regionFirstOwnership = () => [...records].map(([id, record]) => ({id,
    connected: !!document.querySelector(`canvas[data-region-check-context="${id}"]`),
    buffers: record.buffers.size, bufferBytes: [...record.buffers.values()].reduce((a, b) => a + b, 0),
    created: record.created, deleted: record.deleted, draws: record.draws,
    contextLost: record.contextLost, contextLostEvent: record.contextLostEvent, initialRoute: record.initialRoute}));
}

/**
 * The parent owns browser launch/closure. Run-code can import this function and
 * pass its existing page; all screenshots and the report remain local to output.
 * A fresh document is used for each cold route, retaining that same browser page.
 */
export async function checkRegionFirst({page, base, output = path.join(root, '.private-course/region-first-browser'),
  timeout = 60000, sourceHead = false, requireCourse = false, desktopViewport = {width: 1440, height: 1000}} = {}) {
  assert.ok(page && base, 'checkRegionFirst requires the caller’s page and base URL');
  const home = new URL(base); home.hash = '';
  assert.ok(['http:', 'https:'].includes(home.protocol), 'base must be an HTTP(S) app URL');
  output = path.resolve(output);
  await mkdir(output, {recursive: true});
  const report = {kind: 'Representative region-first UI and explicit WebGL ownership cleanup; not total memory',
    status: 'running', checks: [], screenshots: [], requests: [], errors: []};
  let phase = 'cold-chooser', releaseCourse, courseRoute;
  const scriptReads = new Set(), sceneModules = [];
  const onRequest = request => {report.requests.push({phase, url: request.url(), type: request.resourceType()});};
  const onPageError = error => {report.errors.push({phase, kind: 'pageerror', message: error.message});};
  const onConsole = message => {
    if (message.type() !== 'error') return;
    const pathname = message.location().url ? new URL(message.location().url).pathname : '';
    if (message.text().includes('status of 404') && ['/api/course', '/favicon.ico'].includes(pathname)) return;
    report.errors.push({phase, kind: 'console', message: message.text()});
  };
  const onRequestFailed = request => {
    const message = request.failure()?.errorText ?? 'Request failed';
    // Document navigation and renderer disposal deliberately abort stale fetches.
    if (message !== 'net::ERR_ABORTED') report.errors.push({phase, kind: 'requestfailed', url: request.url(), message});
  };
  const onResponse = response => {
    const url = response.url(), pathname = new URL(url).pathname;
    if (response.status() >= 400 && !(response.status() === 404 && (pathname === '/api/course' || pathname === '/favicon.ico'))) {
      report.errors.push({phase, kind: 'http', url, status: response.status()});
    }
    if (response.request().resourceType() !== 'script') return;
    const requestedPhase = phase;
    if (sceneModulePath(url)) sceneModules.push({phase: requestedPhase, url});
    // Production filenames can be hashed. Identify the lazy renderer by its
    // existing canvas label as well as dev/module paths, without chunk counts.
    const read = response.text().then(body => {
      if (body.includes('Interactive human anatomy. Drag to orbit')) sceneModules.push({phase: requestedPhase, url});
    }).catch(error => {report.errors.push({phase: requestedPhase, kind: 'script-read', url, message: String(error)});});
    scriptReads.add(read); read.finally(() => scriptReads.delete(read));
  };
  page.on('request', onRequest); page.on('pageerror', onPageError); page.on('console', onConsole);
  page.on('requestfailed', onRequestFailed); page.on('response', onResponse);
  const record = (name, evidence = {}) => {report.checks.push({name, ...evidence});};
  const screenshot = async name => {
    const filename = path.join(output, `${name}.png`);
    await page.screenshot({path: filename, fullPage: true}); report.screenshots.push(filename);
  };
  const state = async (selector, attribute, value) => {
    await page.waitForFunction(({selector, attribute, value}) => document.querySelector(selector)?.getAttribute(attribute) === String(value),
      {selector, attribute, value}, {timeout});
  };
  const ownership = () => page.evaluate(() => window.__regionFirstOwnership());
  const scene = () => page.locator('.scene');
  const ready = async () => {
    await state('.scene', 'data-load-state', 'ready');
    await page.locator('.scene canvas').waitFor({state: 'visible', timeout});
    await page.locator('.loading').waitFor({state: 'hidden', timeout});
    await page.waitForFunction(() => Number(document.querySelector('.scene')?.dataset.visibleParts) > 0, null, {timeout});
  };
  const live = async label => {
    const contexts = await ownership(), active = contexts.filter(context => context.connected);
    assert.equal(active.length, 1, `${label}: exactly one connected WebGL owner`);
    assert.equal(active[0].contextLost, false, `${label}: displayed context remains usable`);
    assert.ok(active[0].bufferBytes > 0 && active[0].draws > 0, `${label}: real geometry buffers and draws observed`);
    return {owner: await scene().getAttribute('data-scene-owner'), context: active[0].id};
  };
  const retired = async (previous, label) => {
    await page.waitForFunction(id => window.__regionFirstOwnership().some(context => context.id === id &&
      !context.connected && context.contextLost && context.buffers === 0 && context.bufferBytes === 0), previous.context, {timeout});
    const context = (await ownership()).find(context => context.id === previous.context);
    assert.equal(context.deleted, context.created, `${label}: all created buffer handles explicitly deleted`);
    record(label, {context});
  };
  const noScene = async label => {
    assert.equal(await page.locator('canvas').count(), 0, `${label}: no canvas`);
    assert.deepEqual(await ownership(), [], `${label}: no WebGL context initialized`);
    assert.deepEqual(report.requests.filter(request => request.phase === phase && geometryPath(request.url)), [], `${label}: no geometry requested`);
    await Promise.all([...scriptReads]);
    assert.deepEqual(sceneModules.filter(module => module.phase === phase), [], `${label}: lazy scene module remains unfetched`);
  };
  try {
    await page.addInitScript(installOwnershipProbe);
    await page.setViewportSize(desktopViewport);
    // Clear the document before navigation; page routing also disables HTTP cache.
    const uncached = route => route.continue();
    await page.route('**/models/**', uncached);
    try {
      await page.goto('about:blank');
      await page.goto(home.href, {waitUntil: 'domcontentloaded', timeout});
      await page.getByRole('heading', {name: 'Choose a region.', exact: true}).waitFor({timeout});
      await page.getByRole('link', {name: 'Hand', exact: true}).waitFor({timeout});
      await page.waitForLoadState('networkidle', {timeout});
      await noScene('Cold blank chooser');
      await screenshot('chooser-desktop'); record('Cold blank chooser has no canvas, lazy scene module or geometry');

      const catalogue = await page.request.get(new URL('/models/atlas.json', home).href);
      assert.ok(catalogue.ok(), 'Served anatomy catalogue is available');
      const atlas = await catalogue.json();
      assert.equal(atlas.parts.length, 2234, 'Source catalogue retains all 2,234 meshes');
      const route = () => parseAtlasLink(new URL(page.url()).hash);
      const expected = () => resolveAtlasLink(route(), atlas, null);
      const checkAssembly = async () => {
        const resolved = expected();
        await state('main', 'data-scope-count', resolved.scopeElements.length);
        await state('.scene', 'data-geometry-parts', resolved.scopeElements.length);
        await state('.scene', 'data-visible-parts', resolved.scopeElements.length);
        await state('main', 'data-selected-count', 0);
        return resolved;
      };
      phase = 'hand';
      await page.getByRole('link', {name: 'Hand', exact: true}).click();
      await state('main', 'data-region', 'hand'); await ready();
      await checkAssembly();
      const handBoth = await live('Hand');
      record('Hand opens from chooser UI as an unselected assembly', handBoth);

      phase = 'hand-side';
      await page.locator('.bottom-dock').getByRole('combobox', {name: 'Body side'}).selectOption('right');
      await page.waitForFunction(() => new URLSearchParams(location.hash.slice(1)).get('side') === 'right', null, {timeout});
      await ready(); await checkAssembly();
      const handRight = await live('Right hand');
      assert.notEqual(handRight.context, handBoth.context, 'Changing geometry scope replaces the renderer');
      await retired(handBoth, 'Side switch deletes buffers and observes context loss');
      record('Body side control resolves the right-hand scope from the served catalogue', handRight);

      phase = 'scaphoid';
      await page.locator('.bottom-dock .dock-current').click();
      const scaphoidPart = atlas.parts.find(part => /scaphoid/i.test(part.name) && expected().scopeElements.includes(part.id));
      assert.ok(scaphoidPart, 'Right-hand assembly contains a source-named scaphoid');
      await page.locator(`.region-detail button[data-mesh="${scaphoidPart.id}"]`).click();
      await state('main', 'data-selected-count', 1); await state('main', 'data-isolate', false);
      await state('.scene', 'data-highlighted-parts', 1);
      const visible = Number(await scene().getAttribute('data-visible-parts'));
      assert.ok(visible > 1, 'Scaphoid highlight preserves visible surrounding parts');
      assert.deepEqual(await live('Scaphoid highlighted'), handRight, 'Contextual highlight preserves renderer and GL owner');
      await screenshot('hand-scaphoid-context');
      record('Scaphoid highlights within its assembly with a stable owner', {mesh: scaphoidPart.id, visibleParts: visible, ...handRight});

      await page.locator('.region-detail').getByRole('button', {name: 'Isolate', exact: true}).click();
      await state('main', 'data-isolate', true); await state('.scene', 'data-visible-parts', 1);
      assert.deepEqual(await live('Scaphoid isolated'), handRight, 'Isolation keeps the same geometry owner');
      await page.locator('.region-detail').getByRole('button', {name: 'Show assembly', exact: true}).click();
      await state('main', 'data-isolate', false); await state('.scene', 'data-visible-parts', visible);
      assert.deepEqual(await live('Assembly restored'), handRight);
      record('Explicit isolate and restore keep the regional renderer');

      phase = 'rotation';
      await page.getByRole('button', {name: 'Rotate body', exact: true}).click();
      await state('.scene', 'data-auto-rotate', true);
      const draws = (await ownership()).find(context => context.id === handRight.context).draws;
      await page.waitForFunction(({id, draws}) => window.__regionFirstOwnership().some(context => context.id === id && context.draws > draws),
        {id: handRight.context, draws}, {timeout});
      await page.getByRole('button', {name: 'Pause rotation', exact: true}).click();
      await state('.scene', 'data-auto-rotate', false);
      assert.deepEqual(await live('Rotation paused'), handRight);
      record('Rotation starts, produces a subsequent GL draw, and pauses');

      phase = 'foot';
      // Search/inspection closes via Escape; region navigation remains real UI.
      await page.keyboard.press('Escape');
      await page.getByRole('button', {name: 'Regions', exact: true}).click();
      await page.locator('.region-panel').getByText('Lower limb', {exact: true}).click();
      await page.locator('.region-panel').getByRole('button', {name: 'Foot', exact: true}).click();
      await state('main', 'data-region', 'foot'); await ready(); await checkAssembly();
      const foot = await live('Foot');
      assert.notEqual(foot.context, handRight.context);
      await retired(handRight, 'Hand to Foot deletes actual GL buffers and observes context loss');
      await screenshot('foot-desktop'); record('Foot opens through region navigation', foot);

      phase = 'narrow';
      await page.setViewportSize({width: 390, height: 844});
      await page.locator('.bottom-dock .dock-current').click();
      await page.locator('.region-detail').waitFor({state: 'visible', timeout});
      // Wait for the renderer's resize, then record geometry/layout without pixel thresholds.
      await page.waitForFunction(() => {
        const canvas = document.querySelector('.scene canvas');
        return canvas && Math.round(canvas.getBoundingClientRect().width) === document.querySelector('.scene').clientWidth;
      }, null, {timeout});
      const documentSize = await page.evaluate(() => ({viewport: {width: innerWidth, height: innerHeight},
        clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth}));
      assert.deepEqual(documentSize.viewport, {width: 390, height: 844});
      assert.ok(documentSize.scrollWidth <= documentSize.clientWidth && documentSize.bodyScrollWidth <= documentSize.clientWidth,
        '390 × 844 document has no horizontal overflow with structures open');
      await screenshot('foot-390x844'); record('Narrow 390 × 844 document and open inspector have no horizontal overflow', documentSize);

      phase = 'return-home';
      await page.keyboard.press('Escape');
      await page.getByRole('button', {name: 'Human Atlas 3D', exact: true}).click();
      await state('main', 'data-mode', 'chooser');
      assert.equal(await page.locator('canvas').count(), 0);
      await retired(foot, 'Return home disposes Foot');
      await page.setViewportSize(desktopViewport);

      phase = 'explorer';
      await page.getByRole('link', {name: 'Open explorer', exact: true}).click();
      await state('main', 'data-mode', 'explorer'); await ready();
      await state('.scene', 'data-geometry-parts', 2234);
      await state('.scene', 'data-picker-owners', 2234);
      const explorer = await live('Full Body Explorer');
      await screenshot('full-body-explorer');
      record('Explicit Full Body Explorer retains all 2,234 geometry parts and picker owners', explorer);
      phase = 'explorer-home';
      await page.getByRole('button', {name: 'Human Atlas 3D', exact: true}).click();
      await state('main', 'data-mode', 'chooser');
      assert.equal(await page.locator('canvas').count(), 0);
      await retired(explorer, 'Return home disposes Full Body Explorer');

      const courseResponse = await page.request.get(new URL('/api/course', home).href);
      const available = courseResponse.ok() && courseResponse.headers()['content-type']?.includes('application/json');
      if (!available) {
        assert.ok(!requireCourse, 'A real private course runtime is required');
        assert.ok(courseResponse.status() === 404 || (courseResponse.ok() && !courseResponse.headers()['content-type']?.includes('application/json')),
          'Unavailable course must be a static-host response, not a runtime error');
        record('Direct course route and source checks skipped: private course runtime unavailable');
      } else {
        const runtime = await courseResponse.json(), course = runtime.course;
        const selection = course?.selections.find(selection => selection.region && selection.noteBindingIds?.length);
        assert.ok(selection, 'Available course has an assembly with source bindings');
        const link = {mode: 'course', courseId: course.courseId, selectionId: selection.id};
        const resolved = resolveAtlasLink(link, atlas, course), scope = new Set(resolved.scopeElements);
        assert.ok(scope.size > 1, 'Direct course selection resolves an assembly');
        phase = 'course-pending';
        const gate = new Promise(resolve => {releaseCourse = resolve;});
        courseRoute = async route => {await gate; await route.continue();};
        await page.route('**/api/course', courseRoute);
        await page.goto('about:blank');
        const requested = page.waitForRequest(request => new URL(request.url()).pathname === '/api/course', {timeout});
        await page.goto(`${home.href}${serializeAtlasLink(link)}`, {waitUntil: 'domcontentloaded', timeout});
        await requested; await state('main', 'data-mode', 'chooser');
        await noScene('Unresolved direct course route');
        record('Fresh direct course route waits for course resolution before importing the renderer');
        phase = 'course-direct'; releaseCourse();
        await state('main', 'data-mode', 'course'); await ready();
        await state('main', 'data-scope-count', scope.size);
        await state('main', 'data-selected-count', 0);
        await state('.scene', 'data-geometry-parts', scope.size);
        await state('.scene', 'data-visible-parts', scope.size);
        const courseOwner = await live('Direct course assembly');
        const active = (await ownership()).find(context => context.id === courseOwner.context);
        assert.deepEqual(active.initialRoute, {mode: 'course', scope: scope.size, selected: 0}, 'Assembly resolved before WebGL creation');
        const chunkIndices = [...new Set(atlas.parts.filter(part => scope.has(part.id)).map(part => part.chunk))];
        const compressed = await page.evaluate(() => typeof DecompressionStream !== 'undefined');
        const expectedPaths = chunkIndices.map(index => {
          const chunk = atlas.chunks[index]; return new URL(compressed && chunk.gzip ? chunk.gzip : chunk.url, home).pathname;
        }).sort();
        const fetchedPaths = report.requests.filter(request => request.phase === phase && geometryPath(request.url)).map(request => new URL(request.url).pathname).sort();
        assert.deepEqual(fetchedPaths, expectedPaths, 'Fresh course fetches exactly the scope-referenced chunk URLs');
        await page.unroute('**/api/course', courseRoute); courseRoute = undefined;
        record('Direct course assembly initializes before WebGL and fetches only referenced chunks', {scopeParts: scope.size, chunks: expectedPaths, ...courseOwner});

        await page.locator('.bottom-dock .dock-current').click();
        await page.locator('.source-disclosure summary').click();
        const expectedHrefs = selection.noteBindingIds.flatMap(id => {
          const binding = course.noteBindings[id], hrefs = [];
          // Match the public helpers and SourceLinks' optional-link behavior.
          try {if (runtime.links.vaultName) hrefs.push(obsidianUrl(binding.note.path, runtime.links.vaultName, {heading: binding.note.heading, vaultRoot: runtime.links.vaultRoot}));} catch { /* Invalid optional deployment link is omitted by UI. */ }
          try {if (runtime.links.noteBaseUrl) hrefs.push(spaceoSourceUrl(binding.note.route, runtime.links.noteBaseUrl));} catch { /* Other bound sources still work. */ }
          hrefs.push(courseSourceUrl(id, 'pdf', {page: binding.courseSource.page}));
          binding.figures.forEach((figure, index) => hrefs.push(courseSourceUrl(id, 'figure', {index})));
          if (binding.capture) hrefs.push(courseSourceUrl(id, 'capture'));
          return hrefs;
        });
        const hrefs = await page.locator('.course-sources a').evaluateAll(anchors => anchors.map(anchor => anchor.getAttribute('href')));
        assert.deepEqual(hrefs, expectedHrefs, 'Every source href preserves the exact binding, path and anchor from runtime/helpers');
        if (sourceHead) for (const href of [...new Set(hrefs.filter(href => href.startsWith('/api/course/sources/')).map(href => href.split('#')[0]))]) {
          const response = await page.request.head(new URL(href, home).href);
          assert.ok(response.ok(), `Bound HTTP source HEAD succeeds: ${href}`);
        }
        await screenshot('course-direct-sources');
        record('Exact source hrefs checked without launching Obsidian', {links: hrefs.length, httpSourceHead: sourceHead});
        phase = 'course-home';
        await page.keyboard.press('Escape');
        await page.getByRole('button', {name: 'Human Atlas 3D', exact: true}).click();
        await state('main', 'data-mode', 'chooser');
        await retired(courseOwner, 'Return home disposes direct course assembly');
      }
      await Promise.all([...scriptReads]);
      assert.deepEqual(report.errors, [], 'No uncaught page, HTTP, script-read or failed-request errors');
      report.status = 'passed';
      return report;
    } finally {
      releaseCourse?.();
      if (courseRoute) await page.unroute('**/api/course', courseRoute);
      await page.unroute('**/models/**', uncached);
    }
  } catch (error) {
    report.status = 'failed'; report.error = String(error);
    try {await screenshot('failure');} catch { /* Preserve the original failure if page is unavailable. */ }
    throw error;
  } finally {
    await Promise.all([...scriptReads]);
    page.off('request', onRequest); page.off('pageerror', onPageError); page.off('console', onConsole);
    page.off('requestfailed', onRequestFailed); page.off('response', onResponse);
    await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  }
}

async function main() {
  const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
  const {chromium} = await import(path.isAbsolute(moduleName) ? pathToFileURL(moduleName).href : moduleName);
  const output = path.resolve(process.env.ATLAS_TEST_OUTPUT || path.join(root, '.private-course/region-first-browser'));
  let server, browser, base = process.env.ATLAS_TEST_URL;
  try {
    if (!base) {
      const {createPrivateServer, runtimeConfig} = await import('../server/private-runtime.mjs');
      ({server} = await createPrivateServer({...runtimeConfig(), host: '127.0.0.1', port: 0, origin: null}));
      server.listen(0, '127.0.0.1'); await once(server, 'listening');
      base = `http://127.0.0.1:${server.address().port}/`;
    }
    browser = await chromium.launch({executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
      headless: true, chromiumSandbox: true,
      args: process.env.ATLAS_SOFTWARE_GL === '1' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []});
    const context = await browser.newContext({reducedMotion: 'reduce', serviceWorkers: 'block'});
    const page = await context.newPage();
    await checkRegionFirst({page, base, output, sourceHead: process.env.ATLAS_TEST_SOURCE_HEAD === '1', requireCourse: process.env.ATLAS_TEST_REQUIRE_COURSE === '1'});
    console.log(`Region-first browser checks passed. Local report: ${path.join(output, 'report.json')}`);
  } finally {
    await browser?.close();
    if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
