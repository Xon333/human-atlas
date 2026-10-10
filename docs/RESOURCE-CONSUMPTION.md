# Consolidated rendering and memory review

The implementation from resource PR #2 is incorporated and independently refined in [integration PR #1](https://github.com/Xon333/human-atlas/pull/1), together with the regional study UI. [SpaceO's UNI continuation](https://github.com/Xon333/SpaceO/blob/codex/uni-course-integration-2026-10-10/.spaceo/uni/CONTINUE.md) is the only native execution and acceptance record. Earlier resource instructions that left a cloud Reset failure for native investigation are superseded.

## Implementation and limits

- Rendering and per-part picking share merged position, packed-normal and index backing arrays. Each picker retains its own bounds, index range and transform. A shared picker material is disposed once. Download buffers and redundant picker selection-index arrays are released after construction.
- A committed scene change, model arrival, camera interaction or resize requests a frame. Damping, explosion and autorotation keep frames active only while needed. Visibility/intersection events suspend hidden or offscreen scenes; no idle timer polls them.
- A fully hidden batch is not submitted. Mixed batches retain the existing per-part shader masks, selection tint and neutral context. Model assets, mesh detail and device-pixel-ratio settings are unchanged.
- At most one WebGL2 fence is retained. `clientWaitSync` uses a zero timeout: while the GPU is busy, the next animation callback coalesces current state without changing transforms or queuing another draw. Submission flushes asynchronously. Unsupported or failed fences use the ordinary renderer path. No `gl.finish`, synchronous GPU wait or reduced-detail workaround is used.
- Transitions use elapsed **visible** time, avoiding a growing interpolation delay under a slow software GPU. Hidden/idle periods reset the clock. Context loss stops loading/rendering and retains the reload message; unmount releases listeners, observers, animation callbacks, fences, geometry and the owned renderer context.

Initial loading still reads the complete atlas. Hidden parts inside a visible mixed batch still use the shader mask. This work reduces retained arrays and avoidable rendering; it does not claim a reduction in initial asset download size or a specific native frame rate.

## Measured resource result

The geometry tests inspect the actual 2,234 parts and 69 batches, comparing positions, packed normals, rebased indices, selection IDs and raycasts across nonzero ranges and exploded translations.

| Retained geometry backing arrays | Accepted baseline | Consolidated candidate |
| --- | ---: | ---: |
| Bytes | 125,102,486 | 58,425,666 |

The difference is **66,676,820 bytes (63.59 MiB)**. This is exact CPU array-buffer accounting; it is not total browser-process RSS or unique physical memory.

A fresh comparison used the accepted `db8b743f9f15d66cace39f10ba23e45ffba6db48` build and the consolidated build with the **same** Playwright 1.62.1, Chromium 153.0.8010.0, SwiftShader arguments, fonts and 1440 × 1000 viewport:

| Observed browser work | Accepted baseline | Consolidated candidate |
| --- | ---: | ---: |
| Callbacks in a settled approximately one-second sample | 60–61, one pending | 0, none pending |
| Draw calls per rendered skeleton frame, including stage | 77 | 15 |
| Submitted triangles per skeleton frame, including stage | 2,350,150 | 339,576 |

The skeleton view submits approximately **80.5% fewer draw calls and 85.6% fewer triangles**. These are work counts, not throughput, battery or native memory measurements. Every completed candidate idle/hidden sample has zero callbacks, draw calls and pending frames.

## Screenshot timeout investigation

The original failed browser log reached `page.screenshot` after fonts had loaded, then exceeded its 60-second deadline following explorer-slider interaction. Earlier resource follow-ups changed the transition sequence and left direct full-system Reset unresolved. This consolidation restored the original demanding cases.

On the initial merged renderer, directly resetting an exploded skeleton to all systems reproduced the 30-second settling failure. The trace recorded 26 frames and about 58 million submitted triangles in approximately 1.2 seconds, followed by sustained software-GPU work after the UI had requested the assembled state. An independent standard-process browser run passed the old small-slider screenshot, so the historical timeout alone cannot identify one exclusive cause. The reproduced GPU queue backlog was a concrete rendering defect that could be fixed and retested.

With the one-frame GPU gate and elapsed-time transition, the complete resource run passes **both skeleton inventory → Reset and all-system inventory → Reset**, at the unchanged viewport, model detail and 60-second screenshot deadline. The first successful corrected captures took 499 ms and 688 ms after real scene settlement. Both transitions then returned to zero idle work. The current harness observes renderer settlement instead of assuming that two animation callbacks mean the newest state is already on screen.

The same run passes autorotation, hidden/offscreen suspension and resume, camera presets, orbit, zoom, explosion, selection after all systems are hidden, isolation, exact picking and context loss during delayed model loading. It reports no uncaught page error. A missing-font configuration in the old serverless environment was also corrected before visual review; it is distinct from the log's already-completed font wait.

## Validation and native boundary

`npm run test:geometry`, `test:scene`, `test:course`, `test:runtime`, typecheck and build cover source correctness. `ATLAS_TEST_SCOPE=resource npm run test:browser` exercises the full lifecycle and original animated Reset cases. `ATLAS_RESOURCE_BASELINE=1` records bounded baseline idle/draw work without imposing candidate-only expectations on the old renderer. `ATLAS_TEST_SCOPE=all` covers the real regional course, dark UI and preserved explorer interactions.

Native execution now has only environment-dependent work: deploy the reviewed candidate through the existing OMV service, apply the exact reviewed SpaceO helper, check actual Safari/Web viewer behavior and record matched process observations. Follow the single continuation; there is no separate resource deployment, source investigation or initial plugin setup to repeat.
