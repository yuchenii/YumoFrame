/**
 * Scene and character timing helpers for kinetic-text playback.
 */

import type { KineticTextElement, Scene, TextLine } from "../types";
import { getElementChars } from "./layout";

/**
 * Active scene at `time`, or the last finished scene if past all ranges.
 * @param scenes - Timeline scenes in order
 * @param time - Playback time in seconds
 */
export function findActiveScene(scenes: Scene[], time: number) {
  const activeScene = scenes.find((scene) => time >= scene.start && time < scene.end);

  if (activeScene) {
    return activeScene;
  }

  // Past the last end → keep the last finished scene (for end-overview camera).
  for (let index = scenes.length - 1; index >= 0; index -= 1) {
    if (time >= scenes[index].end) {
      return scenes[index];
    }
  }

  return scenes[0];
}

/** Start time of the first line, or 0 if empty. */
export function getFirstLineStart(lines: TextLine[]) {
  return lines[0]?.start ?? 0;
}

/** End time of the last line, or 0 if empty. */
export function getLastLineEnd(lines: TextLine[]) {
  return lines.at(-1)?.end ?? 0;
}

/**
 * Whether the element is in its active window (first line through last + hold).
 * @param element - Kinetic-text element
 * @param time - Playback time in seconds
 */
export function isElementActive(element: KineticTextElement, time: number) {
  const first = getFirstLineStart(element.lines);
  // Extra 0.35s hold after the last line so the cursor doesn't vanish mid-beat.
  return time >= first && time <= getLastLineEnd(element.lines) + 0.35;
}

/**
 * Characters whose reveal start time is at or before `time`.
 * @param element - Kinetic-text element
 * @param time - Playback time in seconds
 */
export function getVisibleChars(element: KineticTextElement, time: number) {
  return getElementChars(element).filter((item) => time >= item.start);
}
