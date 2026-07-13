"""FunASR CLI: convert audio/video to timestamped Chinese transcript JSON + TXT."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

# Punctuation that ends a segment when splitting raw FunASR character timestamps.
PUNCTUATION = set("，。！？!?、；;：:,.")
# Keep ASCII words as one piece (one timestamp) while splitting CJK per character.
TEXT_PIECES = re.compile(r"[A-Za-z0-9]+|.", re.DOTALL)


def split_timestamped_text(text: str, timestamps: list[list[int]]) -> list[dict]:
    """
    Split FunASR text + per-token timestamps into sentence-like segments.

    ASCII runs (e.g. ``model``) consume one timestamp; punctuation cuts a segment
    and is kept in the preceding text. Returns ``[]`` when token/timestamp counts
    disagree so callers can fall back to a single blob segment.
    """
    pieces = TEXT_PIECES.findall(text)
    # Timestamps only cover spoken tokens — ignore punctuation and whitespace.
    timestamped_pieces = [piece for piece in pieces if piece not in PUNCTUATION and not piece.isspace()]
    if len(timestamps) != len(timestamped_pieces):
        return []

    segments: list[dict] = []
    chars: list[str] = []
    char_timestamps: list[list[int]] = []
    timestamp_index = 0
    for piece in pieces:
        chars.append(piece)
        if piece not in PUNCTUATION and not piece.isspace():
            char_timestamps.append(timestamps[timestamp_index])
            timestamp_index += 1
        # Cut on punctuation once we have at least one timed token.
        if piece in PUNCTUATION and char_timestamps:
            segments.append(
                {
                    # FunASR timestamps are milliseconds.
                    "start": char_timestamps[0][0] / 1000,
                    "end": char_timestamps[-1][1] / 1000,
                    "text": "".join(chars).strip(),
                    "timestamp": char_timestamps,
                }
            )
            chars = []
            char_timestamps = []

    # Trailing text without a final punctuation mark.
    if char_timestamps:
        segments.append(
            {
                "start": char_timestamps[0][0] / 1000,
                "end": char_timestamps[-1][1] / 1000,
                "text": "".join(chars).strip(),
                "timestamp": char_timestamps,
            }
        )
    return segments


def choose_device(requested: str) -> str:
    """Resolve ``auto`` to cuda → mps → cpu; otherwise return the requested device string."""
    if requested != "auto":
        return requested

    import torch

    if torch.cuda.is_available():
        return "cuda:0"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def normalize_results(results: list[dict], duration: float) -> dict:
    """
    Normalize FunASR ``generate`` output into YumoFrame ``transcript.json`` shape.

    Prefers ``sentence_info`` when present; otherwise splits raw text with character
    timestamps, or falls back to one segment spanning the whole utterance.
    """
    segments: list[dict] = []
    for result in results:
        sentences = result.get("sentence_info") or []
        if sentences:
            for sentence in sentences:
                text = sentence.get("text", "").strip()
                if text:
                    segments.append(
                        {
                            "start": sentence.get("start", 0) / 1000,
                            "end": sentence.get("end", 0) / 1000,
                            "text": text,
                            "timestamp": sentence.get("timestamp", []),
                        }
                    )
            continue

        text = result.get("text", "").strip()
        if not text:
            continue
        timestamps = result.get("timestamp") or []
        # Prefer punctuation-based splits when token/timestamp counts match.
        timestamped_segments = split_timestamped_text(text, timestamps)
        if timestamped_segments:
            segments.extend(timestamped_segments)
            continue
        # Mismatch or no punctuation: keep one segment for the whole blob.
        segments.append(
            {
                "start": timestamps[0][0] / 1000 if timestamps else 0,
                "end": timestamps[-1][1] / 1000 if timestamps else duration,
                "text": text,
                "timestamp": timestamps,
            }
        )

    segments.sort(key=lambda segment: segment["start"])
    return {"engine": "funasr", "language": "zh", "duration": duration, "segments": segments}


def convert_to_wav(source: Path, output: Path) -> None:
    """Transcode any ffmpeg-readable media to mono 16 kHz PCM WAV for FunASR."""
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is required but was not found on PATH")
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-vn",  # drop video if the source is a container
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(output),
        ],
        check=True,
    )


def wav_duration(path: Path) -> float:
    """Return WAV duration in seconds from frame count / sample rate."""
    with wave.open(str(path), "rb") as audio:
        return audio.getnframes() / audio.getframerate()


def transcribe(source: Path, device: str, hotwords: str, max_segment_ms: int, model_name: str | None) -> dict:
    """
    Run Paraformer + VAD + punctuation on ``source`` and return a normalized transcript.

    Converts to a temporary WAV first so video containers work the same as audio files.
    """
    from funasr import AutoModel

    with tempfile.TemporaryDirectory(prefix="media-text-") as temp_dir:
        wav_path = Path(temp_dir) / "audio.wav"
        convert_to_wav(source, wav_path)
        duration = wav_duration(wav_path)
        model = AutoModel(
            model=model_name or "paraformer-zh",
            vad_model="fsmn-vad",
            punc_model="ct-punc",
            # Longer VAD windows reduce mid-phrase cuts for comedy-style delivery.
            vad_kwargs={"max_single_segment_time": max_segment_ms},
            device=device,
        )
        results = model.generate(
            input=str(wav_path),
            cache={},
            hotword=hotwords or None,
            batch_size_s=60,
            merge_vad=True,
            merge_length_s=15,
        )
        return normalize_results(results, duration)


def normalize_alignment(results: list[dict], text: str, duration: float) -> dict:
    """
    Normalize forced-alignment output into ``transcript.json`` shape.

    The FA model returns per-token ``[startMs, endMs]`` pairs for the GIVEN ``text``
    (no recognition), so text is authoritative. Reuses the ASR punctuation splitter;
    falls back to a single segment when token/timestamp counts disagree.
    """
    result = results[0] if results else {}
    # NOTE: verify the FA output field against your FunASR version — some return
    # "timestamp", others nest it differently. Adjust this one lookup if needed.
    timestamps = result.get("timestamp") or []
    segments = split_timestamped_text(text, timestamps)
    if not segments:
        segments = [
            {
                "start": timestamps[0][0] / 1000 if timestamps else 0,
                "end": timestamps[-1][1] / 1000 if timestamps else duration,
                "text": text.strip(),
                "timestamp": timestamps,
            }
        ]
    segments.sort(key=lambda segment: segment["start"])
    return {"engine": "funasr-fa", "language": "zh", "duration": duration, "segments": segments}


def align(source: Path, text: str, device: str, model_name: str | None) -> dict:
    """
    Force-align known ``text`` to ``source`` audio: assign timestamps without recognizing text.

    Uses a FunASR forced-alignment model (default ``fa-zh``); text stays authoritative,
    so the source and output text never diverge (unlike an ASR round-trip).
    """
    from funasr import AutoModel

    with tempfile.TemporaryDirectory(prefix="media-text-fa-") as temp_dir:
        wav_path = Path(temp_dir) / "audio.wav"
        convert_to_wav(source, wav_path)
        duration = wav_duration(wav_path)
        model = AutoModel(model=model_name or "fa-zh", device=device)
        # data_type marks the tuple as (audio, text); adjust if your FunASR version differs.
        results = model.generate(input=(str(wav_path), text), data_type=("sound", "text"))
        return normalize_alignment(results, text, duration)


def write_outputs(payload: dict, output: Path) -> None:
    """Write ``<output>.json`` (machine) and ``<output>.txt`` (clocked review lines)."""
    output.parent.mkdir(parents=True, exist_ok=True)
    output.with_suffix(".json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    lines = [
        f'[{segment["start"]:07.2f}-{segment["end"]:07.2f}] {segment["text"]}'
        for segment in payload["segments"]
    ]
    output.with_suffix(".txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    """Build the ``media-text`` / FunASR CLI argument parser."""
    parser = argparse.ArgumentParser(description="Extract timestamped Chinese text from audio or video with FunASR.")
    parser.add_argument("input", type=Path)
    parser.add_argument("-o", "--output", type=Path, help="Output basename; defaults beside the input file.")
    parser.add_argument("--device", choices=["auto", "cpu", "mps", "cuda:0"], default="auto")
    parser.add_argument("--hotwords", default="", help='FunASR hotwords, for example: "复读 20 班主任 20"')
    parser.add_argument("--max-segment-ms", type=int, default=30000)
    parser.add_argument("--model", default=None, help="Override the model (ASR default paraformer-zh; align default fa-zh).")
    parser.add_argument("--align", type=Path, default=None, help="Forced-align mode: path to a text file to align against the audio.")
    return parser


def main(argv: list[str] | None = None) -> None:
    """Parse CLI args, transcribe, and write JSON/TXT next to the chosen output basename."""
    args = build_parser().parse_args(argv)
    source = args.input.expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"Input file not found: {source}")
    # Basename without extension: writes both .json and .txt beside it.
    output = (args.output or source.with_suffix("")).expanduser().resolve()
    device = choose_device(args.device)
    if args.align:
        text = args.align.expanduser().read_text(encoding="utf-8").strip()
        if not text:
            raise SystemExit(f"Align text file is empty: {args.align}")
        print(f"Force-aligning {source.name} to given text on {device}")
        payload = align(source, text, device, args.model)
    else:
        print(f"Transcribing {source.name} with {args.model or 'Paraformer-Large'} on {device}")
        payload = transcribe(source, device, args.hotwords, args.max_segment_ms, args.model)
    write_outputs(payload, output)
    print(f"Wrote {output.with_suffix('.json')} and {output.with_suffix('.txt')}")
