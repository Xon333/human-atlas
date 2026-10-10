# Human Atlas

An interactive 3D anatomy explorer built with React, Three.js, and shadcn/ui. Take the BodyParts3D adult male reference apart into **2,234 individually selectable meshes**, explore **15 anatomical systems**, and search **3,432 named concepts**.

**[Explore the live demo](https://human-atlas-seven.vercel.app)**

Both the full explorer and UNI study mode open with a dark interface and 3D stage from first paint. Anatomical system colours and teaching images retain their original colours.

## Explore

- Orbit, zoom, and select structures directly on the body.
- Toggle individual systems or use skeleton and organ presets.
- Move from assembled anatomy to a spaced inventory of every visible piece.
- Search anatomical names and source identifiers.
- Isolate a selected structure and read its details.
- Use compact controls and detail panels on mobile.

## UNI study mode

An optional private runtime connects the existing atlas to SpaceO's validated anatomy course overlay. A configured deployment opens a complete anatomical region in its normal colours. Selecting a name or mesh highlights that structure within the surrounding anatomy. The regional list stays available, and selecting within an unchanged open region preserves the camera. Side and layer controls refine the region, and isolation remains an explicit optional action. The full explorer remains one click away.

The regional list preserves authored Slovenian/Latin/English terms and their learning order, then includes additional source-named meshes for context. Those additional meshes do not acquire teaching labels, evidence or exam requirements. A region's navigation label can describe the whole anatomical area while the original teaching-selection label and sources remain available in its disclosure. Existing taught-structure links also recover their authored region.

Objectives without verified model geometry are identified in their original sources. Their optional context view shows surrounding anatomy in its normal material, with **no target highlight**. Course data stays in SpaceO or ignored local runtime inputs; it is never part of the public static build.

See [runtime configuration and scene links](docs/course-runtime.md). The implementation's remaining Mac/OMV work is bounded by [the native handoff](docs/NATIVE.md).

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
npm run test:runtime
npm run build
```

Validation covers exact geometry and bounded raycasts across shared buffers, GPU-frame fallback and cleanup, visible animation timing, nonoverlapping exploded layouts, search and inspection contracts, and tap-versus-drag handling. Browser checks exercise desktop and narrow/mobile layouts, contextual selection, system controls, search, explicit isolation, orbit, zoom, rotation and exploded-inventory Reset. Physical-device integration and resource measurements belong to the existing native acceptance record in [the handoff](docs/NATIVE.md).

Course checks cover catalogue-byte identity, authored versus regional mesh membership, multilingual/source contracts, unmapped-objective separation, side/layer links and legacy routes, private runtime boundaries, and accidental inclusion of local course files in public builds. Repeatable source tests use public synthetic fixtures and the public anatomy catalogue. The optional [browser checker](scripts/validate-browser.mjs) reuses a locally available Playwright/Chromium installation and reads any course overlay from the private runtime; its reports stay in ignored local storage. With that environment configured, `ATLAS_TEST_SCOPE=regional ATLAS_TEST_REQUIRE_COURSE=1 npm run test:browser` checks a real regional export, `ATLAS_TEST_SCOPE=dark` checks the interface and portals, and `ATLAS_TEST_SCOPE=resource` checks idle/hidden work, GPU scheduling and full-inventory Reset. The default scope retains the complete interaction suite. Software-rendered cloud results do not establish device FPS, battery use or process memory.

## Anatomy data

The current viewer uses **BodyParts3D 4.0**, an adult male reference anatomy, licensed **CC BY 4.0**. It does not represent every human structure or variation. Individual source meshes are distinct from named concepts, which may group multiple meshes. Descriptions distinguish general system context from individual organ explanations.

Geometry is simplified for browser performance while retaining every source mesh. The packaged model contains 2,288,268 triangles and downloads approximately 33 MB of compressed geometry. Full credits, source links, and adaptation details are in [ATTRIBUTION.md](public/ATTRIBUTION.md).

This is an educational explorer, not a diagnostic or surgical tool.

## How it works

Geometry is merged into batches; rendering and per-part picking share the same position, packed-normal and index buffers. Each picker retains its own bounds and index range. The existing per-structure GPU textures control translation, visibility and selection, while whole hidden batches skip drawing. Exploded layouts pack only visible pieces. All source meshes and their geometry detail remain available.

Rendering wakes for scene changes, input, model arrival or resize and stops when the viewer settles or becomes hidden. A nonblocking WebGL2 fence keeps at most one anatomy frame in flight, coalescing later changes to the newest state. Animation uses elapsed visible time, so a slow GPU does not accumulate stale reassembly frames; hidden time does not advance it. WebGL1 and unavailable fences keep the normal rendering path. Cleanup cancels pending work and releases the scene's GPU resources. Development uses the platform's file events rather than forced polling.

The optional WebMCP tools expose anatomy search and inspection in compatible browsers. The visible interface works without them.

## Rebuilding geometry

The repository includes browser-ready geometry. Rebuilding it is optional: obtain the official BodyParts3D OBJ archive and English metadata tables, prepare the joined concepts and display-system mappings, run `scripts/convert-anatomy.py`, then `node scripts/optimize-anatomy.mjs` and `node scripts/compress-models.mjs`. Simplification uses a 0.2% relative error limit per structure.

## Deploy

Import this repository into Vercel as a Vite project. The included `vercel.json` configures `npm ci`, `npm run build`, and the `dist` output directory. It can also be served by a static host.

## License

Original application code is released under the [MIT License](LICENSE). **The anatomy data has its own CC BY 4.0 license**; preserve the attribution when redistributing it. Third-party dependencies retain their respective licenses.

Issues and pull requests are welcome. Please include reproduction steps and browser/device details for interaction problems.
