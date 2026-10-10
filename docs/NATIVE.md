# Consolidated Atlas integration

[PR #1](https://github.com/Xon333/human-atlas/pull/1) is the integration candidate for the regional study UI and the reviewed [resource PR #2](https://github.com/Xon333/human-atlas/pull/2). Both histories are preserved. The resource change no longer has a separate deployment or native tracker.

## One native execution

**Start and finish in [SpaceO's existing UNI continuation](https://github.com/Xon333/SpaceO/blob/codex/uni-course-integration-2026-10-10/.spaceo/uni/CONTINUE.md).** It contains the reviewed revision pair, exact OMV preparation/deployment and rollback instructions, one Mac acceptance pass, and the original accepted native evidence. An OMV integration owner may use a Mac child for actual Obsidian/device work. Keep both PRs draft/unmerged and the existing sync hold paused.

The accepted private deployment, course notes, source returns, H5P playback, PDF++ capture and editable drawing already exist. Their dated acceptance remains in that continuation. Native execution applies the consolidated candidate and verifies changed behavior in the actual environment; it does not repeat initial installation, content adoption, source research or cloud tests.

## Cloud implementation

- Regions open as neutral, coherent anatomy using the existing detailed model, materials and picker. Choosing a list item or mesh highlights it in place, retains the regional list and camera, and keeps isolation an explicit action.
- Optional regional context extends the existing course schema. Original teaching targets, terminology, source bindings and unmapped objectives retain their meaning. Extra catalogue structures are identified as source names without claiming they are teaching requirements.
- Deep links, side/layer filters, multilingual search, clipboard fallback, browser history, narrow panes and the complete explorer share the original scene and navigation.
- Rendering and picking share geometry arrays. Idle/hidden views stop animation work, hidden batches are skipped, and a nonblocking WebGL2 fence limits queued GPU frames. Visible elapsed time controls transitions without accumulating hidden time. Context loss/unmount clean up pending work and owned resources.

The timeout investigation and measured resource changes are recorded in [RESOURCE-CONSUMPTION.md](RESOURCE-CONSUMPTION.md). Configuration, schema and URL syntax remain in [course-runtime.md](course-runtime.md).

## Reproducible verification

Use Node 22.13+ and the existing lockfile. Reuse matching dependencies and installed Playwright/Chromium. `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` can point to those tools; no browser dependency is added to the application.

```sh
npm run check
npm run test:course
npm run test:runtime
npm run test:geometry
npm run test:scene
node scripts/validate-atlas.mjs
node scripts/validate-interactions.mjs
npm run build
ATLAS_TEST_SCOPE=all ATLAS_TEST_REQUIRE_COURSE=1 npm run test:browser
ATLAS_TEST_SCOPE=resource npm run test:browser
```

The `all` scope uses the real private regional export configured through `ATLAS_COURSE_FILE` and `ATLAS_SPACEO_ROOT`; it covers regional interactions, dark UI/source controls, responsive geometry and the original complete explorer sequence. `resource` adds deterministic idle, suspension, direct animated Reset, picking and context-loss regressions. `ATLAS_SOFTWARE_GL=1` enables the cloud software renderer only. Screenshots wait for the actual demand renderer to settle and retain a 60-second capture deadline.

The private SpaceO workflow validates both repositories together, including its exporter/consumer and helper DOM tests. It retains browser evidence privately. The public workflow contains no private course snapshots, teaching assets or deployment configuration. Cloud browser results do not assert native Safari, Obsidian, device FPS, energy or total process memory.
