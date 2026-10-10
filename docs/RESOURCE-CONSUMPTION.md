# Resource consumption — native finish

Branch: `codex/resource-consumption-2026-10-10`, based on the native-tested UNI candidate `db8b743f9f15d66cace39f10ba23e45ffba6db48` (PR #1). This is a separate performance delta; it preserves the existing model detail, materials, highlighting, course contract and source routes.

The implementation belongs to this branch. The native worker deploys it and measures the real Mac result. [SpaceO's resource continuation](https://github.com/Xon333/SpaceO/blob/codex/resource-consumption-2026-10-10/.spaceo/resource-consumption/CONTINUE.md) owns the combined private handoff and native evidence. The earlier [UNI continuation](https://github.com/Xon333/SpaceO/blob/codex/uni-course-integration-2026-10-10/.spaceo/uni/CONTINUE.md#acceptance-record) already records completed OMV/Mac integration; do not repeat its initial installation work.

## Implemented

- **Idle CPU:** request a frame on committed scene changes, camera changes, resize or model arrival. Continue while damping, explosion or autorotation is active; stop when settled. Page visibility and intersection events suspend a hidden stage and wake it on return, without a timer or a background monitor.
- **Retained memory:** picking and rendering share the merged position, packed-normal and index buffers. Per-part bounds, transforms and index ranges preserve exact picking. Original downloaded buffers and redundant per-picker selection-index arrays can be released. The 2,234 pickers also share one explicitly disposed material.
- **GPU work:** skip a merged batch when all its parts are hidden. Mixed batches retain the existing per-part shader mask, so selected structures and neutral surrounding anatomy keep their original semantics.
- **Lifecycle:** cancel pending frames, listeners and observations on unmount; a lost WebGL context stops downloads and keeps its reload message visible.

Exact array-buffer accounting with the actual 2,234 parts and 69 batches:

| Retained geometry array buffers | Before | After |
| --- | ---: | ---: |
| Bytes | 125,102,486 | 58,425,666 |

**66,676,820 bytes (63.59 MiB) removed from retained CPU geometry buffers.** This is an object-graph measurement, not a browser-process or native RSS claim. Fully hidden batch skipping means a skeleton view submits 9 of 69 anatomy batches and 338,056 of 2,288,268 anatomy triangles. All model assets and geometry detail remain unchanged. Initial loading still loads the complete atlas; hidden parts inside a visible mixed batch still use the existing shader mask.

## Cloud verification

```sh
npm run check
npm run test:geometry
npm run test:course
npm run test:runtime
npm run build
ATLAS_TEST_SCOPE=resource npm run test:browser
```

The geometry tests compare every part's positions, packed normals, rebased indices and selection indices, then compare raycast hits at nonzero ranges and exploded translations. The existing course suite has 58 checks; the runtime/privacy suite has 15 tests. The resource browser scope instruments browser frame and WebGL calls before application load; production code has no profiling hooks. `ATLAS_RESOURCE_BASELINE=1` records the same observations without applying candidate-only expectations to an older build. Browser outputs stay under ignored `.private-course/browser-checks/`.

Observed at 1440 × 1000 in Chromium 153.0.8010.0 with SwiftShader:

| Observed work | Baseline | Candidate |
| --- | ---: | ---: |
| Callbacks during a settled ~1 second sample | 60, with 1 still pending | 0, with none pending |
| Draw calls per rendered skeleton frame, including stage | 77 | 15 |
| Submitted triangles per rendered skeleton frame, including stage | 2,350,150 | 339,576 |

This is about 80.5% fewer draw calls and 85.6% fewer submitted triangles for that view. It is not an FPS, energy or process-memory comparison. Chromium process flags differed after an initial software-renderer timeout; frame throughput is deliberately not compared. The combined candidate run verified idle, hidden/offscreen suspension and return, autorotation, camera presets, orbit, zoom and explosion, then exceeded its 30-second wait during full-system reassembly. Its screenshot still showed the assembled model and it reported no uncaught page error. The timeout's cause was not established; full-system animated Reset remains a specific native check.

Two bounded follow-up runs passed the remaining checks: highlights remain visible after every system is hidden; isolation and exact mesh picking work; context loss during delayed downloads retains the reload warning and stops work; skeleton reassembly and the actual Reset control at explosion amount zero render correctly and settle. All completed idle samples had zero callbacks, draws and pending frames, and no uncaught page errors were observed. These are results from three focused runs, not a claim that the original combined run passed. The resource harness now tests skeleton reassembly before Reset; the direct animated transition to all systems remains in native acceptance below.

For browser setup, reuse the existing Playwright installation and Chromium binary using `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` when they are outside the project. `ATLAS_SOFTWARE_GL=1` is only for headless software-rendered checks. Software-rendered cloud timings are not Safari, Obsidian, hardware FPS or battery measurements.

## Native worker: deploy and verify

1. **Use OMV for source/build/deployment.** Fetch this branch into an isolated persistent worktree. Resolve the existing deployment and rollback paths from SpaceO's accepted native record. Retain its working private runtime configuration, course export and source checkout. These inputs, catalogue bytes, route contract and dependency lockfile did not change; no course re-export, new service or plugin installation is needed.
2. **Measure the baseline before replacing it.** On the Mac, use the existing Safari and Obsidian Web viewer with the same viewport, visible layers, course selection and other open apps for both revisions. Record 30 seconds settled, 30 seconds autorotation, then 30 seconds with the Atlas pane hidden. Keep startup separate. Record process CPU, memory and the relevant browser/Obsidian renderer/GPU processes; do not equate JavaScript heap, process RSS and the geometry-buffer result above.
3. **Build and deploy the candidate through the existing release mechanism.** Reuse matching dependencies; run `npm ci` only if missing or inconsistent. Run `npm run check`, `npm run test:geometry` and `npm run build`. Retain the working release for rollback. Verify the served HTML/JS identifies this build at the existing user-facing origin, then reuse the existing runtime/source smoke check. Do not point a persistent service at a temporary checkout or publish private inputs.
4. **Check only the changed behavior in Safari and native Obsidian.** After load, idle must settle. Camera preset, drag, zoom, selection, pane resize and Back must wake the scene; autorotation and explosion must animate then settle when stopped. Check **Reset from exploded inventory with all systems**, the full transition that exceeded the cloud software-renderer timeout. Hide and restore the actual pane/tab during autorotation, including a collapsed pane: rendering resumes without a blank canvas or a camera jump caused by elapsed hidden time. Verify one sided mesh can still be picked/highlighted, one full course selection and one unmapped objective's neutral context. Reuse accepted source-return evidence for unchanged routes.
5. **Repeat the same measurements and record the result once in SpaceO's resource continuation.** Include exact revision, app/browser versions, state, process identities, measurements, and observed regressions or unavailable metrics. If unchanged/native caches make total RSS inconclusive, say so. Close only temporary test views and restore the user's starting tabs/panes. Neither deployment nor these checks merge a branch or resume SpaceO sync.

If candidate deployment or a changed interaction fails, retain/restore the previous release and report the exact reproducible failure to the implementation owner. Native workers need no new resource architecture or further optimization research to execute this handoff.
