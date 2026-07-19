/** Template-owned deterministic block positions written into project.json by resolve. */
import type { ResolvedTextElement, RotatingFlowProject, TextLine } from "./types.ts";
import {
  DEFAULT_LINE_HEIGHT,
  DEFAULT_MAX_LINE_FONT_SIZE,
  MAX_BLOCK_WIDTH,
} from "../layout-constants.ts";

export { DEFAULT_LINE_HEIGHT, DEFAULT_MAX_LINE_FONT_SIZE, MAX_BLOCK_WIDTH };

/**
 * Layout-only ASCII width vs CJK=1. Higher than authoring `lineUnits` (0.5) so bold
 * Latin (weight 900) does not underestimate block width without Node canvas/pretext.
 */
export const LAYOUT_ASCII_UNITS = 0.62;
const BLOCK_GAP = 28;
const CURSOR_WIDTH_EM = 0.66;
const ALLOWED_ROTATIONS = new Set([-90, 0, 90]);

const lineText = (line: TextLine): string => line.segments.map((segment) => segment.text).join("");

/** Layout width units: CJK/other = 1, ASCII = LAYOUT_ASCII_UNITS (not authoring lineUnits). */
function layoutCharacterUnits(text: string): number {
  return [...text].reduce(
    (sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 1 : LAYOUT_ASCII_UNITS),
    0,
  );
}

/**
 * Fit line font size into the content column; explicit `line.fontSize` wins.
 * Longer lines shrink so every glyph stays inside `maxWidth`.
 */
export function fitLineFontSize(
  line: TextLine,
  baseFontSize: number,
  maxWidth: number = MAX_BLOCK_WIDTH,
): number {
  if (line.fontSize != null && line.fontSize > 0) return line.fontSize;
  const units = layoutCharacterUnits(lineText(line));
  const maxFont = baseFontSize > 0 ? baseFontSize : DEFAULT_MAX_LINE_FONT_SIZE;
  if (units <= 0) return maxFont;
  return Math.max(1, Math.min(maxFont, Math.floor(maxWidth / units)));
}

/** Approximate the browser text box once; every consumer then uses the resolved coordinates. */
export function measureRotatingFlowElement(element: ResolvedTextElement): {
  width: number;
  height: number;
  lineHeights: number[];
  lineFontSizes: number[];
} {
  const lineFontSizes = element.lines.map((line) =>
    fitLineFontSize(line, element.fontSize, MAX_BLOCK_WIDTH),
  );
  const lineHeights = lineFontSizes.map((fontSize) => fontSize * element.lineHeight);
  const width = Math.min(
    MAX_BLOCK_WIDTH,
    Math.max(
      ...element.lines.map(
        (line, index) =>
          layoutCharacterUnits(lineText(line)) * (lineFontSizes[index] ?? element.fontSize),
      ),
      1,
    ),
  );
  return {
    width,
    height: Math.max(
      lineHeights.reduce((sum, value) => sum + value, 0),
      1,
    ),
    lineHeights,
    lineFontSizes,
  };
}

function rotatedBox(
  width: number,
  height: number,
  rotate: number,
): { width: number; height: number } {
  return Math.abs(rotate) % 180 === 90 ? { width: height, height: width } : { width, height };
}

function nextStep(previousRotate: number, rotate: number): "right" | "left" | "up" | "down" {
  const screenX = rotate - previousRotate > 0 ? -1 : 1;
  const radians = (-rotate * Math.PI) / 180;
  const canvasX = Math.round(screenX * Math.cos(radians));
  const canvasY = Math.round(screenX * Math.sin(radians));
  if (canvasX > 0) return "right";
  if (canvasX < 0) return "left";
  return canvasY < 0 ? "up" : "down";
}

/** Resolve all block coordinates and scene camera targets before Studio or Render starts. */
export function layoutRotatingFlowProject(project: RotatingFlowProject): RotatingFlowProject {
  const blocks = project.timeline.scenes.map((scene) => {
    const source = scene.elements[0];
    const rotate = ALLOWED_ROTATIONS.has(scene.camera.rotate) ? scene.camera.rotate : 0;
    const draft: ResolvedTextElement = {
      ...source,
      x: 0,
      y: 0,
      width: MAX_BLOCK_WIDTH,
      // Cancel camera rotate so glyphs read upright on screen. Do not add
      // source.rotate — re-layout must stay idempotent on already-resolved projects.
      rotate: rotate === 0 ? 0 : -rotate,
      scale: source.scale || 1,
      fontSize: source.fontSize || DEFAULT_MAX_LINE_FONT_SIZE,
      lineHeight: source.lineHeight || DEFAULT_LINE_HEIGHT,
      align: rotate < 0 ? "left" : "right",
    };
    const size = measureRotatingFlowElement(draft);
    const element = { ...draft, width: Math.ceil(size.width) };
    return {
      scene,
      rotate,
      element,
      height: size.height,
      box: rotatedBox(element.width, size.height, element.rotate),
    };
  });

  let centerX = project.timeline.virtualCanvas.width / 2;
  let centerY = 1900;
  const scenes = blocks.map((block, index) => {
    if (index > 0) {
      const previous = blocks[index - 1]!;
      const step = nextStep(previous.rotate, block.rotate);
      const gap =
        Math.max(previous.element.fontSize, block.element.fontSize) * CURSOR_WIDTH_EM + BLOCK_GAP;
      if (step === "right") centerX += previous.box.width / 2 + block.box.width / 2 + gap;
      else if (step === "left") centerX -= previous.box.width / 2 + block.box.width / 2 + gap;
      else if (step === "up") centerY -= previous.box.height / 2 + block.box.height / 2 + gap;
      else centerY += previous.box.height / 2 + block.box.height / 2 + gap;
    }
    return {
      ...block.scene,
      camera: {
        ...block.scene.camera,
        targetX: centerX,
        targetY: centerY,
        scale: 1,
        rotate: block.rotate,
        ease: "spring",
      },
      elements: [
        { ...block.element, x: centerX - block.element.width / 2, y: centerY - block.height / 2 },
      ],
    };
  });

  return { ...project, timeline: { ...project.timeline, scenes } };
}
