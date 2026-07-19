"""Unit tests for the Qwen3-TTS processor without model downloads."""

import json
import tempfile
import unittest
from pathlib import Path

from qwen3_tts_processor.cli import DEFAULT_MODEL, build_parser, choose_device, model_variant, synthesize, synthesize_plan


class FakeModel:
    @staticmethod
    def _wavs(kwargs):
        count = len(kwargs["text"]) if isinstance(kwargs["text"], list) else 1
        return [[0.0, 0.5, -0.5] for _ in range(count)], 24000

    def generate_custom_voice(self, **kwargs):
        self.call = ("custom_voice", kwargs)
        return self._wavs(kwargs)

    def generate_voice_design(self, **kwargs):
        self.call = ("voice_design", kwargs)
        return self._wavs(kwargs)

    def generate_voice_clone(self, **kwargs):
        self.call = ("voice_clone", kwargs)
        return self._wavs(kwargs)

    def create_voice_clone_prompt(self, **kwargs):
        self.prompt_call = kwargs
        return {"prompt": True}


class Qwen3TtsCliTest(unittest.TestCase):
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
        self.assertEqual(choose_device("cpu"), "cpu")

        model = FakeModel()
        writes = []
        synthesize(args.text, Path(args.output), model=model, writer=lambda *values: writes.append(values))
        self.assertEqual(model.call[0], "custom_voice")
        self.assertEqual(model.call[1]["speaker"], "Vivian")
        self.assertEqual(writes, [("voice.wav", [0.0, 0.5, -0.5], 24000)])

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

    def test_plan_batches_segments_with_per_item_instructions(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan = root / "speech.json"
            plan.write_text(json.dumps({"segments": [
                {"text": "第一句。", "control": {"type": "qwen-instruct", "instruct": "平静"}},
                {"text": "第二句！", "control": {"type": "qwen-instruct", "instruct": "惊讶"}},
            ]}), encoding="utf-8")
            model = FakeModel()
            writes = []
            outputs = synthesize_plan(plan, root / "parts", model=model, writer=lambda *values: writes.append(values))

            self.assertEqual(model.call[0], "custom_voice")
            self.assertEqual(model.call[1]["text"], ["第一句。", "第二句！"])
            self.assertEqual(model.call[1]["instruct"], ["平静", "惊讶"])
            self.assertEqual([path.name for path in outputs], ["0000.wav", "0001.wav"])
            self.assertEqual([Path(values[0]).name for values in writes], ["0000.wav", "0001.wav"])

    def test_voice_design_plan_reuses_one_stable_voice_description(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            plan = root / "speech.json"
            plan.write_text(json.dumps({
                "voice": {"description": "清晰自然的普通话年轻女声"},
                "segments": [
                    {"text": "第一句。", "control": {"type": "qwen-voice-design", "instruct": "语气平静"}},
                    {"text": "第二句！", "control": {"type": "qwen-voice-design", "instruct": "结尾惊讶"}},
                ],
            }), encoding="utf-8")
            model = FakeModel()
            synthesize_plan(
                plan,
                root / "parts",
                model_name="Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
                model=model,
                writer=lambda *_: None,
            )

            self.assertEqual(model.call[1]["instruct"], [
                "清晰自然的普通话年轻女声\n语气平静",
                "清晰自然的普通话年轻女声\n结尾惊讶",
            ])


if __name__ == "__main__":
    unittest.main()
