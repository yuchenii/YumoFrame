/**
 * Kinetic text block: per-character reveal, line layout, and cursor.
 */

import { useCurrentFrame, useVideoConfig } from "remotion";
import { getElementMotion } from "../lib/animations";
import {
  getLineChars,
  getStableTextLayout,
  getTextBlockBaseStyle,
  resolveLineFontSize,
  resolveLineFontWeight,
} from "../lib/layout";
import { getVisibleChars, isElementActive } from "../lib/timing";
import type { KineticTextElement, YumoFrameProject } from "../types";
import { CursorBlock } from "./CursorBlock";

type KineticTextBlockProps = {
  /** Positioned kinetic-text element to render. */
  element: KineticTextElement;
  /** Current playback time in seconds. */
  time: number;
  /** Project theme colors and font. */
  theme: YumoFrameProject["theme"];
};

/**
 * Renders a kinetic-text element with timed character reveal and cursor.
 * @param props.element - Layout and line timing for the block
 * @param props.time - Current playback time in seconds
 * @param props.theme - Colors and font family from the project
 */
export function KineticTextBlock({ element, time, theme }: KineticTextBlockProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const layout = getStableTextLayout(element);
  const visibleChars = getVisibleChars(element, time);
  // Cursor rides the newest revealed character (not the line end).
  const lastVisible = visibleChars.at(-1);
  const active = isElementActive(element, time);

  return (
    <div
      style={{
        ...getTextBlockBaseStyle(element),
        ...getElementMotion(element, time, frame, fps),
        color: theme.textColor,
        fontFamily: theme.fontFamily,
        letterSpacing: 0,
        whiteSpace: "nowrap",
        filter: active ? "drop-shadow(0 8px 18px rgba(0,0,0,0.45))" : "none",
      }}
    >
      {layout.lines.map((line, lineIndex) => {
        const chars = getLineChars(line, lineIndex);
        const isCursorLine = active && lastVisible?.lineIndex === lineIndex;
        const fontSize = resolveLineFontSize(line, element.fontSize);
        const fontWeight = resolveLineFontWeight(line);
        const metrics = layout.lineMetrics[lineIndex];

        return (
          <div
            key={`${element.id}-line-${lineIndex}`}
            style={{
              height: metrics.height,
              fontSize,
              fontWeight,
              lineHeight: element.lineHeight,
            }}
          >
            {chars.map((item) => {
              // Hide future chars via visibility so layout width stays stable.
              const visible = time >= item.start;
              const isCursorChar =
                isCursorLine &&
                lastVisible?.lineIndex === lineIndex &&
                lastVisible.charIndex === item.charIndex;

              return (
                <span
                  key={`${element.id}-${lineIndex}-${item.charIndex}`}
                  style={{
                    position: "relative",
                    color: item.highlight ? theme.highlightColor : theme.textColor,
                    visibility: visible ? "visible" : "hidden",
                  }}
                >
                  {item.char}
                  {isCursorChar ? (
                    <CursorBlock
                      color={theme.cursorColor}
                      dimColor={theme.dimCursorColor}
                      time={time}
                    />
                  ) : null}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
