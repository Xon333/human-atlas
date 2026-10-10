# UNI Atlas — cloud finish and native handoff

Continue [PR #1](https://github.com/Xon333/human-atlas/pull/1) on `codex/uni-study-mode-2026-10-10`; fetch the latest head and preserve later changes. Do not restart from main or open a competing implementation. [SpaceO's continuation](https://github.com/Xon333/SpaceO/blob/codex/uni-course-integration-2026-10-10/.spaceo/uni/CONTINUE.md) owns cross-repository coordination and the private acceptance record. This file owns remaining Atlas work; [course-runtime.md](course-runtime.md) owns configuration and route syntax.

## Cloud finish

**Complete in [code commit `b5d88acd`](https://github.com/Xon333/human-atlas/commit/b5d88acd1ad0585c6ebfb0404604efb0370c38ba).** The existing UNI mode and full explorer now use a near-black/charcoal interface and 3D stage from the first HTML paint, including browser controls, portalled search/About surfaces, mobile sheets and the clipboard fallback. Source links and the explode slider have visible keyboard focus; target selection and amber source/context cues remain distinct.

This extends the existing implementation. The renderer changes only its clear colour, ground, platform, rings and inventory-marker styling. Anatomy system colours, lighting, the selection shader, source-image pixels, catalogue/model assets, GPU batching, picking, camera/explosion behaviour and course/runtime logic are unchanged. No theme framework, new dependencies, duplicate viewer or copied teaching material were added.

Fresh verification of that code:

- `npm run check`, `npm run build`, 58 course checks, 15 runtime/privacy tests, and the existing atlas and interaction validators passed. The production build retains the existing chunk-size advisory.
- The focused [browser checker](../scripts/validate-browser.mjs), run with `ATLAS_TEST_SCOPE=dark` and a required private test overlay, passed on Chromium 153.0.8010.0 with WebGL2/SwiftShader. It tested dark first paint with OS light preference and external scripts/stylesheets blocked; UNI/explorer, source controls, search/About portals, clipboard fallback and keyboard focus; and 1440×1000, 1024×768, 768×820, 390×844, 320×568 and 844×390 resizing. No uncaught page errors occurred.
- Screenshot inspection and pixel checks confirmed visible selected geometry at every size and neutral surrounding geometry with **zero selection-tint pixels**. The original tint predicate and minimum geometry thresholds are unchanged; UI focus outlines are excluded from geometry measurements. The lowest sampled UI/source text contrast was 6.36:1.

Private screenshots, reports and fixtures remain ignored local test output. The original full integration/browser evidence is retained in PR #1; this run adds scoped dark-mode evidence. Cloud software rendering and the existing media stand-ins do not establish Safari, Obsidian, real-phone or real-source acceptance.

**Only the deployment and device steps below remain.** Use the completed dark-mode commit or a descendant with the same application code for final acceptance; do not repeat cloud implementation, research or architecture. Keep subsequent source fixes with the cloud owner.

## OMV deployment

Use the existing service manager and private access path. Inspect actual checkout/container paths, Node version, service identity, origin, bind and port. Build the current PR candidate in an isolated checkout with Node 22.13+ and matching dependencies (`npm ci` when needed), retaining the working deployment until candidate checks pass. Do not remove its rollback revision or unrelated service configuration.

From the complete, persistent SpaceO PR #6 checkout, export once against the candidate's actual catalogue:

```sh
python3 .spaceo/atlas-course/export.py --catalog '/observed/atlas-checkout/public/models/atlas.json'
```

The path is a placeholder to resolve locally. Export already validates before replacing its output; `--check` is only the read-only alternative. Use the real lecture PDF, figures and captures, never the cloud media stand-ins.

Run the built app with `npm run serve:private` under that service manager. Set the observed process environment from [runtime configuration](course-runtime.md#run-the-existing-app-privately), particularly `ATLAS_COURSE_FILE`, `ATLAS_SPACEO_ROOT`, `ATLAS_VAULT_NAME` and the origin/bind/port. These must be paths visible and readable to the actual process/container. A static-only deployment does not serve course APIs. Keep the source checkout available after deployment.

Verify `/api/course` through both the worker-reachable runtime and user-facing private origin. Confirm the real bound PDF, figure and capture routes, PDF byte ranges and denial of an unregistered source. In particular, inspect the real skeleton PDF and pelvic-ligament figure omitted from the cloud media transfer. Preserve the private boundary; do not expose the whole vault or disable guards to fix routing.

Print links from the running candidate:

```sh
npm run course:links -- --origin '<user-facing-private-origin>' --api '<worker-reachable-runtime-origin>'
```

Use the app's link button for individual structures/meshes. The printer constructs selection/objective URLs; it does not validate the supplied user-facing origin. The SpaceO owner places and tests links in the existing notes. No live paths, hostnames, course captures or private output belong in this public PR.

## Device acceptance and closeout

After SpaceO's reviewed content is present in the accepted Mac vault, test Safari and desktop Obsidian Web viewer: one selection, one sided mesh, one unmapped objective with neutral context, orbit/zoom/tap, pane resize, reload/Back, readable dark UI/stage, exact note heading, real PDF page and figure. Use a real phone for phone claims when available; missing device access is a recorded limit, not a desktop failure.

Native workers own observed deployment/settings fixes. For a reproducible application bug, return the smallest evidence to the cloud source owner; do not redesign around it or repeat unrelated research. Rerun affected checks after fixes. Record private integration results once in SpaceO's continuation and only a non-sensitive deployment/device summary here. Preserve local work, SpaceO's sync hold and both unmerged main branches.

Cloud implementation and scoped verification are complete at the commit above. OMV deployment, actual user-facing URLs, real teaching sources and Mac/Obsidian/device acceptance remain pending; record those observed results through the existing SpaceO coordination path.
