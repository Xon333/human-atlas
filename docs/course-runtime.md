# Private course runtime

UNI extends the existing React/Vite atlas. `AnatomyScene`, the BodyParts3D catalogue and compressed chunks, merged geometry, GPU state textures, picking, orbit controls and exploded layouts remain the rendering path. A course region supplies the visible surrounding meshes, while a selected structure supplies the highlight independently. Opening a region starts with an empty highlight selection. Neutral objective context uses the same visibility and camera fit and never acquires a target highlight.

## Source of truth

The producer is SpaceO's [course contract](https://github.com/Xon333/SpaceO/blob/codex/uni-regional-review-2026-10-10/Notes/Codex/Sources/UNI/anatomy/human-atlas/README.md) and [exporter](https://github.com/Xon333/SpaceO/blob/codex/uni-regional-review-2026-10-10/.spaceo/atlas-course/export.py). Human Atlas consumes its **generated snapshot**, not the authored `terms` input. Content, evidence and future lectures remain owned by SpaceO. [The native handoff](NATIVE.md) identifies the exact paired revisions for deployment.

The consumer checks `schemaVersion: 1`, `courseId: "spaceo-uni-anatomija"`, the private flag, source routes, evidence categories, original English names, ordered concept membership and derived mesh selections. Both the snapshot and the actual served catalogue must match the exact Git blob pin. Identifiers retain their catalogue namespace; no TA2 equivalence is inferred. An unmapped objective cannot contain concept or mesh IDs. A context selection cannot become its highlight.

`student-reported-emphasis` is displayed as reported by the student and links to the verified original capture. It is distinct from `course-material` and `bonus`; none defines a complete exam syllabus. A concept's bilateral scope is distinct from the selected individual mesh and the side shown by a source figure.

## Regional selection contract

`schemaVersion: 1` remains compatible with snapshots that omit `selection.region`. A region extends the view around the authored selection; it does not replace its teaching targets, order, evidence or source bindings.

| Field | Meaning and validation |
| --- | --- |
| `selection.conceptIds` / `selection.elements` | Authored course targets and their exact ordered, deduplicated mesh union |
| `selection.label` | Original teaching-selection label, retained with its source disclosure |
| `selection.region.label` | Optional nonempty label for the whole area shown in navigation and the inspector |
| `selection.region.conceptIds` | Existing catalogue groups defining surrounding anatomical context |
| `selection.region.elements` | Exact ordered, deduplicated union of those catalogue groups; must contain every authored target mesh |
| `selection.region.defaultSide` | `right`, `left` or `both` |
| `selection.region.defaultLayer` | `bones`, `muscles` or `all`; `muscles` shows bones plus muscles |

Unknown groups, altered unions and regions omitting authored targets fail consumer validation. Visibility filters reuse the catalogue's anatomical bone/muscle classes and original part laterality, without changing model IDs, materials or catalogue bytes. Midline and unsided names are not assigned an invented side. A snapshot without a region uses its original selection mesh union as context.

The original flexor-pollicis-brevis meshes `FJ1469` and `FJ1469M` have side names that conflict with their vertex positions relative to the hand bones. Single-side regions omit only this verified conflicting pair. Both-side regions and the full explorer retain their exact source names, IDs, memberships and geometry. A link or search selection without an explicit side opens both sides for either target; an explicitly incompatible single-side link fails visibly. The existing source disclosure and selected-target status identify the limitation. No hemisphere rule is applied to unrelated anatomy.

The inspector keeps authored terms first, followed by other meshes in the visible region under their source names. Only authored terms receive the course marker and teaching metadata. Selecting a term or mesh updates the existing highlight texture and preserves surrounding anatomy; within an unchanged open region it preserves the camera. Opening or closing the inspector and resizing the pane refit the region to the available space. `isolate=1` is an explicit alternative, and selecting another structure returns to the regional view.

Regional context and unmapped-objective context remain separate. An unmapped objective always has zero selected meshes, even when its surrounding region is visible.

## Run the existing app privately

Build with the matching installed dependencies and `npm run build`; use `npm ci` for a fresh or inconsistent checkout. Serve the resulting static application with `npm run serve:private` using the existing OMV service/process manager and private network or authenticated reverse proxy. The runtime requires Node 22.13+ and adds no package dependencies.

| Runtime variable | Value |
| --- | --- |
| `ATLAS_COURSE_FILE` | Absolute path to the generated `.spaceo/tmp/human-atlas-course.json` output |
| `ATLAS_SPACEO_ROOT` | Absolute path to the complete SpaceO checkout holding its bound sources |
| `ATLAS_VAULT_NAME` | Observed Obsidian vault name; enables exact native note links |
| `ATLAS_VAULT_ROOT` | Repository-relative vault root, default `Notes` |
| `ATLAS_ORIGIN` | Observed private origin for a remote hostname/IP, especially with wildcard binding or a reverse proxy |
| `ATLAS_HOST` | Bind address, default `127.0.0.1`; set only for the actual existing deployment topology |
| `ATLAS_PORT` | Port, default `3016` |
| `ATLAS_NOTE_BASE_URL` | Optional absolute HTTP(S) base of an existing note service resolving routes from the SpaceO repository root |

Serve at the origin root, matching the established absolute `/models/` paths. These are process environment values: the Vite `.env` loader is not used by the Node runtime. Keep credentials in the existing deployment configuration. `ATLAS_ORIGIN` is a host/origin check, **not authentication**; the existing private deployment boundary controls access.

`GET /api/course` returns `{course, catalogBlobSha, links}` with `Cache-Control: private, no-store`. Missing configuration is a 404; rejected data is a 503. The public explorer continues to work. A replaced exporter file is revalidated on the next request; invalid updates withdraw the previous private response and source allowlist. Reload the viewer after a course update. No copied course data is stored in browser local storage, a service worker, or a build-time module.

The browser requests the catalogue without caching and validates the complete course membership against it. HTTPS/localhost additionally verifies its exact Git blob with Web Crypto; plain LAN HTTP relies on the runtime's exact byte check and the browser's full membership/name/version validation.

## Exact source return

The runtime serves only registered binding IDs through `/api/course/sources/<binding-id>/pdf`, `/figure/<index>`, and `/capture`. PDFs retain `#page=N` and support GET/HEAD byte ranges. File paths cannot be supplied by the browser; paths, symlinks, extensions and source containment are checked. The runtime does not serve the rest of the vault or render a second copy of its notes.

The note button uses `obsidian://open` with the configured vault and the exact, encoded vault-relative path plus heading. An optional web note base receives the exporter's repository-relative route unchanged. This must be a service that understands those exact heading fragments, not an arbitrary GitHub URL. The runtime rejects malformed configuration at startup. If a bound path cannot form a link under the configured vault root, the UI shows its exact unresolved destination while the model and PDF links stay usable. Actual vault and external note-service availability require the native check. Source links open on demand; lecture images are not downloaded into the initial viewer.

## Stable scene links

Hashes work with the existing static entry point and do not require a new router. Values are percent-encoded.

| Destination | Hash format |
| --- | --- |
| Course default | `#course=spaceo-uni-anatomija` |
| Whole prepared region | `#course=spaceo-uni-anatomija&selection=<selection-id>` |
| Course structure | `#course=spaceo-uni-anatomija&selection=<selection-id>&structure=<catalogue-id>` |
| Individual mesh | Add `&mesh=<mesh-id>`; membership is checked |
| Regional side | Add `&side=right`, `&side=left` or `&side=both` |
| Regional layers | Add `&layer=bones`, `&layer=muscles` or `&layer=all` |
| Legacy taught target | `#course=spaceo-uni-anatomija&structure=<catalogue-id>` or `&mesh=<mesh-id>` without `selection` |
| Unmapped objective | `#course=spaceo-uni-anatomija&objective=<objective-id>` |
| Neutral context | Add `&context=1` to an objective link |
| Full explorer | `#explorer=1`; optionally add `&structure=<catalogue-id>` and `&mesh=<mesh-id>` |

`view=three-quarter|front|side|back` and `isolate=0|1` preserve the named view and isolation choice. Omitting isolation keeps a selected structure in context. A side-specific target can supply its side when the link omits one; otherwise the region default applies. A target hidden by an omitted default layer can widen that layer to `all`. An explicitly contradictory side or layer is rejected.

Legacy course links without `selection` remain valid for authored course targets and recover an authored containing selection. Membership in a region alone does not authorize a non-taught legacy link: additional source structures must name the region explicitly, and the complete target must belong to it. Explorer links remain independent of the course.

Invalid, conflicting or outdated targets show a bounded error and clear the selection; they never silently select nearby anatomy. Back/Forward and reload restore the target, side, layer and explicit isolation state. The link button includes a selectable-address fallback when browser clipboard access is unavailable.

Use the app's link button, or print all runtime selection/objective links for the existing SpaceO owner:

```sh
npm run course:links -- --origin '<observed-private-origin>' --api 'http://127.0.0.1:<observed-port>'
```

The output includes the exact bound note paths/headings and remains private. Do not paste it into the public app repository.

## Public build boundary

Use `.private-course/` for optional local staging, or point directly at the SpaceO export. `.gitignore` and `.dockerignore` exclude private inputs and source assets. Neither the build nor the browser source imports the snapshot. Vite's build guard checks public assets, client import boundaries and output even when Vite is invoked directly. A private file copied into `public/`, a client source tree or a generated public asset fails the build. Adding a genuinely public data/media asset requires a deliberate reviewed allowlist change.

The default Vercel/static build opens the public region chooser; complete-body Explorer is explicit. Software MIT and BodyParts3D attribution are preserved independently of private teaching-material rights.
