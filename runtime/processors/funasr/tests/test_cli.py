"""Unit tests for FunASR transcript normalization helpers."""

import unittest

from media_text.cli import normalize_results, split_timestamped_text


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


if __name__ == "__main__":
    unittest.main()
