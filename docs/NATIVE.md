# Native finish — UNI Atlas

Continue **`codex/uni-study-mode-2026-10-10`** in an isolated Human Atlas checkout. The cloud implementation owns the importer, UI, renderer integration, routes and tests. Native workers perform only the deployment and device steps below; preserve existing work, keep SpaceO's sync hold, and merge neither `main`.

1. **OMV — provision real private inputs.** Read the current service configuration to find the actual atlas checkout, port/private origin and SpaceO PR #6 checkout. From that complete SpaceO checkout, run its existing exporter against this branch's `public/models/atlas.json`:

   ```sh
   python3 .spaceo/atlas-course/export.py --catalog /actual/human-atlas/public/models/atlas.json --check
   python3 .spaceo/atlas-course/export.py --catalog /actual/human-atlas/public/models/atlas.json
   ```

   Use the real PDF, figures and captures. Cloud test snapshots with synthetic media are not deployment inputs. Keep the generated file and lecture assets in SpaceO or ignored local storage.

2. **OMV — connect the existing deployment.** Build this app branch and run `npm run serve:private` under the existing service manager, with `ATLAS_COURSE_FILE`, `ATLAS_SPACEO_ROOT`, the observed `ATLAS_VAULT_NAME`, and the observed origin/port/bind settings from [runtime configuration](course-runtime.md#run-the-existing-app-privately). Retain the existing private network/proxy boundary. Confirm `/api/course` returns the real validated overlay and private sources remain unavailable through the public static deployment.

3. **Mac/phone — observe actual behavior.** In Safari and desktop Obsidian Web viewer, open a selection link, an individual mesh of a bilateral concept, and an unmapped objective. Check orbit/zoom/tap, readable controls at the actual pane size, reload/Back, neutral context with no target highlight, the exact note heading, PDF page and figure. Verify the real PDF and pelvic-ligament figure explicitly; their cloud HTTP checks used synthetic files. Check phone access/touch separately where available. Record device observations without repeating cloud research or implementing another UI.

4. **SpaceO owner — record the observed routes once.** Run `npm run course:links -- --origin '<observed-private-origin>' --api 'http://127.0.0.1:<observed-port>'` in the deployed atlas checkout. Add those observed links at the existing anatomy headings assigned in [SpaceO's continuation](https://github.com/Xon333/SpaceO/blob/codex/uni-course-integration-2026-10-10/.spaceo/uni/CONTINUE.md); record native results there and update the app draft PR with only the resulting deployment/device evidence. Keep private paths, source content and runtime configuration out of the public PR.

Finish when the private deployment, exact source return and actual device checks are observed. Report a concrete environment-only blocker if one remains; do not reopen architecture or redo cloud-executable implementation.
