/** Template-owned deterministic block positions written into project.json by resolve. */
import type { ResolvedTextElement, RotatingFlowProject, TextLine } from "./types.ts";

const MAX_BLOCK_WIDTH = 760;
const BLOCK_GAP = 28;
const CURSOR_WIDTH_EM = 0.66;
const DEFAULT_LINE_HEIGHT = 1.32;
const ALLOWED_ROTATIONS = new Set([-90, 0, 90]);

const lineText = (line: TextLine): string => line.segments.map((segment) => segment.text).join("");

function characterUnits(text: string): number {
  return [...text].reduce((sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 1.02 : 0.62), 0);
}

function lineFontSize(line: TextLine, base: number): number {
  if (line.fontSize != null && line.fontSize > 0) return line.fontSize;
  const units = [...lineText(line)].reduce(
    (sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 1 : 0.5),
    0,
  );
  return Math.round(base * (units <= 2 ? 1.18 : units <= 4 ? 1.08 : 1));
}

/** Approximate the browser text box once; every consumer then uses the resolved coordinates. */
export function measureRotatingFlowElement(element: ResolvedTextElement): {
  width: number;
  height: number;
  lineHeights: number[];
  lineFontSizes: number[];
} {
  const lineFontSizes = element.lines.map((line) => lineFontSize(line, element.fontSize));
  const lineHeights = lineFontSizes.map((fontSize) => fontSize * element.lineHeight);
  const width = Math.min(
    MAX_BLOCK_WIDTH,
    Math.max(
      ...element.lines.map(
        (line) => characterUnits(lineText(line)) * lineFontSize(line, element.fontSize),
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
      rotate: -rotate + (source.rotate || 0),
      scale: source.scale || 1,
      fontSize: source.fontSize || 128,
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
