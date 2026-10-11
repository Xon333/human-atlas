# Regional Atlas deployment

The authorized OMV cutover completed on **11 October 2026 at 11:56 UTC**. The existing private Atlas origin serves the regional application from an immutable release. SpaceO's native owner supplied the regenerated export; Atlas copied it into its private deployment directory. No Mac files, GUI state, sync configuration or shared PR head were changed by this cutover.

## Exact release

| Item | Identity |
| --- | --- |
| Application commit | `c2c8d344eb21ca7a719a78a16a574d1c3ea29bb9` |
| Implementation parent | `2253f0138278ad0969b818b292e87ddb92fe0fbc` |
| Catalogue Git blob | `0e22085db177ba8089d1a168135aea8524846152` |
| Catalogue SHA-256 | `81af0e0dab612caf80cbfbc2bd20d0fa4e8cd771ca814fa3cc32a29eb5c55a01` |
| Private export SHA-256 | `a42432008d4cab194b9961efab1b8e5867d81956368708a4ff418f5518113192` |
| Authored SpaceO input SHA-256 | `5b7fa0c4ea7e54be588188314dc6af7e37ba89d5d6ff4265a9800a11409fc741` |
| Built HTML SHA-256 | `57479d9f5610c32d92476dc5a54ef6efaa4d0b6543befb5987331e032589f278` |

The private deployment dossier is `/home/t3code/.local/share/human-atlas/deployments/region-c2c8d34-20261011`. It contains `releases/<application-commit>`, `course.json`, `runtime.env`, source/build manifests, the accepted export, control-file hashes and operation receipts. The application was built through `t3-check` from the clean exact commit; archived release source was byte-compared with that checkout. Release files are read-only, contain no dependency symlink, and do not depend on the editing worktree.

`99-regional-atlas.conf` adds the release WorkingDirectory and a second EnvironmentFile together. The second file overrides only `ATLAS_COURSE_FILE`; systemd gives EnvironmentFile values precedence over plain Environment assignments. The original environment, direct Node command, readiness gate, service limits and nginx proxy remain in force. Source files still resolve from `/home/t3code/projects/worktrees/SpaceO/uni-consolidated-20261010`; all 18 bound source files were byte-identical to the producer checkout. The export is served from the private dossier, not a transient worktree or public build.

## Verification

[Affected CI passed on the exact application commit](https://github.com/Xon333/human-atlas/actions/runs/38135119692). The representative browser pass covered cold regional loading, side/region replacement, contextual selection, isolation, rotation, explicit Explorer and direct course links. It observed actual WebGL buffer deletion and context loss on disposal. These observations are not Mac RAM measurements.

The cutover reused the accepted serving verifier. The candidate and live runtime/proxy origins returned exact built HTML, JS, CSS and catalogue, all seven ready selections, and a registered PDF HEAD plus exact five-byte range. Unregistered/direct source routes remained denied. Live Host, Origin and cross-site guards passed; a regional chunk matched disk and an obsolete body chunk returned 404. The retained readiness gate completed before nginx started.

A focused T3 preview check at the live origin confirmed zero canvas, scene-module requests and geometry requests at the chooser. The direct right-hand course view showed its 27-mesh assembly using exactly three right-hand regional chunks. No repeated general suites, Full Body benchmark, Mac GUI step or memory comparison was performed during cutover.

Private evidence: `candidate-smoke.json`, `live-smoke.json`, `live-browser.json`, `activate-receipt.json`, `course-identity.json` and the before/after service definitions in the dossier. The earlier representative browser report remains at `/home/t3code/projects/human-atlas-region-browser/artifacts/final-ready/report.json`.

## Rollback and subsequent cutovers

Run as the existing OMV `t3code` account. The [guarded control script](../ops/omv/regional-cutover.py) verifies the complete release, both exports, preserved configuration, and loaded/on-disk drop-ins before any mutation:

```sh
python3 ops/omv/regional-cutover.py check \
  --deployment /home/t3code/.local/share/human-atlas/deployments/region-c2c8d34-20261011
```

For an authorized rollback, replace `check` with `rollback`. A retained read-only copy of the same script is in the dossier, so rollback does not require this checkout. It removes only the recognized `99-regional-atlas.conf`, reloads the manager and restarts `human-atlas-runtime.service` and `human-atlas.service` together. The established readiness gate verifies the restored HTML and course before nginx starts. Check the actual serving origin and registered source after rollback.

Removing that one override restores application `b45f4fe421cd10121c70e2ed304db40afe50f1d5` and the untouched accepted export at the original SpaceO source root, SHA-256 `f61464b5715858583a6231aef34b81632acaf1f0603275250283336e311e4529`. Both older `90-native-owner-20261011.conf` and `95-atlas-b45f4fe-20261011.conf` remain intact. Remove the regional override before any older deployment rollback. This pass did not cycle the live service through rollback merely to repeat prior acceptance.

The script refuses unknown controls, changed artifacts, an already-applied transition or an existing operation receipt. Inspect a partial receipt before attempting recovery; do not delete it and retry blindly. A later release needs its own exact build/export pair and dossier. Never substitute new artifacts into this release or reuse an old manifest for a different commit.

## Cloud and SpaceO handoff

Integrate `t3/region-first-human-atlas` into existing PR #1 once the native returns are final. This cutover confers no PR merge authority. The later handoff commit adds only this documentation and the deployment control source; the deployed application remains the exact commit above.

SpaceO's authored input changes only `catalog.ref` and `catalog.gitBlobSha`; regeneration also updates `sourceInput.sha256`. Keep all seven selections, ordered targets, source bindings, evidence and terminology. The SpaceO owner publishes that repin separately and owns any Mac content uptake. Its CI consumer ref should advance to the final integrated Atlas head. If that head retains these catalogue bytes, the blob pin remains unchanged. No course-schema or target-mapping change is required, and no private export belongs in Atlas Git or dist.
