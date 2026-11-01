# Canonical course export

The canonical authored course and notes belong to the content owner on M1.
Human Atlas owns this on-demand producer and its private OMV serving derivative.
No SpaceO checkout, publication hook, vault sync, mount, watcher or directory scan
is used. Legacy course IDs and Notes/Exports paths remain derived compatibility
keys; they are not canonical content locations.

The content owner supplies the exact `canonical-sources.json` path, byte count and
SHA-256. Its schema is `schemaVersion: 1`, `overlay`, `overlaySha256`, `vault`,
`sources` keyed by legacy source path, and `noteReturns` keyed by binding ID.
Each source declares `canonicalPath`, `vaultRelativePath`, `sha256`, `bytes`,
`mime`, and `pages` for PDFs. Note returns declare `noteSourceId`, `canonicalPath`,
`vaultRoot`, `vaultRelativePath`, `heading`, `physicalPage`, `pageSourceId`,
`vaultId` and `canonicalUrl`. The producer checks these identities against each
other and against the original course binding. Preserve the manifest's source
credits and the course's software/model provenance.

From this checkout, using the installed Python and accepted catalogue:

```sh
python3 scripts/export-course.py \
  --manifest /private/content-owner/canonical-sources.json \
  --manifest-sha256 CONTENT_OWNER_SUPPLIED_SHA256 \
  --manifest-bytes CONTENT_OWNER_SUPPLIED_BYTE_COUNT \
  --catalog "$PWD/public/models/atlas.json" \
  --output /home/t3code/.local/share/human-atlas/bundles/NEW_GENERATION
```

The fixed transport is `ssh -oBatchMode=yes m1-worker`. It reads only the exact
manifest, exact authored overlay beside it and manifest-registered files within
the pinned canonical vault. The private owner manifest supplies canonical paths;
they are not embedded in public code or documentation. There is no host/root/remote-command option. Hashes are checked before
use, source sizes are bounded, symlinks are refused and shell arguments are quoted.
The canonical manifest hash must come from the content owner, not an unverified
remote response. A changed canonical source requires a refreshed owner manifest;
the exporter never silently repins it.

The output parent must already exist. The new bundle path must be outside this
repository and must not exist. Temporary staging is private and removed on success
or failure. A completed bundle is published by a directory rename only after all
source validation succeeds; existing bundles and services are untouched.

The bundle contains `course.json`, `manifest.json`, and registered PDF, figure and
capture bytes. Canonical Markdown captures use `.md` derived keys and
`text/markdown`. Notes are read transiently to verify unique canonical headings;
neither note bodies nor the authored course JSON are retained. The derived
`sourceInput.path` is a provenance key, not another authored course file.
`sourceInput.sha256` identifies the exact canonical overlay bytes. The private
receipt preserves canonical source hashes/paths, vault identity, canonical note
links and the generated course hash.

`binding.note.canonicalUrl` is an exact `obsidian://open` URL with only one `vault`
and one `file` parameter. `file` encodes the canonical vault-relative Markdown
path and exact heading together. The registered vault ID is used to distinguish
vaults sharing a display name. Canonical headings are validated against canonical
bytes; legacy `note.path`, `note.route` and `note.heading` remain provenance.

After generation, run the paired checks with Node 22.13+:

```sh
node --experimental-strip-types scripts/verify-course-consumer.mjs --bundle /private/bundle
node --experimental-strip-types scripts/verify-course-sources.mjs --bundle /private/bundle
```

The first checks the actual course consumer, catalogue pin, every regional
side/layer combination, contextual mesh links, unmapped objectives and canonical
note destinations. The second runs the actual private runtime on an ephemeral
loopback port, checking every registered PDF/figure/capture, distinct PDF ranges
and refusal of raw directories/unregistered sources. It closes the listener and
removes its synthetic static fixture. Neither check builds or selects a release.

The runtime owner separately verifies service-user access and selects the accepted
application/bundle pair using `ATLAS_SOURCE_ROOT=/private/bundle` and
`ATLAS_COURSE_FILE=/private/bundle/course.json`. Ordinary refresh repeats the
explicit command with a current owner manifest and a fresh generation path.
Application/reverse-proxy cutover belongs to the runtime owner. Keep old bundles
only while required by that owner's recovery or active consumers.

Focused synthetic exporter tests:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p test_export_course.py
```

The validation core is adapted from the SpaceO exporter Git blob
`7ad7ddac9c897d07e45cac3132aa5497715dbcdb`; the paired validators retain its existing
consumer/source checks. Human Atlas code remains MIT. BodyParts3D remains CC BY
4.0 with `public/ATTRIBUTION.md`; these licences do not license private teaching
slides or the supplied book. Private manifests and bundles must stay outside
public assets, source control and application `dist`.
