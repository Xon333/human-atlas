"""Focused failure tests; fixture PDF/image bytes test paths, not media contents."""

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from urllib.parse import quote


SPEC = importlib.util.spec_from_file_location("atlas_export", Path(__file__).with_name("export-course.py"))
export = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(export)


class CourseExportTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "SpaceO"
        self.root.mkdir()
        self.note_path = "Notes/UNI/Anatomija/Koščice — šivi.md"
        self.heading = "Šivi in koščice — položaj"
        self.pdf_path = "Notes/Attachments/3_Skelet.pdf"
        self.figure_path = "Notes/Attachments/Anatomija/koščice.png"
        self.capture_path = "Notes/UNI/Anatomija/Sources/zajem — izvirnik.txt"
        self.put(self.note_path, f"# Primer\n\n## {self.heading}\n\nUčno besedilo.\n")
        self.put(self.pdf_path, "PDF path fixture; not a real PDF")
        self.put(self.figure_path, "Image path fixture; not a real image")
        self.put(self.capture_path, "Izvirni zajem: imena in zaporedje kosti\n")
        self.catalog_path = Path(self.temporary.name) / "atlas.json"
        self.atlas = {
            "version": "fixture",
            "parts": [{"id": item} for item in ("FJ1", "FJ2", "FJ3")],
            "concepts": [
                {"id": "FMA1", "name": "first fixture bone", "elements": ["FJ2", "FJ1"]},
                {"id": "FMA2", "name": "second fixture bone", "elements": ["FJ3", "FJ1"]},
            ],
        }
        self.course = {
            "schemaVersion": 1,
            "courseId": "fixture-course",
            "label": "Koščice",
            "locale": "sl",
            "scopeNote": "Only a test fixture.",
            "privateCourseMaterial": True,
            "catalog": {"version": "fixture"},
            "provenance": {"fixture": True},
            "noteBindings": {
                "bones": {
                    "note": {"path": self.note_path, "heading": self.heading, "canonicalUrl": "obsidian://open?vault=UNI&file=" + quote("Human/Koščice.md#" + self.heading, safe="")},
                    "courseSource": {"path": self.pdf_path, "page": 74},
                    "figures": [{"path": self.figure_path}],
                    "capture": {"path": self.capture_path, "quote": "imena in zaporedje kosti"},
                }
            },
            "terms": {
                "FMA1": {
                    "labels": {"sl": "Prva kost", "la": "os primum"},
                    "laterality": "bilateral",
                    "noteBindingIds": ["bones"],
                },
                "FMA2": {
                    "labels": {"sl": "Druga kost", "la": "os secundum"},
                    "laterality": "bilateral",
                    "noteBindingIds": ["bones"],
                },
            },
            "selections": [{
                "id": "bones",
                "label": "Kosti v določenem vrstnem redu",
                "conceptIds": ["FMA2", "FMA1"],
                "noteBindingIds": ["bones"],
                "evidence": "student-reported-emphasis",
            }],
            "unmappedObjectives": [{
                "id": "fixture-suture",
                "labels": {"sl": "Šiv", "la": "sutura"},
                "mappingStatus": "unmapped",
                "reason": "The fixture contains no mapped suture.",
                "noteBindingIds": ["bones"],
                "evidence": "student-reported-emphasis",
                "contextSelectionId": "bones",
            }],
        }
        self.save_catalog()
        self.course_path = self.root / Path("Notes/course-input.json")
        self.save_course()

    def put(self, relative, value):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding="utf-8")
        return path

    def save_course(self):
        self.put(Path("Notes/course-input.json"), json.dumps(self.course, ensure_ascii=False, indent=2) + "\n")

    def save_catalog(self):
        raw = json.dumps(self.atlas, ensure_ascii=False).encode("utf-8")
        self.catalog_path.write_bytes(raw)
        self.course["catalog"]["gitBlobSha"] = export.git_blob_sha(raw)

    def build(self):
        self.save_course()
        return export.build_export(self.root, self.course_path, self.catalog_path)

    def add_region(self):
        self.atlas["parts"].append({"id": "FJ4"})
        self.atlas["concepts"].append({"id": "FMA3", "name": "untaught regional context", "elements": ["FJ4", "FJ2"]})
        self.save_catalog()
        region = {"conceptIds": ["FMA3", "FMA2", "FMA1"], "defaultSide": "right", "defaultLayer": "bones"}
        self.course["selections"][0]["region"] = region
        return region

    def test_order_mesh_resolution_and_unicode_routes(self):
        payload = self.build()
        self.assertEqual(payload["concepts"][0]["name"], "first fixture bone")
        self.assertEqual(payload["concepts"][0]["elements"], ["FJ2", "FJ1"])
        selection = payload["selections"][0]
        self.assertNotIn("region", selection)  # Existing overlays remain valid.
        self.assertEqual(selection["conceptIds"], ["FMA2", "FMA1"])
        self.assertEqual(selection["elements"], ["FJ3", "FJ1", "FJ2"])
        binding = payload["noteBindings"]["bones"]
        self.assertEqual(
            binding["note"]["route"],
            quote(self.note_path, safe="/") + "#" + quote(self.heading, safe=""),
        )
        self.assertEqual(binding["courseSource"]["route"], "Notes/Attachments/3_Skelet.pdf#page=74")
        self.assertNotIn("quote", binding["capture"])
        self.assertNotIn(str(self.root), json.dumps(payload))
        output = export.write_export(self.root / "course.json", payload)
        first = output.read_bytes()
        self.assertIn("Šivi".encode("utf-8"), first)
        export.write_export(self.root / "course.json", self.build())
        self.assertEqual(first, output.read_bytes())

    def test_region_resolves_catalogue_context_without_expanding_teaching_scope(self):
        original = self.build()
        self.add_region()
        payload = self.build()
        self.assertEqual(payload["concepts"], original["concepts"])
        self.assertEqual(payload["noteBindings"], original["noteBindings"])
        self.assertEqual(payload["unmappedObjectives"], original["unmappedObjectives"])
        selection = payload["selections"][0]
        self.assertEqual({key: value for key, value in selection.items() if key != "region"}, original["selections"][0])
        self.assertEqual(selection["region"], {
            "conceptIds": ["FMA3", "FMA2", "FMA1"],
            "elements": ["FJ4", "FJ2", "FJ3", "FJ1"],
            "defaultSide": "right", "defaultLayer": "bones",
        })
        self.assertNotIn("FMA3", [concept["id"] for concept in payload["concepts"]])

    def test_region_requires_known_catalogue_concepts_and_meshes(self):
        region = self.add_region()
        region["conceptIds"].append("FMA-missing")
        with self.assertRaisesRegex(export.CourseError, "unknown catalogue concept"):
            self.build()
        region["conceptIds"].pop()
        self.atlas["concepts"][-1]["elements"] = ["FJ-missing"]
        self.save_catalog()
        with self.assertRaisesRegex(export.CourseError, "unknown mesh ID"):
            self.build()

    def test_region_label_is_optional_and_preserves_the_teaching_label(self):
        region = self.add_region()
        original = self.build()["selections"][0]
        self.assertNotIn("label", original["region"])
        region["label"] = "Predel — koščice"
        selection = self.build()["selections"][0]
        self.assertEqual(selection["region"]["label"], "Predel — koščice")
        self.assertEqual(selection["label"], original["label"])
        self.assertEqual(selection["conceptIds"], original["conceptIds"])
        self.assertEqual(selection["evidence"], original["evidence"])

    def test_region_label_requires_nonempty_text_when_present(self):
        region = self.add_region()
        for value in (None, "", "  ", 42, []):
            with self.subTest(value=value):
                region["label"] = value
                with self.assertRaisesRegex(export.CourseError, "region.label: expected nonempty text"):
                    self.build()

    def test_region_must_include_all_taught_meshes(self):
        region = self.add_region()
        region["conceptIds"] = ["FMA3"]
        with self.assertRaisesRegex(export.CourseError, "contain every taught target"):
            self.build()

    def test_region_rejects_empty_or_repeated_concepts(self):
        region = self.add_region()
        for ids in ([], ["FMA1", "FMA2", "FMA1"]):
            with self.subTest(ids=ids):
                region["conceptIds"] = ids
                with self.assertRaises(export.CourseError):
                    self.build()

    def test_region_has_one_derived_mesh_list(self):
        region = self.add_region()
        region["elements"] = ["FJ4", "FJ2", "FJ3", "FJ1"]
        with self.assertRaisesRegex(export.CourseError, "elements are derived"):
            self.build()

    def test_region_requires_consumer_supported_defaults(self):
        region = self.add_region()
        for field, values in (("defaultSide", (None, "bilateral", [], "")), ("defaultLayer", (None, "skeletal", [], ""))):
            previous = region[field]
            for value in values:
                with self.subTest(field=field, value=value):
                    region[field] = value
                    with self.assertRaisesRegex(export.CourseError, "invalid regional"):
                        self.build()
            region[field] = previous

    def test_invalid_region_preserves_previous_export(self):
        self.add_region()
        output = export.write_export(self.root / "course.json", self.build())
        previous = output.read_bytes()
        self.course["selections"][0]["region"]["conceptIds"] = ["FMA-missing"]
        with self.assertRaises(export.CourseError):
            export.write_export(self.root / "course.json", self.build())
        self.assertEqual(output.read_bytes(), previous)

    def test_unknown_concept_and_mesh_ids_fail(self):
        self.course["terms"]["FMA-missing"] = self.course["terms"].pop("FMA1")
        with self.assertRaisesRegex(export.CourseError, "Unknown catalogue concept ID"):
            self.build()
        self.course["terms"]["FMA1"] = self.course["terms"].pop("FMA-missing")
        self.atlas["concepts"][0]["elements"] = ["FJ-missing"]
        self.save_catalog()
        with self.assertRaisesRegex(export.CourseError, "unknown mesh ID"):
            self.build()

    def test_catalogue_drift_preserves_previous_export(self):
        output = export.write_export(self.root / "course.json", self.build())
        previous = output.read_bytes()
        # Even formatting-only byte changes need an explicit review and a new pin.
        self.catalog_path.write_bytes(self.catalog_path.read_bytes() + b"\n")
        with self.assertRaisesRegex(export.CourseError, "Catalogue drift"):
            self.build()
        self.assertEqual(previous, output.read_bytes())

    def test_missing_fenced_or_ambiguous_heading_fails(self):
        alternatives = [
            "# Primer\n## Drug naslov\n",
            "# Primer\n```md\n## " + self.heading + "\n```\n",
            "## " + self.heading + "\n\n## " + self.heading + "\n",
        ]
        for markdown in alternatives:
            with self.subTest(markdown=markdown):
                self.put(self.note_path, markdown)
                with self.assertRaisesRegex(export.CourseError, "missing or ambiguous note heading"):
                    self.build()

    def test_missing_note_pdf_figure_or_capture_fails(self):
        for relative in (self.note_path, self.pdf_path, self.figure_path, self.capture_path):
            with self.subTest(path=relative):
                file = self.root / relative
                previous = file.read_bytes()
                file.unlink()
                try:
                    with self.assertRaisesRegex(export.CourseError, "missing file"):
                        self.build()
                finally:
                    file.write_bytes(previous)

    def test_changed_emphasis_source_fails(self):
        self.put(self.capture_path, "A new capture without the original excerpt.\n")
        with self.assertRaisesRegex(export.CourseError, "quotation is missing"):
            self.build()

    def test_bonus_and_reported_emphasis_require_a_capture(self):
        for category in ("bonus", "student-reported-emphasis"):
            with self.subTest(category=category):
                self.course["selections"][0]["evidence"] = category
                self.assertEqual(self.build()["selections"][0]["evidence"], category)
                capture = self.course["noteBindings"]["bones"].pop("capture")
                try:
                    with self.assertRaisesRegex(export.CourseError, "requires an original capture"):
                        self.build()
                finally:
                    self.course["noteBindings"]["bones"]["capture"] = capture

    def test_unmapped_objective_cannot_claim_an_atlas_id(self):
        objective = self.course["unmappedObjectives"][0]
        for field in ("conceptId", "conceptIds", "elements", "coordinates", "landmark"):
            with self.subTest(field=field):
                objective[field] = "FMA1"
                with self.assertRaisesRegex(export.CourseError, "cannot claim catalogue or mesh IDs"):
                    self.build()
                del objective[field]

    def test_unresolved_selection_and_binding_fail(self):
        self.course["selections"][0]["conceptIds"].append("FMA-other")
        with self.assertRaisesRegex(export.CourseError, "concept has no course term"):
            self.build()
        self.course["selections"][0]["conceptIds"].pop()
        self.course["terms"]["FMA1"]["noteBindingIds"] = ["missing-binding"]
        with self.assertRaisesRegex(export.CourseError, "unknown note binding"):
            self.build()

    def test_source_path_cannot_escape_spaceo(self):
        binding = self.course["noteBindings"]["bones"]
        binding["figures"][0]["path"] = "Notes/../../outside.png"
        with self.assertRaisesRegex(export.CourseError, "repository-relative path"):
            self.build()
        outside = Path(self.temporary.name) / "outside.png"
        outside.write_text("Outside the checkout.", encoding="utf-8")
        self.put("Notes/Attachments/link.png", "").unlink()
        (self.root / "Notes/Attachments/link.png").symlink_to(outside)
        binding["figures"][0]["path"] = "Notes/Attachments/link.png"
        with self.assertRaisesRegex(export.CourseError, "path outside source root"):
            self.build()

    def test_source_paths_match_consumer_canonical_path_rules(self):
        binding = self.course["noteBindings"]["bones"]
        for path in ("Notes//Attachments/Anatomija/koščice.png", "Notes/Attachments/./Anatomija/koščice.png", "Notes/Attachments/Anatomija/koščice.png/", "Notes/Attachments/bad\x00name.png"):
            with self.subTest(path=path):
                binding["figures"][0]["path"] = path
                with self.assertRaisesRegex(export.CourseError, "repository-relative path"):
                    self.build()



    def test_registered_exported_pdf_keeps_its_exact_physical_page_route(self):
        path = "Exports/Synthetic course/Book.pdf"
        self.put(path, "PDF path fixture")
        self.course["noteBindings"]["bones"]["courseSource"] = {"path": path, "page": 337}
        payload = self.build()
        self.assertEqual(payload["noteBindings"]["bones"]["courseSource"]["route"], "Exports/Synthetic%20course/Book.pdf#page=337")

    def test_exported_pdf_exception_does_not_allow_other_sources_or_paths(self):
        for path in ("Exports/Synthetic/Book.txt", "Exports/../Book.pdf", "Exports//Book.pdf", "Other/Book.pdf"):
            with self.subTest(path=path):
                with self.assertRaisesRegex(export.CourseError, "repository-relative path"):
                    export.local_file(self.root, path, "source", exported_pdf=True)
        self.put("Exports/Book.pdf", "fixture")
        with self.assertRaisesRegex(export.CourseError, "repository-relative path"):
            export.local_file(self.root, "Exports/Book.pdf", "note")



class BundleTests(unittest.TestCase):
    setUp = CourseExportTests.setUp
    put = CourseExportTests.put
    save_course = CourseExportTests.save_course
    save_catalog = CourseExportTests.save_catalog

    def manifest_fixture(self):
        import hashlib
        self.put(self.pdf_path, '%PDF-1.7\nSynthetic PDF')
        (self.root/self.figure_path).write_bytes(b'\x89PNG\r\n\x1a\nsynthetic image')
        self.save_course()
        data = {}
        sources = {}
        vault = {'root': '/private/canonical/'.rstrip('/'), 'id': 'synthetic-vault'}
        for i, (key, mime) in enumerate([(self.note_path, 'text/markdown'), (self.pdf_path, 'application/pdf'),
                                       (self.figure_path, 'image/png'), (self.capture_path, 'text/markdown')]):
            raw = (self.root/key).read_bytes()
            suffix = '.md' if mime.startswith('text/') else Path(key).suffix
            canonical = '/private/canonical/' + f'Test/source-{i}{suffix}'
            data[canonical] = raw
            sources[key] = {'canonicalPath': canonical, 'vaultRelativePath': f'Test/source-{i}{suffix}',
                            'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'mime': mime}
            if mime == 'application/pdf':
                sources[key]['pages'] = 100
        overlay = '/private/canonical/' + 'Attachments/Anatomija/Reference/human-atlas/course.json'
        raw = self.course_path.read_bytes()
        data[overlay] = raw
        returned = {'noteSourceId': self.note_path, 'canonicalPath': sources[self.note_path]['canonicalPath'],
                    'vaultRelativePath': sources[self.note_path]['vaultRelativePath'], 'vaultId': vault['id'],
                    'vaultRoot': vault['root'], 'heading': self.heading, 'pageSourceId': self.pdf_path,
                    'physicalPage': 74, 'canonicalUrl': 'obsidian://open?vault=synthetic-vault&file=' +
                    quote(sources[self.note_path]['vaultRelativePath']+'#'+self.heading, safe='')}
        manifest = {'schemaVersion': 1, 'overlay': overlay, 'overlaySha256': hashlib.sha256(raw).hexdigest(),
                    'vault': vault, 'sources': sources, 'noteReturns': {'bones': returned}}
        return manifest, data

    def produce(self, manifest, data):
        output = Path(self.temporary.name)/'bundle'
        return export.produce(manifest, self.catalog_path, output, reader=lambda entry: data[entry['canonicalPath']])

    def test_bundle_contains_only_derived_serving_assets_and_receipts(self):
        import hashlib
        manifest, data = self.manifest_fixture()
        output = self.produce(manifest, data)
        self.assertFalse((output/self.note_path).exists())
        self.assertFalse((output/'Notes/course-input.json').exists())
        self.assertFalse((output/self.capture_path).exists())
        self.assertTrue((output/Path(self.capture_path).with_suffix('.md')).is_file())
        payload = json.loads((output/'course.json').read_bytes())
        receipt = json.loads((output/'manifest.json').read_bytes())
        self.assertEqual(payload['sourceInput']['sha256'], manifest['overlaySha256'])
        self.assertEqual(payload['noteBindings']['bones']['note']['canonicalUrl'], manifest['noteReturns']['bones']['canonicalUrl'])
        self.assertEqual(receipt['courseSha256'], hashlib.sha256((output/'course.json').read_bytes()).hexdigest())
        with self.assertRaisesRegex(export.CourseError, 'already exists'):
            self.produce(manifest, data)

    def test_canonical_heading_is_validated_without_changing_legacy_provenance(self):
        import hashlib
        manifest, data = self.manifest_fixture()
        note = manifest['sources'][self.note_path]
        data[note['canonicalPath']] = b'# Renamed canonical heading\n'
        note['bytes'] = len(data[note['canonicalPath']])
        note['sha256'] = hashlib.sha256(data[note['canonicalPath']]).hexdigest()
        returned = manifest['noteReturns']['bones']
        returned['heading'] = 'Renamed canonical heading'
        returned['canonicalUrl'] = 'obsidian://open?vault=synthetic-vault&file=' + quote(note['vaultRelativePath']+'#'+returned['heading'], safe='')
        payload = json.loads((self.produce(manifest, data)/'course.json').read_bytes())
        self.assertEqual(payload['noteBindings']['bones']['note']['heading'], self.heading)
        self.assertIn('Renamed%20canonical%20heading', payload['noteBindings']['bones']['note']['canonicalUrl'])

    def test_changed_source_never_publishes_or_retains_staging(self):
        manifest, data = self.manifest_fixture()
        data[manifest['sources'][self.figure_path]['canonicalPath']] += b'changed'
        with self.assertRaisesRegex(export.CourseError, 'byte count differs'):
            self.produce(manifest, data)
        self.assertFalse((Path(self.temporary.name)/'bundle').exists())
        self.assertFalse(list(Path(self.temporary.name).glob('.atlas-export-*')))

    def test_extra_source_and_missing_return_refuse(self):
        manifest, data = self.manifest_fixture()
        manifest['sources']['Notes/unregistered.md'] = manifest['sources'][self.note_path]
        with self.assertRaisesRegex(export.CourseError, 'not registered'):
            self.produce(manifest, data)
        del manifest['sources']['Notes/unregistered.md']
        manifest['noteReturns'].clear()
        with self.assertRaisesRegex(export.CourseError, 'bindings differ'):
            self.produce(manifest, data)

    def test_wrong_pdf_page_mime_and_hash_refuse(self):
        manifest, data = self.manifest_fixture()
        entry = manifest['sources'][self.pdf_path]
        entry['pages'] = 73
        with self.assertRaisesRegex(export.CourseError, 'Physical PDF page'):
            self.produce(manifest, data)
        entry['pages'] = 100
        entry['mime'] = 'text/plain'
        with self.assertRaisesRegex(export.CourseError, 'MIME'):
            self.produce(manifest, data)
        entry['mime'] = 'application/pdf'
        entry['sha256'] = '0'*64
        with self.assertRaisesRegex(export.CourseError, 'SHA-256 differs'):
            self.produce(manifest, data)

    def test_canonical_url_rejects_actions_extra_parameters_and_wrong_identity(self):
        manifest, data = self.manifest_fixture()
        returned = manifest['noteReturns']['bones']
        original = returned['canonicalUrl']
        for url in ['https://example.com', original+'&action=delete', original+'&vault=duplicate',
                    original.replace('synthetic-vault', 'wrong-vault'), original.replace('open?', 'user@open?')]:
            returned['canonicalUrl'] = url
            with self.subTest(url=url), self.assertRaises((export.CourseError, ValueError)):
                self.produce(manifest, data)


class TransportTests(unittest.TestCase):
    def test_fixed_route_quotes_exact_path_and_checks_hash(self):
        import hashlib
        from unittest.mock import patch
        from types import SimpleNamespace
        data = b'Synthetic capture'
        entry = {'canonicalPath': '/private/canonical/' + "Test/owner's source.md",
                 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'mime': 'text/markdown'}
        with patch.object(export.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=data)) as run:
            self.assertEqual(export.fetch_source(entry), data)
            argv = run.call_args.args[0]
            self.assertEqual(argv[:4], ['ssh', '-oBatchMode=yes', 'm1-worker', argv[3]])
            import shlex
            remote = shlex.split(argv[3])
            self.assertEqual(remote[:2], ['python3', '-c'])
            self.assertEqual(remote[3:], [entry['canonicalPath'], str(len(data))])
            self.assertIn('O_NOFOLLOW', remote[2])
        for name in ['relative/source.md',
                     '/private/canonical/' + '../outside.md']:
            entry['canonicalPath'] = name
            with patch.object(export.subprocess, 'run') as run:
                with self.assertRaises(export.CourseError):
                    export.fetch_source(entry)
                run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
