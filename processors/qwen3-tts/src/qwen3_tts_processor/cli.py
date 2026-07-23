"""Qwen3-TTS CLI: generate CustomVoice, VoiceDesign, or cloned WAV speech."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path, PureWindowsPath
from typing import Any, Callable

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

DEFAULT_MODEL = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"
DEFAULT_LANGUAGE = "Chinese"
DEFAULT_SPEAKER = "Vivian"
DEFAULT_MEMORY_FRACTION = 0.8
MODEL_SOURCES = ("modelscope", "huggingface")


def choose_device(requested: str) -> str:
    """Resolve ``auto`` to cuda → mps → cpu; preserve an explicit device."""
    if requested != "auto":
        return requested

    import torch

    if torch.cuda.is_available():
        return "cuda:0"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def model_variant(model_name: str) -> str:
    """Return the generation API selected by an official ID or cache path."""
    for suffix, variant in (
        ("-CustomVoice", "custom_voice"),
        ("-VoiceDesign", "voice_design"),
        ("-Base", "voice_clone"),
    ):
        if suffix in model_name:
            return variant
    raise ValueError(f"Unsupported Qwen3-TTS model variant: {model_name}")


def _modelscope_snapshot(model_name: str, *, local_files_only: bool) -> str:
    from modelscope import snapshot_download

    return snapshot_download(model_name, local_files_only=local_files_only)


def _huggingface_snapshot(model_name: str, *, local_files_only: bool) -> str:
    from huggingface_hub import snapshot_download

    return snapshot_download(model_name, local_files_only=local_files_only)


def _complete_snapshot(path: str) -> bool:
    root = Path(path)
    required = (
        "config.json",
        "model.safetensors",
        "tokenizer_config.json",
        "vocab.json",
        "merges.txt",
        "preprocessor_config.json",
        "speech_tokenizer/config.json",
        "speech_tokenizer/model.safetensors",
        "speech_tokenizer/preprocessor_config.json",
    )
    return all((root / name).is_file() for name in required)


def _is_local_model_path(value: str) -> bool:
    return (
        Path(value).is_absolute()
        or PureWindowsPath(value).is_absolute()
        or value.startswith(("~/", "~\\", "./", ".\\", "../", "..\\"))
    )


def resolve_model_path(
    model_name: str,
    model_source: str = "modelscope",
) -> str:
    """Reuse a complete cache or resume a download from the configured source."""
    if _is_local_model_path(model_name):
        local_path = Path(model_name).expanduser()
        if not local_path.exists():
            raise FileNotFoundError(f"Local model path not found: {local_path}")
        return str(local_path.resolve())
    if model_source not in MODEL_SOURCES:
        raise ValueError(f"Unsupported model source: {model_source}")

    downloaders = {
        "modelscope": _modelscope_snapshot,
        "huggingface": _huggingface_snapshot,
    }
    downloader = downloaders[model_source]
    try:
        cached = downloader(model_name, local_files_only=True)
        if _complete_snapshot(cached):
            return cached
    except Exception:
        pass
    return downloader(model_name, local_files_only=False)


def _set_device_memory_limit(torch: Any, device: str, memory_fraction: float) -> None:
    if not 0 < memory_fraction <= 1:
        raise ValueError("memory fraction must be greater than 0 and at most 1")
    if device.startswith("cuda"):
        torch.cuda.set_per_process_memory_fraction(memory_fraction, device)
    elif device.startswith("mps"):
        torch.mps.set_per_process_memory_fraction(memory_fraction)


def load_model(
    model_name: str,
    device: str,
    model_source: str = "modelscope",
    memory_fraction: float = DEFAULT_MEMORY_FRACTION,
) -> Any:
    """Load one Qwen model on the resolved device."""
    import torch
    from qwen_tts import Qwen3TTSModel

    resolved_device = choose_device(device)
    _set_device_memory_limit(torch, resolved_device, memory_fraction)
    return Qwen3TTSModel.from_pretrained(
        resolve_model_path(model_name, model_source),
        device_map=resolved_device,
        dtype=torch.bfloat16 if resolved_device.startswith("cuda") else torch.float32,
    )


def synthesize(
    text: str,
    output: Path,
    *,
    model_name: str = DEFAULT_MODEL,
    language: str = DEFAULT_LANGUAGE,
    speaker: str = DEFAULT_SPEAKER,
    device: str = "auto",
    model_source: str = "modelscope",
    memory_fraction: float = DEFAULT_MEMORY_FRACTION,
    instruct: str = "",
    ref_audio: str | None = None,
    ref_text: str | None = None,
    model: Any | None = None,
    writer: Callable[[str, Any, int], None] | None = None,
) -> None:
    """Generate one WAV file, with injectable model/writer for download-free tests."""
    if output.suffix.lower() != ".wav":
        raise ValueError("Qwen3-TTS output must use the .wav extension")
    variant = model_variant(model_name)
    if variant == "voice_design" and not instruct:
        raise ValueError("VoiceDesign requires --instruct")
    if variant == "voice_clone" and not ref_audio:
        raise ValueError("Base voice cloning requires --ref-audio")
    output.parent.mkdir(parents=True, exist_ok=True)

    if model is None:
        model = load_model(model_name, device, model_source, memory_fraction)

    if variant == "custom_voice":
        wavs, sample_rate = model.generate_custom_voice(
            text=text,
            language=language,
            speaker=speaker,
            instruct=instruct,
        )
    elif variant == "voice_design":
        wavs, sample_rate = model.generate_voice_design(
            text=text,
            language=language,
            instruct=instruct,
        )
    else:
        clone_options = {"text": text, "language": language, "ref_audio": ref_audio}
        if ref_text:
            clone_options["ref_text"] = ref_text
        else:
            clone_options["x_vector_only_mode"] = True
        wavs, sample_rate = model.generate_voice_clone(**clone_options)
    if not wavs:
        raise RuntimeError("Qwen3-TTS returned no audio")
    if writer is None:
        import soundfile as sf

        writer = sf.write
    writer(str(output), wavs[0], sample_rate)


def synthesize_plan(
    plan_path: Path,
    output_dir: Path,
    *,
    model_name: str = DEFAULT_MODEL,
    language: str = DEFAULT_LANGUAGE,
    speaker: str = DEFAULT_SPEAKER,
    device: str = "auto",
    model_source: str = "modelscope",
    memory_fraction: float = DEFAULT_MEMORY_FRACTION,
    ref_audio: str | None = None,
    ref_text: str | None = None,
    model: Any | None = None,
    writer: Callable[[str, Any, int], None] | None = None,
) -> list[Path]:
    """Generate speech-plan segments sequentially while loading the model once."""
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    segments = plan.get("segments") if isinstance(plan, dict) else None
    if not isinstance(segments, list) or not segments:
        raise ValueError("speech plan must contain a non-empty segments array")
    texts = []
    instructions = []
    variant = model_variant(model_name)
    voice_description = None
    if variant == "voice_design":
        voice = plan.get("voice")
        voice_description = voice.get("description") if isinstance(voice, dict) else None
        if not isinstance(voice_description, str) or not voice_description:
            raise ValueError("VoiceDesign speech plans require voice.description")
    expected_control = {
        "custom_voice": "qwen-instruct",
        "voice_design": "qwen-voice-design",
        "voice_clone": "none",
    }[variant]
    for index, raw_segment in enumerate(segments):
        if (
            not isinstance(raw_segment, dict)
            or not isinstance(raw_segment.get("text"), str)
            or not raw_segment["text"]
        ):
            raise ValueError(f"speech plan segment {index} needs non-empty text")
        control = raw_segment.get("control")
        if not isinstance(control, dict) or control.get("type") != expected_control:
            raise ValueError(f"speech plan segment {index} must use {expected_control}")
        texts.append(raw_segment["text"])
        if variant != "voice_clone":
            instruct = control.get("instruct")
            if not isinstance(instruct, str) or not instruct:
                raise ValueError(f"speech plan segment {index} needs a non-empty instruct")
            instructions.append(
                f"{voice_description}\n{instruct}" if voice_description else instruct
            )

    if variant == "voice_clone" and not ref_audio:
        raise ValueError("Base voice cloning requires --ref-audio")
    if model is None:
        model = load_model(model_name, device, model_source, memory_fraction)
    prompt = None
    if variant == "voice_clone":
        prompt = model.create_voice_clone_prompt(
            ref_audio=ref_audio,
            ref_text=ref_text,
            x_vector_only_mode=not bool(ref_text),
        )
    if writer is None:
        import soundfile as sf

        writer = sf.write
    output_dir.mkdir(parents=True, exist_ok=True)
    outputs = []
    for index, text in enumerate(texts):
        if variant == "custom_voice":
            wavs, sample_rate = model.generate_custom_voice(
                text=text,
                language=language,
                speaker=speaker,
                instruct=instructions[index],
            )
        elif variant == "voice_design":
            wavs, sample_rate = model.generate_voice_design(
                text=text,
                language=language,
                instruct=instructions[index],
            )
        else:
            wavs, sample_rate = model.generate_voice_clone(
                text=text,
                language=language,
                voice_clone_prompt=prompt,
            )
        if len(wavs) != 1:
            raise RuntimeError(f"Qwen3-TTS returned {len(wavs)} waveforms for segment {index}")
        output = output_dir / f"{index:04d}.wav"
        writer(str(output), wavs[0], sample_rate)
        outputs.append(output)
        del wavs
    return outputs


def build_parser() -> argparse.ArgumentParser:
    """Build the ``qwen3-tts`` command parser."""
    parser = argparse.ArgumentParser(description="Synthesize a WAV voice track with Qwen3-TTS.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--text")
    source.add_argument("--plan", type=Path)
    parser.add_argument("-o", "--output", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--language", default=DEFAULT_LANGUAGE)
    parser.add_argument("--speaker", default=DEFAULT_SPEAKER)
    parser.add_argument("--device", default="auto")
    parser.add_argument(
        "--memory-fraction",
        type=float,
        default=DEFAULT_MEMORY_FRACTION,
        help="Maximum MPS/CUDA allocator fraction; CPU plans are bounded by sequential generation.",
    )
    parser.add_argument("--model-source", choices=MODEL_SOURCES, default="modelscope")
    parser.add_argument("--instruct", default="")
    parser.add_argument("--ref-audio", default=None, help="Base model reference audio path or URL.")
    parser.add_argument(
        "--ref-text",
        default=None,
        help="Transcript of the reference audio; recommended for clone quality.",
    )
    return parser


def main() -> None:
    """Run Qwen3-TTS from parsed CLI arguments."""
    args = build_parser().parse_args()
    if args.plan:
        if not args.output_dir or args.output:
            raise SystemExit("--plan requires --output-dir and cannot use --output")
        synthesize_plan(
            args.plan,
            args.output_dir,
            model_name=args.model,
            language=args.language,
            speaker=args.speaker,
            device=args.device,
            model_source=args.model_source,
            memory_fraction=args.memory_fraction,
            ref_audio=args.ref_audio,
            ref_text=args.ref_text,
        )
    else:
        if not args.output or args.output_dir:
            raise SystemExit("--text requires --output and cannot use --output-dir")
        synthesize(
            args.text,
            args.output,
            model_name=args.model,
            language=args.language,
            speaker=args.speaker,
            device=args.device,
            model_source=args.model_source,
            memory_fraction=args.memory_fraction,
            instruct=args.instruct,
            ref_audio=args.ref_audio,
            ref_text=args.ref_text,
        )


if __name__ == "__main__":
    main()
