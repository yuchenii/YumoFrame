"""Unit tests for the FunASR transcript CLI."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from media_text.cli import main, normalize_alignment, normalize_results, split_timestamped_text


class NormalizeResultsTest(unittest.TestCase):
    def test_prefers_sentence_timestamps(self) -> None:
        payload = normalize_results(
            [
                {
                    "text": "整段文本",
                    "sentence_info": [
                        {"text": "第一句。", "start": 500, "end": 1500, "timestamp": [[500, 900]]},
                        {"text": "第二句。", "start": 1800, "end": 2600, "timestamp": [[1800, 2300]]},
                    ],
                }
            ],
            3.0,
        )

        self.assertEqual(payload["engine"], "funasr")
        self.assertEqual(payload["segments"][0]["start"], 0.5)
        self.assertEqual(payload["segments"][1]["end"], 2.6)

    def test_splits_punctuated_text_using_character_timestamps(self) -> None:
        segments = split_timestamped_text("你好，世界。", [[0, 100], [100, 200], [300, 400], [400, 500]])

        self.assertEqual([segment["text"] for segment in segments], ["你好，", "世界。"])
        self.assertEqual(segments[1]["start"], 0.3)

    def test_ascii_words_consume_one_timestamp(self) -> None:
        segments = split_timestamped_text("对战model和Henry。", [[0, 100], [100, 200], [200, 400], [400, 500], [500, 700]])

        self.assertEqual(segments[0]["text"], "对战model和Henry。")
        self.assertEqual(segments[0]["end"], 0.7)

    def test_alignment_ignores_unspoken_em_dashes_when_splitting_sentences(self) -> None:
        text = "第一句。不是这样——是那样。"
        timestamps = [[index * 100, (index + 1) * 100] for index in range(10)]

        payload = normalize_alignment([{"timestamp": timestamps}], text, 2.0)

        self.assertEqual([segment["text"] for segment in payload["segments"]], ["第一句。", "不是这样——是那样。"])
        self.assertEqual(sum(len(segment["timestamp"]) for segment in payload["segments"]), 10)


class AlignManifestTest(unittest.TestCase):
    def test_rejects_unsupported_manifest_version(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            manifest = Path(temp_dir) / "manifest.json"
            manifest.write_text(json.dumps({"version": 2, "items": []}), encoding="utf-8")

            with self.assertRaisesRegex(SystemExit, "version must be 1"):
                main(["--align-manifest", str(manifest), "-o", str(Path(temp_dir) / "output"), "--device", "cpu"])

    def test_rejects_boolean_manifest_version(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            manifest = Path(temp_dir) / "manifest.json"
            manifest.write_text(json.dumps({"version": True, "items": []}), encoding="utf-8")

            with (
                patch.dict(sys.modules, {"funasr": SimpleNamespace(AutoModel=Mock())}),
                self.assertRaisesRegex(SystemExit, "version must be 1"),
            ):
                main(["--align-manifest", str(manifest), "-o", str(Path(temp_dir) / "output"), "--device", "cpu"])

    def test_rejects_missing_manifest_audio(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            manifest = Path(temp_dir) / "manifest.json"
            manifest.write_text(
                json.dumps({"version": 1, "items": [{"id": "intro", "audio": "missing.wav", "text": "你好"}]}),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(SystemExit, "Audio file not found.*missing.wav"):
                main(["--align-manifest", str(manifest), "-o", str(Path(temp_dir) / "output"), "--device", "cpu"])

    def test_aligns_ordered_items_with_one_model(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            for name in ("first.wav", "second.wav"):
                (root / name).touch()
            manifest = root / "manifest.json"
            manifest.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "items": [
                            {"id": "first", "audio": "first.wav", "text": "你好"},
                            {"id": "second", "audio": "second.wav", "text": "世界"},
                        ],
                    }
                ),
                encoding="utf-8",
            )
            model = Mock()
            model.generate.side_effect = [
                [{"timestamp": [[0, 200], [200, 400]]}],
                [{"timestamp": [[100, 300], [300, 500]]}],
            ]
            auto_model = Mock(return_value=model)
            output = root / "aligned"

            with (
                patch.dict(sys.modules, {"funasr": SimpleNamespace(AutoModel=auto_model)}),
                patch("media_text.cli.convert_to_wav"),
                patch("media_text.cli.wav_duration", side_effect=[1.0, 1.0]),
            ):
                main(["--align-manifest", str(manifest), "-o", str(output), "--device", "cpu"])

            payload = json.loads(output.with_suffix(".json").read_text(encoding="utf-8"))
            self.assertEqual([item["id"] for item in payload["items"]], ["first", "second"])
            self.assertEqual([item["transcript"]["segments"][0]["text"] for item in payload["items"]], ["你好", "世界"])
            self.assertTrue(all(item["valid"] and item["issues"] == [] for item in payload["items"]))
            auto_model.assert_called_once_with(model="fa-zh", device="cpu")
            self.assertEqual(model.generate.call_count, 2)

    def test_reports_invalid_alignment_issues_per_item(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            ids = ["missing", "malformed", "failed", "count", "order", "range", "tail"]
            for item_id in ids:
                (root / f"{item_id}.wav").touch()
            manifest = root / "manifest.json"
            manifest.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "items": [
                            {"id": item_id, "audio": f"{item_id}.wav", "text": "你好"}
                            for item_id in ids
                        ],
                    }
                ),
                encoding="utf-8",
            )
            model = Mock()
            model.generate.side_effect = [
                [{}],
                [{"timestamp": [[0]]}],
                RuntimeError("mock alignment failure"),
                [{"timestamp": [[0, 200]]}],
                [{"timestamp": [[400, 600], [300, 800]]}],
                [{"timestamp": [[0, 500], [500, 1200]]}],
                [{"timestamp": [[0, 100], [100, 200]]}],
            ]
            output = root / "aligned"

            with (
                patch.dict(sys.modules, {"funasr": SimpleNamespace(AutoModel=Mock(return_value=model))}),
                patch("media_text.cli.convert_to_wav"),
                patch("media_text.cli.wav_duration", side_effect=[1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 2.0]),
            ):
                main(["--align-manifest", str(manifest), "-o", str(output), "--device", "cpu"])

            payload = json.loads(output.with_suffix(".json").read_text(encoding="utf-8"))
            self.assertEqual([item["id"] for item in payload["items"]], ids)
            self.assertEqual(
                {item["id"]: item["issues"] for item in payload["items"]},
                {
                    "missing": ["missing-timestamps"],
                    "malformed": ["missing-timestamps"],
                    "failed": ["missing-timestamps"],
                    "count": ["token-count-mismatch"],
                    "order": ["non-monotonic-timestamps"],
                    "range": ["timestamp-out-of-range"],
                    "tail": ["trailing-audio"],
                },
            )
            self.assertTrue(all(not item["valid"] for item in payload["items"]))


class MainDispatchTest(unittest.TestCase):
    def test_positional_asr_route_still_dispatches(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "audio.wav"
            source.touch()
            payload = {"segments": []}

            with (
                patch("media_text.cli.transcribe", return_value=payload) as transcribe,
                patch("media_text.cli.write_outputs") as write_outputs,
            ):
                main([str(source), "--device", "cpu"])

            transcribe.assert_called_once_with(source.resolve(), "cpu", "", 30000, None)
            write_outputs.assert_called_once_with(payload, source.with_suffix("").resolve())

    def test_positional_align_route_still_dispatches(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "audio.wav"
            text_path = Path(temp_dir) / "text.txt"
            source.touch()
            text_path.write_text("你好", encoding="utf-8")
            payload = {"segments": []}

            with (
                patch("media_text.cli.align", return_value=payload) as align,
                patch("media_text.cli.write_outputs") as write_outputs,
            ):
                main([str(source), "--align", str(text_path), "--device", "cpu"])

            align.assert_called_once_with(source.resolve(), "你好", "cpu", None)
            write_outputs.assert_called_once_with(payload, source.with_suffix("").resolve())


if __name__ == "__main__":
    unittest.main()
