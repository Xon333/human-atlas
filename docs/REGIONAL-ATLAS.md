# Regional Atlas

Human Atlas opens a region chooser. The catalogue and optional private course load first; the Three.js scene is imported only after a valid regional, course or explicit Explorer destination resolves. An invalid link returns to the chooser with an error. It never falls back to loading the body.

## Geometry and views

The existing catalogue remains the identity authority. Its region memberships describe views of the original meshes, not new anatomical structures. Every original position, signed-short normal and triangle index is retained. A mesh has one storage owner and can belong to several views; composites reuse those identities and files. Structures crossing a regional boundary remain whole. The final partition has 21 public views and 250 content-addressed chunks, preserving 2,234 meshes and 2,288,268 triangles. Its 59,544,558 original geometry bytes retain SHA-256 `ce9c7683173b2a42fd8b87bd06c5a311d6df1292cfe4795feba87e5395e6a4e5`.

The source's named regional groups are incomplete. Partition rules combine source anchors with spatial membership, record the assignment method, and keep their limitations in `atlas.geometryPartition`. These views are navigation aids, not a revised anatomical ontology. For example, public Hand includes the whole radius and ulna, and Foot includes the whole tibia/fibula plus two original sesamoids omitted by the source foot group. Joint views likewise retain complete crossing bones. The single indivisible Skin mesh belongs only to Body surface and explicit Explorer. The two previously documented flexor-pollicis-brevis side conflicts remain excluded from single-side study and available bilaterally.

Regional chunks are partitioned by storage region and side. Their filenames include a content hash. Loading projects the catalogue to the requested assembly, fetches only its referenced chunks and merges only the projected parts. The renderer and its pickers share the merged arrays. A chunk may include additional meshes belonging to that storage region; this is not per-mesh streaming. Whole-body Explorer deliberately loads the complete catalogue using the same files.

There is no application geometry cache, service worker or background prefetch. Normal HTTP caching may reuse downloaded files, but returning to a region prepares its geometry again. Region replacement aborts downloads and decompression, releases geometry/material/texture ownership, stops rendering work and loses the retired WebGL context. Ordinary selection and isolation within the same assembly reuse the renderer. The first anatomy draw waits for the requested chunks, avoiding repeated partial-body draws during loading; the interface still reports download progress. Idle and hidden rendering retain the accepted demand scheduling and GPU backpressure.

## Selection

A selected structure receives an amber highlight while the surrounding assembly becomes a cooler neutral colour. Selection does not isolate automatically. Isolation, rotation, views and Explorer's exploded layout remain explicit controls. The Perspective selector names the existing cameras Oblique, Anterior, Lateral and Posterior; Body side separately filters anatomy. Existing `three-quarter`, `front`, `side` and `back` link values remain compatible. These are orientation presets, not anatomical sections. Bone and muscle filters reuse the catalogue's anatomical classes; source names and identifiers remain searchable.

Public regions use `#region=<id>`, optionally followed by `side=right|left|both`, `layer=bones|muscles|all`, `structure=<catalogue-id>`, `mesh=<mesh-id>`, `view=front|back|side|three-quarter` and `isolate=0|1`. `#explorer=1` is the explicit complete-body route. Existing course links retain their syntax and meanings; see [the runtime contract](course-runtime.md).

## SpaceO integration

Repacking changes the exact `public/models/atlas.json` Git blob because chunk descriptors and regional membership are stored there. It does not change course identities. The native producer repin and regenerated export are complete for the accepted deployment. The exact catalogue identity is obtained with:

```sh
git hash-object public/models/atlas.json
```

The active blob is `0e22085db177ba8089d1a168135aea8524846152`; it replaces predecessor `0f81b5621479a0c0548f4683c316f33bd4d6545b`. The authorized native release uses `catalog.ref: c2c8d344eb21ca7a719a78a16a574d1c3ea29bb9`. That producer ref remains valid while SpaceO's CI consumer ref advances to the final integrated Atlas head. A later producer ref change must point to the same exact catalogue bytes or include its coordinated blob repin and regenerated export. These values belong in SpaceO's existing authored course input; no schema extension or target remapping is required. [The shared integration record](https://github.com/Xon333/SpaceO/blob/codex/uni-course-integration-2026-10-10/.spaceo/INTEGRATION.md) owns the final reviewed heads and merge order.

Keep `catalog.path`, catalogue version, all seven selection IDs, authored target order, source bindings, evidence and Slovenian/Latin terminology unchanged. Future producer changes use SpaceO's existing exporter. Do not weaken its exact catalogue check or overwrite the currently served export as integration preparation.

The compatibility check takes an existing private export and the accepted catalogue. It validates a proposed pin change in memory, then compares the complete validated overlay and resolved selections, taught targets and objective contexts:

```sh
node --experimental-strip-types scripts/validate-course-compatibility.mjs \
  /private/path/human-atlas-course.json /private/path/accepted-atlas.json
```

Public region definitions are independent of the syllabus. The accepted course regions remain coherent teaching views and do not need to inherit all public regional meshes. Changing course context is a separate producer decision; it must preserve the authored targets and source evidence.

## Controlled native cutover

The regional release was activated with explicit authorization on 11 October 2026. Its exact build/export identities, serving evidence and rollback commands are in [the deployment record](REGIONAL-DEPLOYMENT.md). The procedure below is retained for a separately authorized future release; this integration does not repeat it. Future preparation or integration alone does not authorize another service switch.

1. Select an exact reviewed Atlas commit and obtain its matching private export from the SpaceO owner. The native cutover can precede final cloud integration when explicitly authorized; it does not merge PR #1. Retain the accepted release and its matching export for rollback.
2. Build the exact integrated commit in an isolated OMV checkout using the existing Node runtime and lockfile. Run heavy checks through `/home/t3code/.local/bin/t3-check -- COMMAND`. Stage the build and runtime source as a new immutable release, with its candidate export outside public/dist. Do not reuse the old release's identity manifest or activation script for a new artifact.
3. Start the candidate runtime on an unused loopback port. Check its served catalogue blob, `/api/course`, one exact source return and a regional link. Keep the current service, nginx routes, H5P, source files and sync holds unchanged.
4. After a controlled cutover is authorized, the native owner switches the existing runtime's **WorkingDirectory and candidate `ATLAS_COURSE_FILE` together** in one candidate-specific drop-in, preserving the accepted environment and limits. A WorkingDirectory-only change would leave the course pinned to the old catalogue. Retain the established readiness gate and restart the existing runtime/proxy in their established order.
5. Verify the actual serving origin, a direct study link and source return. If rollback is needed, remove only the new recognized override so both the accepted working directory and accepted export are restored, then use the existing readiness/serving checks. Preserve the accepted release's override and recovery files.

One functional browser pass establishes loading scope, interactions and resource release. Download bytes and WebGL allocation/deletion are not measurements of total Mac RAM, driver residency or energy. Evaluate subjective performance through normal native use; no new benchmark is required for this handoff.
