#!/usr/bin/env python3
"""Validate a canonical course and produce a private Human Atlas serving bundle.

Only standard-library Python is required. The atlas app owns rendering and links;
this tool owns derived selection, provenance and registered source validation.

Adapted from Xon333/SpaceO exporter blob 7ad7ddac9c897d07e45cac3132aa5497715dbcdb.
"""

import argparse
import hashlib
import json
import os
import shlex
import subprocess
from pathlib import Path, PurePosixPath
import re
import tempfile
import unicodedata
from urllib.parse import quote, urlsplit, parse_qsl


EVIDENCE = {"course-material", "student-reported-emphasis", "bonus"}
LATERALITY = {"right", "left", "bilateral", "midline"}
REGIONAL_SIDES = {"right", "left", "both"}
REGIONAL_LAYERS = {"bones", "muscles", "all"}


class CourseError(ValueError):
    """A course mapping or its source can no longer be verified."""


def require(condition, message):
    if not condition:
        raise CourseError(message)


def text(value, context):
    require(isinstance(value, str) and bool(value.strip()), f"{context}: expected nonempty text")
    return value


def object_value(value, context):
    require(isinstance(value, dict), f"{context}: expected an object")
    return value


def string_list(value, context, allow_empty=False):
    require(isinstance(value, list), f"{context}: expected a list")
    require(allow_empty or bool(value), f"{context}: cannot be empty")
    for item in value:
        text(item, context)
    require(len(value) == len(set(value)), f"{context}: duplicate values")
    return value


def json_bytes(path):
    try:
        raw = path.read_bytes()
        return raw, json.loads(raw.decode("utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise CourseError(f"Cannot read JSON at {path}: {exc}") from exc


def git_blob_sha(raw):
    """Git hashes the blob header plus its exact bytes, including final newlines."""
    return hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()


def local_file(root, value, context, *, exported_pdf=False):
    raw = text(value, context)
    relative = PurePosixPath(raw)
    require(
        not relative.is_absolute()
        and ".." not in relative.parts
        and "\\" not in raw
        and not re.search(r"[\x00-\x1f\x7f]", raw)
        and all(part not in {"", ".", ".."} for part in raw.split("/"))
        and relative.parts
        and (relative.parts[0] == "Notes" or (exported_pdf and relative.parts[0] == "Exports" and relative.suffix.lower() == ".pdf")),
        f"{context}: expected a repository-relative path: canonical Notes file or registered Exports PDF",
    )
    candidate = root.joinpath(*relative.parts)
    try:
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(root.resolve())
    except (OSError, ValueError) as exc:
        raise CourseError(f"{context}: missing file or path outside source root: {raw}") from exc
    require(resolved.is_file(), f"{context}: not a file: {raw}")
    return resolved


def route(path, heading=None, page=None):
    result = quote(path, safe="/")
    if heading is not None:
        result += "#" + quote(heading, safe="")
    elif page is not None:
        result += f"#page={page}"
    return result


def headings(markdown):
    """Read ATX headings, excluding fenced code examples."""
    found = []
    fence = None
    for line in markdown.splitlines():
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", line)
        if marker:
            token, rest = marker.groups()
            if fence is None:
                fence = token
            elif token[0] == fence[0] and len(token) >= len(fence) and not rest.strip():
                fence = None
            continue
        if fence is None:
            match = re.match(r"^ {0,3}#{1,6}\s+(.+?)\s*$", line)
            if match:
                value = re.sub(r"\s+#+\s*$", "", match.group(1))
                found.append(unicodedata.normalize("NFC", value))
    return found


def canonical_note_url(value, heading):
    """Accept only an exact native note destination, never an arbitrary action URL."""
    value = text(value, "note.canonicalUrl")
    require(not re.search(r"[\x00-\x20\x7f]", value) and not re.search(r"%(?![0-9A-Fa-f]{2})", value), "note.canonicalUrl: invalid encoding")
    parsed = urlsplit(value)
    require(parsed.scheme == "obsidian" and parsed.netloc == "open" and not parsed.path
            and not parsed.fragment, "note.canonicalUrl: expected obsidian://open")
    pairs = parse_qsl(parsed.query, keep_blank_values=True, strict_parsing=True)
    require(len(pairs) == 2 and {key for key, _ in pairs} == {"vault", "file"},
            "note.canonicalUrl: only vault and file parameters are allowed")
    values = dict(pairs)
    text(values["vault"], "canonical vault")
    file = values["file"]
    suffix = "#" + heading
    require(file.endswith(suffix), "note.canonicalUrl: exact heading is required in file")
    relative = file[:-len(suffix)]
    require(relative.endswith(".md") and not relative.startswith("/") and "\\" not in relative
            and all(piece not in {"", ".", ".."} for piece in relative.split("/"))
            and not re.search(r"[\x00-\x1f\x7f]", values["vault"] + file)
            and "#" not in relative and "?" not in relative,
            "note.canonicalUrl: invalid vault-relative file")
    return value


def bind_sources(root, bindings):
    result = {}
    for binding_id, raw in object_value(bindings, "noteBindings").items():
        text(binding_id, "binding ID")
        binding = object_value(raw, f"binding {binding_id}")
        note = object_value(binding.get("note"), f"{binding_id}.note")
        note_file = local_file(root, note.get("path"), f"{binding_id}.note")
        require(note_file.suffix == ".md", f"{binding_id}.note: expected Markdown")
        heading = text(note.get("heading"), f"{binding_id}.heading")
        matches = headings(note_file.read_text(encoding="utf-8")).count(
            unicodedata.normalize("NFC", heading)
        )
        require(matches == 1, f"{binding_id}: missing or ambiguous note heading: {heading}")
        canonical = canonical_note_url(note.get("canonicalUrl"), heading)
        bound = {
            "note": {"path": note["path"], "heading": heading, "route": route(note["path"], heading=heading), "canonicalUrl": canonical}
        }
        source = object_value(binding.get("courseSource"), f"{binding_id}.courseSource")
        source_file = local_file(root, source.get("path"), f"{binding_id}.courseSource", exported_pdf=True)
        require(source_file.suffix.lower() == ".pdf", f"{binding_id}.courseSource: expected a PDF")
        page = source.get("page")
        require(type(page) is int and page > 0, f"{binding_id}.courseSource: invalid PDF page")
        bound["courseSource"] = {**source, "route": route(source["path"], page=page)}
        figures = binding.get("figures", [])
        require(isinstance(figures, list), f"{binding_id}.figures: expected a list")
        bound["figures"] = []
        for figure in figures:
            object_value(figure, f"{binding_id}.figure")
            local_file(root, figure.get("path"), f"{binding_id}.figure")
            if "laterality" in figure:
                require(figure["laterality"] in LATERALITY, f"{binding_id}.figure: invalid laterality")
            bound["figures"].append({**figure, "route": route(figure["path"])})
        if "capture" in binding:
            capture = object_value(binding["capture"], f"{binding_id}.capture")
            capture_file = local_file(root, capture.get("path"), f"{binding_id}.capture")
            excerpt = text(capture.get("quote"), f"{binding_id}.capture.quote")
            require(
                excerpt in capture_file.read_text(encoding="utf-8"),
                f"{binding_id}: emphasis quotation is missing from its original capture",
            )
            # The export needs the source route, not a second copy of the capture.
            bound["capture"] = {"path": capture["path"], "route": route(capture["path"])}
        result[binding_id] = bound
    require(bool(result), "noteBindings: cannot be empty")
    return result


def check_binding_ids(value, bindings, context):
    ids = string_list(value, f"{context}.noteBindingIds")
    for binding_id in ids:
        require(binding_id in bindings, f"{context}: unknown note binding {binding_id}")
    return ids


def check_evidence(item, bindings, context):
    require(item.get("evidence") in EVIDENCE, f"{context}: invalid evidence category")
    ids = check_binding_ids(item.get("noteBindingIds"), bindings, context)
    if item["evidence"] != "course-material":
        require(
            any("capture" in bindings[binding_id] for binding_id in ids),
            f"{context}: reported emphasis or bonus requires an original capture",
        )
    return ids


def bilingual_labels(value, context):
    labels = object_value(value, f"{context}.labels")
    for language in ("sl", "la"):
        text(labels.get(language), f"{context}.labels.{language}")
    return labels


def catalogue_elements(ids, concepts, part_ids, context):
    """Resolve an ordered catalogue union without changing mesh membership."""
    elements = []
    seen = set()
    for concept_id in ids:
        require(concept_id in concepts, f"{context}: unknown catalogue concept {concept_id}")
        for element in string_list(concepts[concept_id].get("elements"), f"{context}.{concept_id}.elements"):
            require(element in part_ids, f"{context}: unknown mesh ID {element}")
            if element not in seen:
                seen.add(element)
                elements.append(element)
    return elements


def regional_context(value, selection_elements, concepts, part_ids, context):
    """Context may name untaught catalogue groups; it never adds course terms."""
    region = object_value(value, f"{context}.region")
    ids = string_list(region.get("conceptIds"), f"{context}.region.conceptIds")
    elements = catalogue_elements(ids, concepts, part_ids, f"{context}.region")
    require(
        set(selection_elements).issubset(elements),
        f"{context}: region must contain every taught target",
    )
    # Mesh lists belong to the generated snapshot, not a second authored ledger.
    require("elements" not in region, f"{context}.region: elements are derived from catalogue conceptIds")
    side = region.get("defaultSide")
    layer = region.get("defaultLayer")
    require(isinstance(side, str) and side in REGIONAL_SIDES, f"{context}: invalid regional side")
    require(isinstance(layer, str) and layer in REGIONAL_LAYERS, f"{context}: invalid regional layer")
    result = {"conceptIds": ids, "elements": elements, "defaultSide": side, "defaultLayer": layer}
    if "label" in region:
        result["label"] = text(region["label"], f"{context}.region.label")
    return result


def build_export(root, course_path, catalog_path):
    root = Path(root).resolve()
    course_path = Path(course_path).resolve()
    try:
        relative_input = course_path.relative_to(root).as_posix()
    except ValueError as exc:
        raise CourseError("The authored course input must be inside source root") from exc
    course_raw, course = json_bytes(course_path)
    object_value(course, "course")
    require(course.get("schemaVersion") == 1, "Unsupported course schemaVersion")
    for key in ("courseId", "label", "locale", "scopeNote"):
        text(course.get(key), key)
    require(course.get("privateCourseMaterial") is True, "Private course material flag must remain true")
    catalog_meta = object_value(course.get("catalog"), "catalog")
    expected_blob = text(catalog_meta.get("gitBlobSha"), "catalog.gitBlobSha")
    require(bool(re.fullmatch(r"[0-9a-f]{40}", expected_blob)), "catalog.gitBlobSha: expected a Git SHA-1 blob")
    catalog_raw, atlas = json_bytes(Path(catalog_path))
    actual_blob = git_blob_sha(catalog_raw)
    require(
        actual_blob == expected_blob,
        "Catalogue drift: expected Git blob "
        f"{expected_blob}, got {actual_blob}. Review the catalogue and course mappings "
        "before updating the pin; do not bypass this check.",
    )
    object_value(atlas, "atlas")
    require(atlas.get("version") == catalog_meta.get("version"), "Catalogue version does not match its pin")
    catalogue_concepts = atlas.get("concepts")
    parts = atlas.get("parts")
    require(isinstance(catalogue_concepts, list) and isinstance(parts, list), "Invalid atlas concepts/parts")
    concepts_by_id = {}
    for concept in catalogue_concepts:
        object_value(concept, "catalogue concept")
        concept_id = text(concept.get("id"), "catalogue concept.id")
        require(concept_id not in concepts_by_id, f"Duplicate catalogue concept: {concept_id}")
        concepts_by_id[concept_id] = concept
    part_ids = set()
    for part in parts:
        object_value(part, "catalogue part")
        part_id = text(part.get("id"), "catalogue part.id")
        require(part_id not in part_ids, f"Duplicate catalogue mesh ID: {part_id}")
        part_ids.add(part_id)

    bindings = bind_sources(root, course.get("noteBindings"))
    terms = object_value(course.get("terms"), "terms")
    require(bool(terms), "terms: cannot be empty")
    exported_concepts = []
    used_bindings = set()
    for concept_id, term in terms.items():
        object_value(term, f"term {concept_id}")
        require(concept_id in concepts_by_id, f"Unknown catalogue concept ID: {concept_id}")
        concept = concepts_by_id[concept_id]
        text(concept.get("name"), f"{concept_id}.name")
        elements = string_list(concept.get("elements"), f"{concept_id}.elements")
        for element in elements:
            require(element in part_ids, f"{concept_id}: unknown mesh ID {element}")
        bilingual_labels(term.get("labels"), concept_id)
        require(term.get("laterality") in LATERALITY, f"{concept_id}: invalid laterality")
        ids = check_binding_ids(term.get("noteBindingIds"), bindings, concept_id)
        used_bindings.update(ids)
        exported_concepts.append({
            "id": concept_id,
            "name": concept["name"],
            "elements": elements,
            "labels": term["labels"],
            "laterality": term["laterality"],
            "noteBindingIds": ids,
        })

    selections = course.get("selections")
    require(isinstance(selections, list) and bool(selections), "selections: expected a nonempty list")
    selection_ids = set()
    selected_concepts = set()
    exported_selections = []
    for selection in selections:
        object_value(selection, "selection")
        selection_id = text(selection.get("id"), "selection.id")
        require(selection_id not in selection_ids, f"Duplicate selection ID: {selection_id}")
        selection_ids.add(selection_id)
        text(selection.get("label"), f"{selection_id}.label")
        ids = string_list(selection.get("conceptIds"), f"{selection_id}.conceptIds")
        used_bindings.update(check_evidence(selection, bindings, selection_id))
        for concept_id in ids:
            require(concept_id in terms, f"{selection_id}: concept has no course term: {concept_id}")
            selected_concepts.add(concept_id)
        elements = catalogue_elements(ids, concepts_by_id, part_ids, selection_id)
        exported = {**selection, "elements": elements}
        if "region" in selection:
            exported["region"] = regional_context(
                selection["region"], elements, concepts_by_id, part_ids, selection_id
            )
        exported_selections.append(exported)
    require(selected_concepts == set(terms), "Some course terms are unused by any selection")

    objectives = course.get("unmappedObjectives", [])
    require(isinstance(objectives, list), "unmappedObjectives: expected a list")
    objective_ids = set()
    for objective in objectives:
        object_value(objective, "unmapped objective")
        objective_id = text(objective.get("id"), "unmapped objective.id")
        require(objective_id not in objective_ids, f"Duplicate objective ID: {objective_id}")
        objective_ids.add(objective_id)
        require(
            not any(key in objective for key in ("conceptId", "conceptIds", "elements", "coordinates", "landmark")),
            f"{objective_id}: an unmapped objective cannot claim catalogue or mesh IDs",
        )
        bilingual_labels(objective.get("labels"), objective_id)
        require(objective.get("mappingStatus") == "unmapped", f"{objective_id}: expected mappingStatus=unmapped")
        text(objective.get("reason"), f"{objective_id}.reason")
        used_bindings.update(check_evidence(objective, bindings, objective_id))
        context_selection = objective.get("contextSelectionId")
        require(context_selection in selection_ids, f"{objective_id}: unknown context selection")
    require(used_bindings == set(bindings), "Some note bindings are unused")

    return {
        "schemaVersion": 1,
        "courseId": course["courseId"],
        "label": course["label"],
        "locale": course["locale"],
        "scopeNote": course["scopeNote"],
        "privateCourseMaterial": True,
        "routeBase": "spaceo-repository-root",
        "sourceInput": {
            "path": relative_input,
            "sha256": hashlib.sha256(course_raw).hexdigest(),
        },
        "catalog": catalog_meta,
        "provenance": object_value(course.get("provenance"), "provenance"),
        "noteBindings": bindings,
        "concepts": exported_concepts,
        "selections": exported_selections,
        "unmappedObjectives": objectives,
    }


def write_export(output, payload):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=output.parent, prefix=".atlas-course-", delete=False
        ) as handle:
            temporary = Path(handle.name)
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary, output)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()
    return output


# The transport never accepts a host, shell command, directory scan or vault root.
REMOTE_READ = '''import os,sys
from pathlib import Path
p=Path(sys.argv[1]); limit=int(sys.argv[2])
if any(q.is_symlink() for q in [p,*p.parents]): raise RuntimeError('Symlink source refused')
fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
with os.fdopen(fd,'rb') as f:
 data=f.read(limit+1)
 if len(data)>limit: raise RuntimeError('Source exceeds byte limit')
 sys.stdout.buffer.write(data)
'''


def validate_entry(entry):
    object_value(entry, 'canonical source')
    name = text(entry.get('canonicalPath'), 'canonical source.canonicalPath')
    require(name.startswith('/') and '\\' not in name
            and all(p not in {'', '.', '..'} for p in name.split('/')[1:])
            and not re.search(r'[\x00-\x1f\x7f]', name), 'Source must be an explicit absolute canonical file')
    require(type(entry.get('bytes')) is int and entry['bytes'] > 0, 'Source bytes must be a positive integer')
    require(bool(re.fullmatch('[0-9a-f]{64}', str(entry.get('sha256')))), 'Source SHA-256 is required')
    text(entry.get('mime'), 'canonical source.mime')
    return name


def read_remote(name, limit):
    command = shlex.join(['python3', '-c', REMOTE_READ, name, str(limit)])
    result = subprocess.run(['ssh', '-oBatchMode=yes', 'm1-worker', command],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    require(result.returncode == 0, 'Canonical source read failed; inspect the authorized M1 route')
    return result.stdout


def fetch_source(entry):
    name = validate_entry(entry)
    return checked_bytes(entry, read_remote(name, entry['bytes']))


def checked_bytes(entry, data):
    validate_entry(entry)
    require(len(data) == entry['bytes'], 'Canonical source byte count differs')
    require(hashlib.sha256(data).hexdigest() == entry['sha256'], 'Canonical source SHA-256 differs')
    return data


def check_media(data, mime, kind):
    allowed = {'note': {'text/markdown'}, 'capture': {'text/markdown'},
               'courseSource': {'application/pdf'},
               'figure': {'image/png', 'image/jpeg', 'image/webp', 'image/gif'}}
    require(mime in allowed[kind], f'{kind}: unsupported MIME')
    if mime.startswith('text/'):
        data.decode('utf-8')
    elif mime == 'application/pdf':
        require(data.startswith(b'%PDF-'), 'Invalid PDF signature')
    elif mime == 'image/png':
        require(data.startswith(b'\x89PNG\r\n\x1a\n'), 'Invalid PNG signature')
    elif mime == 'image/jpeg':
        require(data.startswith(b'\xff\xd8\xff'), 'Invalid JPEG signature')
    elif mime == 'image/gif':
        require(data.startswith((b'GIF87a', b'GIF89a')), 'Invalid GIF signature')
    else:
        require(data.startswith(b'RIFF') and data[8:12] == b'WEBP', 'Invalid WebP signature')


def produce(manifest, catalog, output, reader=fetch_source, manifest_sha256=None):
    """Build one new immutable bundle; callers select it only after paired checks."""
    require(manifest.get('schemaVersion') == 1, 'Unsupported canonical manifest schema')
    rows = object_value(manifest.get('sources'), 'manifest.sources')
    returns = object_value(manifest.get('noteReturns'), 'manifest.noteReturns')
    vault = object_value(manifest.get('vault'), 'manifest.vault')
    overlay = text(manifest.get('overlay'), 'manifest.overlay')
    vault_root = text(vault.get('root'), 'manifest.vault.root')
    require(vault_root.startswith('/') and not vault_root.endswith('/')
            and all(p not in {'', '.', '..'} for p in vault_root.split('/')[1:]),
            'Invalid canonical vault root')
    require(overlay.startswith(vault_root + '/') and Path(overlay).name == 'course.json',
            'Authored course must be the explicit course.json inside the pinned canonical vault')
    course_entry = {'canonicalPath': overlay, 'sha256': manifest.get('overlaySha256'),
                    'bytes': 2 * 1024 * 1024, 'mime': 'application/json'}
    # Overlay has a pinned hash but no declared byte count in the canonical manifest.
    course_raw = read_remote(overlay, course_entry['bytes']) if reader is fetch_source else reader(course_entry)
    course_entry['bytes'] = len(course_raw)
    checked_bytes(course_entry, course_raw)
    course = json.loads(course_raw)
    require(set(returns) == set(course['noteBindings']), 'Canonical note-return bindings differ')
    original_notes = {}
    output = Path(output).absolute()
    repo = Path(__file__).resolve().parents[1]
    require(not output.resolve().is_relative_to(repo), 'Private output must remain outside the repository')
    require(not output.exists() and not output.is_symlink(), 'Output already exists; select a fresh bundle path')
    require(output.parent.is_dir(), 'Output parent must already exist')
    # A source-root-relative provenance key, not a retained second authored mapping.
    input_key = 'Notes/course-input.json'
    used, files, note_links = set(), {}, {}
    with tempfile.TemporaryDirectory(prefix='.atlas-export-', dir=output.parent) as temporary:
        scratch = Path(temporary)
        stage = scratch/'sources'
        stage.mkdir(mode=0o700)
        note_paths, served_paths = set(), set()
        cache = {}
        for binding_id, binding in object_value(course.get('noteBindings'), 'noteBindings').items():
            items = [('note', binding['note']), ('courseSource', binding['courseSource'])]
            items.extend(('figure', f) for f in binding.get('figures', []))
            if 'capture' in binding:
                items.append(('capture', binding['capture']))
            for kind, item in items:
                key = text(item.get('path'), 'source key')
                require(key in rows, f'Missing canonical mapping: {key}')
                entry = rows[key]
                validate_entry(entry)
                require(entry['canonicalPath'] == vault['root'] + '/' + entry['vaultRelativePath'],
                        'Canonical path differs from vault-relative identity')
                if kind == 'courseSource':
                    require(type(entry.get('pages')) is int and 0 < item['page'] <= entry['pages'],
                            'Physical PDF page is outside canonical source')
                if key not in cache:
                    cache[key] = checked_bytes(entry, reader(entry))
                data = cache[key]
                check_media(data, entry['mime'], kind)
                used.add(key)
                target = str(PurePosixPath(key).with_suffix('.md')) if kind == 'capture' else key
                # Reuse the consumer's bounded relative path contract before any write.
                relative = PurePosixPath(target)
                require(not relative.is_absolute() and '\\' not in target
                        and all(p not in {'', '.', '..'} for p in target.split('/'))
                        and not re.search(r'[\x00-\x1f\x7f]', target)
                        and (relative.parts[0] == 'Notes' or
                             (kind == 'courseSource' and relative.parts[0] == 'Exports')),
                        'Invalid derived source key')
                require(target != input_key, 'Source collides with provenance key')
                if target in files:
                    require(files[target] == entry, 'Derived source key collision')
                files[target] = entry
                path = stage/target
                path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                path.write_bytes(data)
                path.chmod(0o600)
                item['path'] = target
                if kind == 'note':
                    returned = returns[binding_id]
                    require(returned['noteSourceId'] == key and returned['canonicalPath'] == entry['canonicalPath']
                            and returned['vaultRelativePath'] == entry['vaultRelativePath']
                            and returned['vaultId'] == vault['id'] and returned['vaultRoot'] == vault['root'],
                            'Canonical note-return identity differs')
                    require(returned['pageSourceId'] == binding['courseSource']['path']
                            and returned['physicalPage'] == binding['courseSource']['page'],
                            'Canonical note-return PDF identity differs')
                    url = canonical_note_url(returned['canonicalUrl'], returned['heading'])
                    values = dict(parse_qsl(urlsplit(url).query))
                    require(values['vault'] == vault['id']
                            and values['file'] == entry['vaultRelativePath'] + '#' + returned['heading'],
                            'Canonical URL differs from registered note identity')
                    original_notes[binding_id] = dict(item)
                    item['heading'] = returned['heading']
                    item['canonicalUrl'] = url
                    note_links[binding_id] = url
                    note_paths.add(target)
                else:
                    served_paths.add(target)
        require(used == set(rows), 'Manifest includes sources not registered by this course')
        authored = stage/input_key
        authored.parent.mkdir(parents=True, exist_ok=True)
        authored.write_text(json.dumps(course, ensure_ascii=False), encoding='utf-8')
        payload = build_export(stage, authored, catalog)
        payload['sourceInput']['sha256'] = hashlib.sha256(course_raw).hexdigest()
        for binding_id, original in original_notes.items():
            note = payload['noteBindings'][binding_id]['note']
            note['heading'] = original['heading']
            note['route'] = route(original['path'], heading=original['heading'])
        # Notes only support transient heading validation; native URLs point to canonical notes.
        for name in note_paths - served_paths:
            (stage/name).unlink()
        authored.unlink()
        receipt = {'schemaVersion': 1, 'course': course_entry, 'sources': files, 'vault': vault,
                   'canonicalManifestSha256': manifest_sha256 or hashlib.sha256(json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode()).hexdigest(),
                   'noteLinks': note_links, 'catalogBlobSha': payload['catalog']['gitBlobSha'],
                   'exporterSource': 'SpaceO blob 7ad7ddac9c897d07e45cac3132aa5497715dbcdb',
                   'termIds': list(course['terms']),
                   'objectiveIds': [o['id'] for o in course.get('unmappedObjectives', [])]}
        write_export(stage/'course.json', payload)
        receipt['courseSha256'] = hashlib.sha256((stage/'course.json').read_bytes()).hexdigest()
        write_export(stage/'manifest.json', receipt)
        os.rename(stage, output)
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, help='Exact canonical M1 canonical-sources.json path')
    parser.add_argument('--manifest-sha256', required=True, help='Content owner supplied SHA-256')
    parser.add_argument('--manifest-bytes', required=True, type=int, help='Content owner supplied byte count')
    parser.add_argument('--catalog', required=True, type=Path, help='Accepted public/models/atlas.json')
    parser.add_argument('--output', required=True, type=Path, help='New private bundle directory outside this repository')
    args = parser.parse_args()
    try:
        require(Path(args.manifest).name == 'canonical-sources.json', 'Expected explicit canonical-sources.json metadata')
        entry = {'canonicalPath': args.manifest, 'sha256': args.manifest_sha256,
                 'bytes': args.manifest_bytes, 'mime': 'application/json'}
        raw = fetch_source(entry)
        manifest = json.loads(raw)
        require(Path(manifest['overlay']).parent == Path(args.manifest).parent,
                'Authored overlay must be beside the pinned canonical manifest')
        require(manifest.get('permission') == {'role': 'private', 'transport': 'existing ssh m1-worker',
                'exactPathsOnly': True, 'directoryAccess': False, 'arbitraryPathAccess': False,
                'publicExposure': False}, 'Canonical manifest must authorize only exact private source reads')
        bundle = produce(manifest, args.catalog, args.output, manifest_sha256=hashlib.sha256(raw).hexdigest())
        print(json.dumps({'bundle': str(bundle), 'manifestSha256': hashlib.sha256(raw).hexdigest(),
                          'courseSha256': hashlib.sha256((bundle/'course.json').read_bytes()).hexdigest()}))
    except (CourseError, OSError, UnicodeError, ValueError, KeyError) as exc:
        parser.exit(1, f'Course export failed: {exc}\n')


if __name__ == '__main__':
    main()
