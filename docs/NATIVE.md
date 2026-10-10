# UNI Atlas — cloud finish and native handoff

Continue [PR #1](https://github.com/Xon333/human-atlas/pull/1) on `codex/uni-study-mode-2026-10-10`; fetch the latest head and preserve later changes. Do not restart from main or open a competing implementation. [SpaceO's continuation](https://github.com/Xon333/SpaceO/blob/codex/uni-course-integration-2026-10-10/.spaceo/uni/CONTINUE.md) owns cross-repository coordination and the private acceptance record. This file owns remaining Atlas work; [course-runtime.md](course-runtime.md) owns configuration and route syntax.

## Cloud finish

**The Atlas cloud owner implements dark mode in this PR.** At reviewed code commit `39ea4642`, [globals.css](../app/globals.css) forces a light palette and [scene.tsx](../app/scene.tsx) sets a light clear colour, ground and platform. A CSS-only dark shell would leave the stage light.

Make the existing application dark by default from first paint: near-black/charcoal UI and stage, legible labels, visible borders/focus/hover/selection states, and consistent portalled menus/dialogs. Cover UNI and the full explorer. Preserve anatomy system colours, source-image pixels, laterality and the distinction between a highlighted target and neutral objective context. No new theme framework, settings service or elaborate theme picker is needed.

**Extend, never reinvent.** Keep the renderer, model pipeline, catalogue identities, GPU batching, picking, camera/explosion interactions and existing components. Adjust stage styling in that renderer; do not replace it, reload models to change appearance, add another viewer, retranslate the atlas corpus or rebuild SpaceO/H5P. The existing schemaVersion 1 consumer and course selections remain the foundation.

Complete code, scoped tests, browser/layout checks and documentation here. Run `npm run check`, `npm run build` and relevant existing regression checks after changes. Reuse [validate-browser.mjs](../scripts/validate-browser.mjs) and an available Playwright/Chromium installation; its environment options are in that file. Inspect dark UNI/explorer views, the smallest supported viewport, resized split-pane framing, source controls and no-highlight context. Do not weaken selection/framing assertions to make a theme pass. Private fixtures may live in ignored `.private-course/`, outside public inputs; do not commit them. Record actual limitations rather than treating synthetic media or software rendering as device acceptance.

Update this section and PR #1 with the finished commit and evidence. Native workers receive only deployment and environment-specific checks. Preparatory native work can proceed now; final visual acceptance uses the completed dark-mode commit. A temporary light deployment does not close this task.

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

Baseline verification remains the original PR's reported cloud evidence, not a new run: 58 course checks, 15 runtime/privacy tests and Chromium viewport checks. The 10 October handoff review changed documentation only; dark-mode implementation and native acceptance remain pending.
