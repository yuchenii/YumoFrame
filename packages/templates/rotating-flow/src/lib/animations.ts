/**
 * Entry pop-scale motion for kinetic-text elements.
 */

import { spring } from "remotion";
import type { KineticTextElement } from "../types";
import { getFirstLineStart } from "./timing";

/**
 * Opacity and scale transform for an element's entrance spring.
 * @param element - Kinetic-text element
 * @param time - Playback time in seconds
 * @param frame - Current frame
 * @param fps - Composition FPS
 */
export function getElementMotion(
  element: KineticTextElement,
  time: number,
  frame: number,
  fps: number,
) {
  const start = getFirstLineStart(element.lines);
  // Spring starts at first-line frame so entry lines up with reveal.
  const pop = spring({
    frame: Math.max(0, frame - start * fps),
    fps,
    config: { damping: 20, stiffness: 130, mass: 0.65 },
  });
  // pop 0→1: begin ~12% oversized, settle to 1.
  const entryScale = 1 + (1 - pop) * 0.12;

  return {
    opacity: time < start ? 0 : 1,
    transform: `rotate(${element.rotate}deg) scale(${element.scale * entryScale})`,
  };
}
