/**
 * Text measurement, per-character timing, and block layout for kinetic text.
 */

import type { CSSProperties } from 'react';
import type { KineticTextElement, LineChar, TextLine } from '../types';
import { layoutWithLines, prepareWithSegments } from '@chenglou/pretext';

/** Concatenate segment text for a line. */
export function getLineText(line: TextLine) {
  return line.segments.map((segment) => segment.text).join('');
}

/** Cap per-character reveal so long line windows don't crawl. Leftover time is hold. */
export const MAX_CHAR_DURATION_SECONDS = 0.18;

/**
 * Visual width units: ASCII ≈ 0.5, other code points ≈ 1.
 * @param text - Plain text (punctuation usually stripped upstream)
 */
export function characterUnits(text: string) {
  // Half-width ASCII vs full-width CJK so short Chinese lines size up more.
  return [...text].reduce((sum, char) => sum + (char.charCodeAt(0) < 256 ? 0.5 : 1), 0);
}

/** Light auto size vs element base; explicit line.fontSize wins. */
export function resolveLineFontSize(line: TextLine, baseFontSize: number) {
  if (line.fontSize != null && line.fontSize > 0) {
    return line.fontSize;
  }

  const units = characterUnits(getLineText(line));
  // Bump short beats so 1–2 unit punchlines don't look undersized.
  const multiplier = units <= 2 ? 1.18 : units <= 4 ? 1.08 : 1;
  return Math.round(baseFontSize * multiplier);
}

/**
 * Resolve CSS font-weight for a line; defaults to `baseWeight` (900).
 * @param line - Text line that may set `fontWeight`
 * @param baseWeight - Fallback weight when unset
 */
export function resolveLineFontWeight(line: TextLine, baseWeight = 900) {
  if (line.fontWeight != null && line.fontWeight > 0) {
    return line.fontWeight;
  }

  return baseWeight;
}

/**
 * Expand a line into timed characters for reveal animation.
 * @param line - Source line with segments and start/end
 * @param lineIndex - Index within the parent element
 */
export function getLineChars(line: TextLine, lineIndex: number): LineChar[] {
  const chars: Omit<LineChar, 'start' | 'charIndex'>[] = [];

  for (const segment of line.segments) {
    for (const char of [...segment.text]) {
      chars.push({ char, highlight: segment.highlight, lineIndex });
    }
  }

  const duration = Math.max(line.end - line.start, 0.001);
  const count = Math.max(chars.length, 1);
  // Cap reveal speed; leftover window is hold after the last char.
  const perChar = Math.min(duration / count, MAX_CHAR_DURATION_SECONDS);

  return chars.map((item, charIndex) => ({
    ...item,
    charIndex,
    start: line.start + charIndex * perChar,
  }));
}

/** Flat list of timed characters across all lines of an element. */
export function getElementChars(element: KineticTextElement): LineChar[] {
  return element.lines.flatMap((line, lineIndex) => getLineChars(line, lineIndex));
}

/**
 * Absolute positioning style for a kinetic-text block (size from stable layout).
 * @param element - Positioned kinetic-text element
 */
export function getTextBlockBaseStyle(element: KineticTextElement): CSSProperties {
  const { height } = getStableTextLayout(element);

  return {
    position: 'absolute',
    left: element.x,
    top: element.y,
    width: element.width,
    height,
    textAlign: element.align === 'center' || element.align === 'right' ? element.align : 'left',
    transformOrigin: 'center center',
  };
}

type LineMetrics = {
  width: number;
  height: number;
  fontSize: number;
  fontWeight: number;
};

type StableTextLayout = {
  width: number;
  height: number;
  lines: TextLine[];
  lineMetrics: LineMetrics[];
};

const layoutCache = new Map<string, StableTextLayout>();

function getTextLayoutCacheKey(element: KineticTextElement) {
  const text = element.lines
    .map((line) => {
      const size = line.fontSize ?? '';
      const weight = line.fontWeight ?? '';
      return `${getLineText(line)}@${size}/${weight}`;
    })
    .join('\n');
  return [text, element.width, element.fontSize, element.lineHeight].join('|');
}

function getFont(fontSize: number, fontWeight: number) {
  return `${fontWeight} ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`;
}

function measureTextWidth(text: string, fontSize: number, fontWeight: number, lineHeightPx: number) {
  const prepared = prepareWithSegments(text, getFont(fontSize, fontWeight), { letterSpacing: 0 });
  // Huge max width → single-line measure (we wrap ourselves via line segments).
  const result = layoutWithLines(prepared, 10000, lineHeightPx);
  return Math.max(...result.lines.map((line) => line.width), 1);
}

function getLineMetrics(line: TextLine, element: KineticTextElement): LineMetrics {
  const fontSize = resolveLineFontSize(line, element.fontSize);
  const fontWeight = resolveLineFontWeight(line);
  const lineHeightPx = fontSize * element.lineHeight;
  const width = measureTextWidth(getLineText(line), fontSize, fontWeight, lineHeightPx);
  return { width, height: lineHeightPx, fontSize, fontWeight };
}

/** Content size for the first `lineCount` lines (full line widths, not typed chars). */
export function getPartialTextMetrics(element: KineticTextElement, lineCount: number) {
  const count = Math.max(1, Math.min(lineCount, element.lines.length));
  const metrics = element.lines.slice(0, count).map((line) => getLineMetrics(line, element));
  // Width = widest full line so far; height stacks line boxes.
  const width = Math.max(...metrics.map((item) => item.width), 1);
  const height = metrics.reduce((sum, item) => sum + item.height, 0);
  return { width, height, lineCount: count, lineMetrics: metrics };
}

/**
 * Cached full-block layout metrics (width, height, per-line sizes).
 * @param element - Kinetic-text element to measure
 */
export function getStableTextLayout(element: KineticTextElement): StableTextLayout {
  const cacheKey = getTextLayoutCacheKey(element);
  const cached = layoutCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const lineMetrics = element.lines.map((line) => getLineMetrics(line, element));
  const layout = {
    width: Math.max(...lineMetrics.map((item) => item.width), 1),
    height: lineMetrics.reduce((sum, item) => sum + item.height, 0),
    lines: element.lines,
    lineMetrics,
  };

  layoutCache.set(cacheKey, layout);
  return layout;
}

/** Lines from the stable layout (same order as the element). */
export function getStableLines(element: KineticTextElement) {
  return getStableTextLayout(element).lines;
}

/**
 * Estimated block width/height from stable layout.
 * @param element - Kinetic-text element to measure
 */
export function estimateTextBlockSize(element: KineticTextElement) {
  const { width, height } = getStableTextLayout(element);
  return { width, height };
}
