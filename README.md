# Human Atlas

Study anatomy by region with React and Three.js. Human Atlas retains **2,234 individually selectable meshes**, **15 anatomical systems** and **3,432 named concepts** from the BodyParts3D adult male reference.

**[Explore the live demo](https://human-atlas-seven.vercel.app)**

The opening region chooser does not start WebGL or load geometry. Choose an anatomical assembly, follow a direct study link, or explicitly open Full Body Explorer. The interface is dark from first paint.

## Explore

- Explore permanent regions, either side, or composite limb and joint views.
- Select a structure in its assembly with a contrasting amber highlight.
- Orbit, zoom, switch layers, and explicitly isolate a selected structure.
- Open Full Body Explorer for system controls and exploded anatomy.
- Search anatomical names and source identifiers.
- Use compact controls and detail panels on mobile.

## UNI study mode

An optional private runtime connects the atlas to SpaceO's validated anatomy course overlay. Direct study links resolve the requested region before starting 3D. Selecting a name or mesh highlights it within the surrounding anatomy, preserving the regional list and camera. Side and layer controls refine the assembly; isolation remains explicit. All seven accepted course selections keep their source links and terminology.

The regional list preserves authored Slovenian/Latin/English terms and their learning order, then includes additional source-named meshes for context. Those additional meshes do not acquire teaching labels, evidence or exam requirements. A region's navigation label can describe the whole anatomical area while the original teaching-selection label and sources remain available in its disclosure. Existing taught-structure links also recover their authored region.

Objectives without verified model geometry are identified in their original sources. Their optional context view shows surrounding anatomy in its normal material, with **no target highlight**. Course data stays in SpaceO or ignored local runtime inputs; it is never part of the public static build.

See [runtime configuration and scene links](docs/course-runtime.md), [regional geometry](docs/REGIONAL-ATLAS.md) and [integration and native state](docs/NATIVE.md). The authorized regional cutover is complete; [the deployment record](docs/REGIONAL-DEPLOYMENT.md) identifies the exact serving application and recovery. A repository merge does not itself deploy another build or synchronize the Mac vault.

## Run locally

Requires Node.js 22.13 or newer. No API keys or accounts are needed.

```sh
npm ci
npm run dev
```

Open http://localhost:3016. To build the static site, run `npm run build`; the output is in `dist/`.

## Validate

```sh
npm run check
node scripts/validate-atlas.mjs
node --experimental-strip-types scripts/validate-interactions.mjs
npm run test:course
npm run test:geometry
npm run test:scene
npm run test:regions
npm run test:loading
npm run test:runtime
npm run build
```

Source checks cover exact geometry and bounded raycasts across shared buffers, GPU-frame fallback and cleanup, visible animation timing, nonoverlapping exploded layouts, search and inspection contracts, and tap-versus-drag handling. Run checks affected by the change and reuse the [recorded native acceptance](docs/NATIVE.md); no further memory comparison is scheduled.

Course checks cover catalogue-byte identity, authored versus regional mesh membership, multilingual/source contracts, unmapped-objective separation, side/layer links and legacy routes, private runtime boundaries, and accidental inclusion of local course files in public builds. Repeatable source tests use public synthetic fixtures and the public anatomy catalogue.

`npm run test:browser` runs the representative [region-first browser checker](scripts/validate-region-first-browser.mjs) using an externally installed Playwright/Chromium; it adds no dependency. Set `PLAYWRIGHT_MODULE` to the installed module and `CHROMIUM_EXECUTABLE` when needed. `ATLAS_TEST_URL` targets an existing app; otherwise the checker serves the existing `dist/` through the private runtime on an ephemeral loopback port. The direct launcher keeps Chromium sandboxing enabled. Reports and screenshots stay under ignored `.private-course/region-first-browser/`, or `ATLAS_TEST_OUTPUT`.

The single pass checks a cold chooser without canvas, scene module or geometry; Hand and side navigation; contextual scaphoid highlighting with a stable renderer; explicit isolate/restore and rotation; Foot navigation and actual GL buffer deletion/context loss; explicit Full Body Explorer with 2,234 meshes; return-home disposal; and a 390 × 844 document without horizontal overflow. When `/api/course` supplies a course, it also checks a fresh direct assembly route before renderer initialization, exact scope-referenced chunk requests and source hrefs. `ATLAS_TEST_REQUIRE_COURSE=1` requires that private route; `ATLAS_TEST_SOURCE_HEAD=1` additionally checks bound HTTP sources without opening native note links. Parents can import `checkRegionFirst({page, base, output, sourceHead, requireCourse})` to use their existing browser page.

`npm run test:browser:legacy` preserves the [historical browser driver](scripts/validate-browser.mjs), whose root-renderer and label assumptions predate the region chooser. Its original `ATLAS_TEST_SCOPE=all|dark|region|resource` suites document earlier interaction, theme, regional and resource checks; they are not the current default acceptance pass. The separate historical memory driver remains source for a future explicit measurement request; scripted comparisons are cancelled and are not a merge gate. The current checker verifies explicit ownership cleanup and makes no total-memory, FPS or battery claims.

## Anatomy data

The current viewer uses **BodyParts3D 4.0**, an adult male reference anatomy, licensed **CC BY 4.0**. It does not represent every human structure or variation. Individual source meshes are distinct from named concepts, which may group multiple meshes. Descriptions distinguish general system context from individual organ explanations.

The accepted simplified geometry contains 2,288,268 triangles; this regional implementation preserves its exact vertex, normal and index bytes. The full catalogue downloads approximately 34 MB of compressed geometry. Regions load only their referenced partitions. Full credits, source links, and adaptation details are in [ATTRIBUTION.md](public/ATTRIBUTION.md).

This is an educational explorer, not a diagnostic or surgical tool.

## How it works

Content-hashed regional/side files store each original mesh once. Composite views reuse them; a crossing structure stays whole. Catalogue regions combine incomplete source groups with documented spatial rules. The scene merges only requested parts into batches; rendering and picking share position, packed-normal and index buffers. Per-structure GPU textures control translation, visibility and selection, while wholly hidden batches skip drawing.

Rendering wakes for scene changes, input, model arrival or resize and stops when the viewer settles or becomes hidden. A nonblocking WebGL2 fence keeps at most one anatomy frame in flight, coalescing later changes to the newest state. Animation uses elapsed visible time, so a slow GPU does not accumulate stale reassembly frames; hidden time does not advance it. WebGL1 and unavailable fences keep the normal rendering path. Cleanup cancels pending work and releases the scene's GPU resources. Development uses the platform's file events rather than forced polling.

The optional WebMCP tools expose anatomy search and inspection in compatible browsers. The visible interface works without them.

## Rebuilding geometry

The repository includes browser-ready regional geometry. Rebuilding from upstream is optional: obtain the official BodyParts3D OBJ archive and English metadata tables, prepare the joined concepts and display-system mappings, run `scripts/convert-anatomy.py`, then `node scripts/optimize-anatomy.mjs`, `node scripts/compress-models.mjs` and `node --experimental-strip-types scripts/partition-anatomy.mjs`. The upstream simplification uses a 0.2% relative error limit per structure; partitioning performs no further simplification. Catalogue byte changes require a coordinated SpaceO pin update.

## Deploy

Import this repository into Vercel as a Vite project. The included `vercel.json` configures `npm ci`, `npm run build`, and the `dist` output directory. It can also be served by a static host.

## License

Original application code is released under the [MIT License](LICENSE). **The anatomy data has its own CC BY 4.0 license**; preserve the attribution when redistributing it. Third-party dependencies retain their respective licenses.

Issues and pull requests are welcome. Please include reproduction steps and browser/device details for interaction problems.
