"""Unit tests for the Qwen3-TTS processor without model downloads."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from qwen3_tts_processor.cli import (
    DEFAULT_MEMORY_FRACTION,
    DEFAULT_MODEL,
    _set_device_memory_limit,
    _complete_snapshot,
    _is_local_model_path,
    build_parser,
    choose_device,
    model_variant,
    resolve_model_path,
    synthesize,
    synthesize_plan,
)


class FakeModel:
    def __init__(self):
        self.calls = []

    @staticmethod
    def _wavs(kwargs):
        count = len(kwargs["text"]) if isinstance(kwargs["text"], list) else 1
        return [[0.0, 0.5, -0.5] for _ in range(count)], 24000

    def generate_custom_voice(self, **kwargs):
        self.call = ("custom_voice", kwargs)
        self.calls.append(self.call)
        return self._wavs(kwargs)

    def generate_voice_design(self, **kwargs):
        self.call = ("voice_design", kwargs)
        self.calls.append(self.call)
        return self._wavs(kwargs)

    def generate_voice_clone(self, **kwargs):
        self.call = ("voice_clone", kwargs)
        self.calls.append(self.call)
        return self._wavs(kwargs)

    def create_voice_clone_prompt(self, **kwargs):
        self.prompt_call = kwargs
        return {"prompt": True}


class Qwen3TtsCliTest(unittest.TestCase):
    def test_accelerator_memory_fraction_is_limited_before_model_loading(self) -> None:
        torch = Mock()

        _set_device_memory_limit(torch, "cuda:0", 0.7)
        torch.cuda.set_per_process_memory_fraction.assert_called_once_with(0.7, "cuda:0")
        _set_device_memory_limit(torch, "mps", 0.8)
        torch.mps.set_per_process_memory_fraction.assert_called_once_with(0.8)
        _set_device_memory_limit(torch, "cpu", 0.9)
        with self.assertRaisesRegex(ValueError, "greater than 0"):
            _set_device_memory_limit(torch, "cpu", 0)

    def test_only_explicit_filesystem_syntax_is_a_local_model_path(self) -> None:
        self.assertFalse(_is_local_model_path(DEFAULT_MODEL))
        self.assertFalse(_is_local_model_path(r"C:models\qwen"))
        for path in (
            "/models/qwen",
            "~/models/qwen",
            "./models/qwen",
            "../models/qwen",
            r"C:\models\qwen",
            r"\\server\share\qwen",
            r".\models\qwen",
            r"..\models\qwen",
        ):
            self.assertTrue(_is_local_model_path(path), path)

    @patch("qwen3_tts_processor.cli._modelscope_snapshot")
    def test_missing_explicit_local_path_does_not_fall_through_to_hub(self, modelscope) -> None:
        with self.assertRaisesRegex(FileNotFoundError, "Local model path not found"):
            resolve_model_path("./missing-model")
        modelscope.assert_not_called()

    def test_model_variant_accepts_hugging_face_cache_paths(self) -> None:
        self.assertEqual(
            model_variant("/models/Qwen--Qwen3-TTS-12Hz-0.6B-CustomVoice/snapshots/main"),
            "custom_voice",
        )

    def test_defaults_and_generation(self) -> None:
        args = build_parser().parse_args(["--text", "你好", "--output", "voice.wav"])
        self.assertEqual(args.model, DEFAULT_MODEL)
        self.assertEqual(args.speaker, "Vivian")
        self.assertEqual(args.language, "Chinese")
        self.assertEqual(args.model_source, "modelscope")
        self.assertEqual(args.memory_fraction, DEFAULT_MEMORY_FRACTION)
        self.assertEqual(choose_device("cpu"), "cpu")

        model = FakeModel()
        writes = []
        synthesize(
            args.text,
            Path(args.output),
            model=model,
            writer=lambda *values: writes.append(values),
        )
        self.assertEqual(model.call[0], "custom_voice")
        self.assertEqual(model.call[1]["speaker"], "Vivian")
        self.assertEqual(writes, [("voice.wav", [0.0, 0.5, -0.5], 24000)])

    def test_incomplete_snapshot_is_not_reused(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "config.json").write_text("{}", encoding="utf-8")
            (root / "model.safetensors.incomplete").touch()

            self.assertFalse(_complete_snapshot(str(root)))

    @patch("qwen3_tts_processor.cli._complete_snapshot", return_value=True)
    @patch("qwen3_tts_processor.cli._modelscope_snapshot")
    def test_model_resolution_reuses_complete_modelscope_cache(self, modelscope, _complete) -> None:
        modelscope.return_value = "/modelscope/model"

        self.assertEqual(resolve_model_path(DEFAULT_MODEL), "/modelscope/model")
        modelscope.assert_called_once_with(DEFAULT_MODEL, local_files_only=True)

    @patch("qwen3_tts_processor.cli._complete_snapshot", return_value=False)
    @patch("qwen3_tts_processor.cli._modelscope_snapshot")
    def test_partial_cache_resumes_from_same_source(self, modelscope, _complete) -> None:
        modelscope.side_effect = ["/modelscope/partial", "/modelscope/complete"]

        self.assertEqual(resolve_model_path(DEFAULT_MODEL), "/modelscope/complete")
        self.assertEqual(modelscope.call_args_list[0].kwargs, {"local_files_only": True})
        self.assertEqual(modelscope.call_args_list[1].kwargs, {"local_files_only": False})

    @patch("qwen3_tts_processor.cli._huggingface_snapshot")
    @patch("qwen3_tts_processor.cli._modelscope_snapshot")
    def test_download_error_does_not_switch_sources(self, modelscope, huggingface) -> None:
        modelscope.side_effect = [
            RuntimeError("cache miss"),
            ConnectionError("offline"),
        ]
        huggingface.side_effect = RuntimeError("cache miss")

        with self.assertRaisesRegex(ConnectionError, "offline"):
            resolve_model_path(DEFAULT_MODEL)
        huggingface.assert_not_called()

    @patch("qwen3_tts_processor.cli._huggingface_snapshot")
    @patch("qwen3_tts_processor.cli._modelscope_snapshot")
    def test_explicit_huggingface_source_does_not_probe_modelscope(
        self, modelscope, huggingface
    ) -> None:
        huggingface.side_effect = [RuntimeError("cache miss"), "/huggingface/model"]

        self.assertEqual(
            resolve_model_path(DEFAULT_MODEL, model_source="huggingface"),
            "/huggingface/model",
        )
        modelscope.assert_not_called()

    def test_dispatches_1_7b_voice_design(self) -> None:
        model = FakeModel()
        synthesize(
            "你好",
            Path("voice.wav"),
            model_name="Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
            instruct="清晰自然的普通话女声",
            model=model,
            writer=lambda *_: None,
        )
        self.assertEqual(model.call[0], "voice_design")
        self.assertEqual(model.call[1]["instruct"], "清晰自然的普通话女声")

    def test_dispatches_1_7b_base_voice_clone(self) -> None:
        model = FakeModel()
        synthesize(
            "你好",
            Path("voice.wav"),
            model_name="Qwen/Qwen3-TTS-12Hz-1.7B-Base",
            ref_audio="assets/reference.wav",
            ref_text="参考音频里的文字",
            model=model,
            writer=lambda *_: None,
        )
        self.assertEqual(model.call[0], "voice_clone")
        self.assertEqual(model.call[1]["ref_audio"], "assets/reference.wav")
        self.assertEqual(model.call[1]["ref_text"], "参考音频里的文字")

    def test_variant_requirements_are_explicit(self) -> None:
        with self.assertRaisesRegex(ValueError, "instruct"):
            synthesize(
                "你好",
                Path("voice.wav"),
                model_name="Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
                model=FakeModel(),
                writer=lambda *_: None,
            )
        with self.assertRaisesRegex(ValueError, "ref-audio"):
            synthesize(
                "你好",
                Path("voice.wav"),
                model_name="Qwen/Qwen3-TTS-12Hz-1.7B-Base",
                model=FakeModel(),
                writer=lambda *_: None,
            )

    def test_rejects_non_wav_output(self) -> None:
        with self.assertRaisesRegex(ValueError, r"\.wav"):
            synthesize("你好", Path("voice.mp3"), model=FakeModel(), writer=lambda *_: None)

    def test_plan_generates_segments_sequentially_with_per_item_instructions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan = root / "speech.json"
            plan.write_text(
                json.dumps(
                    {
                        "segments": [
                            {
                                "text": "第一句。",
                                "control": {
                                    "type": "qwen-instruct",
                                    "instruct": "平静",
                                },
                            },
                            {
                                "text": "第二句！",
                                "control": {
                                    "type": "qwen-instruct",
                                    "instruct": "惊讶",
                                },
                            },
                        ]
                    }
                ),
                encoding="utf-8",
            )
            model = FakeModel()
            writes = []
            outputs = synthesize_plan(
                plan,
                root / "parts",
                model=model,
                writer=lambda *values: writes.append(values),
            )

            self.assertEqual(
                [(kind, kwargs["text"], kwargs["instruct"]) for kind, kwargs in model.calls],
                [
                    ("custom_voice", "第一句。", "平静"),
                    ("custom_voice", "第二句！", "惊讶"),
                ],
            )
            self.assertEqual([path.name for path in outputs], ["0000.wav", "0001.wav"])
            self.assertEqual([Path(values[0]).name for values in writes], ["0000.wav", "0001.wav"])

    def test_voice_design_plan_reuses_one_stable_voice_description(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan = root / "speech.json"
            plan.write_text(
                json.dumps(
                    {
                        "voice": {"description": "清晰自然的普通话年轻女声"},
                        "segments": [
                            {
                                "text": "第一句。",
                                "control": {
                                    "type": "qwen-voice-design",
                                    "instruct": "语气平静",
                                },
                            },
                            {
                                "text": "第二句！",
                                "control": {
                                    "type": "qwen-voice-design",
                                    "instruct": "结尾惊讶",
                                },
                            },
                        ],
                    }
                ),
                encoding="utf-8",
            )
            model = FakeModel()
            synthesize_plan(
                plan,
                root / "parts",
                model_name="Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
                model=model,
                writer=lambda *_: None,
            )

            self.assertEqual(
                [kwargs["instruct"] for _, kwargs in model.calls],
                [
                    "清晰自然的普通话年轻女声\n语气平静",
                    "清晰自然的普通话年轻女声\n结尾惊讶",
                ],
            )

    def test_base_plan_reuses_clone_prompt_across_sequential_calls(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan = root / "speech.json"
            plan.write_text(
                json.dumps(
                    {
                        "segments": [
                            {"text": "第一句。", "control": {"type": "none"}},
                            {"text": "第二句。", "control": {"type": "none"}},
                        ]
                    }
                ),
                encoding="utf-8",
            )
            model = FakeModel()
            synthesize_plan(
                plan,
                root / "parts",
                model_name="Qwen/Qwen3-TTS-12Hz-1.7B-Base",
                ref_audio="reference.wav",
                ref_text="参考文本",
                model=model,
                writer=lambda *_: None,
            )

            self.assertEqual(model.prompt_call["ref_audio"], "reference.wav")
            self.assertEqual(
                [kwargs["text"] for _, kwargs in model.calls], ["第一句。", "第二句。"]
            )
            self.assertTrue(
                all(kwargs["voice_clone_prompt"] == {"prompt": True} for _, kwargs in model.calls)
            )


if __name__ == "__main__":
    unittest.main()
