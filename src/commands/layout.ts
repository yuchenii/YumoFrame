/** Build an SVG layout preview of resolved project scenes on the virtual canvas. */
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {loadConfig} from '../config.js';
import {parseProject} from '../json.js';
import type {ResolvedScene, TextLine, TextSegment, YumoFrameProject} from '../types.js';

const maxBlockWidth = 760;
const blockGap = 28;
const cursorWidthEm = 0.66;

const esc = (value: unknown): string =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

interface LayoutElement {
  lines: TextLine[];
  fontSize: number;
  lineHeight: number;
  width: number;
  rotate: number;
  align: string;
}

/** Approximate line width: ASCII chars ~0.62em, others ~1.02em. */
const measureLine = (segments: TextSegment[], element: Pick<LayoutElement, 'fontSize'>): number => {
  const text = segments.map((segment) => segment.text).join('');
  // Heuristic: Latin ~0.62em, CJK/other ~1.02em (not a real font measure).
  const units = [...text].reduce((sum, char) => sum + (/[\x00-\xff]/.test(char) ? 0.62 : 1.02), 0);
  return Math.max(units * element.fontSize, 1);
};

const getTextLayout = (element: LayoutElement): {lines: TextSegment[][]; width: number; height: number; lineHeight: number} => {
  const lineHeight = element.fontSize * element.lineHeight;
  const lines = (element.lines ?? []).map((line) => line.segments ?? []);
  const width = Math.max(...lines.map((line) => measureLine(line, element)), 1);
  return {lines, width, height: Math.max(lines.length, 1) * lineHeight, lineHeight};
};

const getRotatedBox = (width: number, height: number, rotate: number): {width: number; height: number} =>
  // ±90° swaps the axis-aligned bounding box.
  Math.abs(rotate) % 180 === 90 ? {width: height, height: width} : {width, height};

const getSceneRotation = (scene: ResolvedScene): number => ([-90, 0, 90].includes(scene.camera?.rotate) ? scene.camera.rotate : 0);

/** Map camera rotation change to the next block's step direction on the canvas. */
const getNextStep = (previousRotate: number, rotate: number): 'right' | 'left' | 'up' | 'down' => {
  // Positive camera delta steps "screen left"; project that into canvas axes.
  const delta = rotate - previousRotate;
  const screenX = delta > 0 ? -1 : 1;
  const radians = (-rotate * Math.PI) / 180;
  const canvasX = Math.round(screenX * Math.cos(radians));
  const canvasY = Math.round(screenX * Math.sin(radians));
  if (canvasX > 0) return 'right';
  if (canvasX < 0) return 'left';
  return canvasY < 0 ? 'up' : 'down';
};

const getTextAlign = (rotate: number): string => {
  // Counterclockwise (negative) → left-aligned; otherwise right (including 0°).
  if (rotate < 0) return 'left';
  if (rotate > 0) return 'right';
  return 'right';
};

/**
 * Render a full-canvas SVG preview of positioned scene text blocks.
 * @param project Resolved YumoFrame project with timeline scenes.
 * @returns SVG markup string.
 */
export function renderLayoutSvg(project: YumoFrameProject): string {
  const blocks = (project.timeline?.scenes ?? []).map((scene) => {
    // Preview uses the first text element of each scene.
    const sourceElement = scene.elements?.[0] ?? {lines: [], fontSize: 108, lineHeight: 1.08};
    const draftElement = {
      ...sourceElement,
      x: 0,
      y: 0,
      width: maxBlockWidth,
      rotate: 0,
      scale: 1,
      fontSize: sourceElement.fontSize || 108,
      lineHeight: sourceElement.lineHeight || 1.08,
      align: 'right',
    };
    const layout = getTextLayout(draftElement);
    const rotate = getSceneRotation(scene);
    // SVG rotate is opposite of camera rotate for the same visual orientation.
    const element = {...draftElement, align: getTextAlign(rotate), rotate: -rotate, width: Math.ceil(layout.width)};
    return {scene, element, layout, rotate, box: getRotatedBox(element.width, layout.height, element.rotate)};
  });

  // Walk the chain from a fixed start near the virtual-canvas center.
  let centerX = (project.timeline?.virtualCanvas?.width ?? 40000) / 2;
  let centerY = 1900;
  const positioned = blocks.map((block, index) => {
    if (index > 0) {
      const previous = blocks[index - 1]!;
      const step = getNextStep(previous.rotate, block.rotate);
      // Gap includes an em-width "cursor" allowance between blocks.
      const gap = Math.max(previous.element.fontSize, block.element.fontSize) * cursorWidthEm + blockGap;
      if (step === 'right') centerX += previous.box.width / 2 + block.box.width / 2 + gap;
      else if (step === 'left') centerX -= previous.box.width / 2 + block.box.width / 2 + gap;
      else if (step === 'up') centerY -= previous.box.height / 2 + block.box.height / 2 + gap;
      else centerY += previous.box.height / 2 + block.box.height / 2 + gap;
    }
    return {...block, centerX, centerY};
  });

  const textNodes = positioned
    .map((block, blockIndex) => {
      const {element, layout} = block;
      const x = block.centerX - element.width / 2;
      const y = block.centerY - layout.height / 2;
      const anchor = element.align === 'right' ? 'end' : element.align === 'center' ? 'middle' : 'start';
      const textX = element.align === 'right' ? element.width : element.align === 'center' ? element.width / 2 : 0;
      const lines = layout.lines
        .map((line, lineIndex) => {
          const tspans = line
            .map((token) => `<tspan fill="${String(token.highlight ? project.theme.highlightColor : project.theme.textColor)}">${esc(token.text)}</tspan>`)
            .join('');
          // 0.82 offsets the baseline into the line box for visual centering.
          return `<text x="${textX.toFixed(1)}" y="${((lineIndex + 0.82) * layout.lineHeight).toFixed(1)}" text-anchor="${anchor}">${tspans}</text>`;
        })
        .join('\n');

      return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${element.rotate} ${(element.width / 2).toFixed(1)} ${(layout.height / 2).toFixed(1)})">
  <rect width="${element.width.toFixed(1)}" height="${layout.height.toFixed(1)}" fill="none" stroke="#3b82f6" stroke-width="3" stroke-dasharray="18 14" opacity="0.42"/>
  <text x="0" y="-18" fill="#94a3b8" font-size="38" font-weight="700">#${blockIndex + 1}</text>
  <g font-family="${esc(project.theme.fontFamily)}" font-size="${element.fontSize}" font-weight="900" letter-spacing="0">${lines}</g>
</g>`;
    })
    .join('\n');

  const width = project.timeline?.virtualCanvas?.width ?? 40000;
  const height = project.timeline?.virtualCanvas?.height ?? 40000;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="${project.composition?.background ?? '#000000'}"/>
<rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#1f2937" stroke-width="8"/>
${textNodes}
</svg>
`;
}

/**
 * Load `project.json` and write the layout SVG to the configured preview path.
 * @param start Directory to search upward for `yumoframe.config.json` (default: cwd).
 * @returns Absolute path of the written SVG.
 */
export function layoutProject(start = process.cwd()): {outputPath: string} {
  const {root, config} = loadConfig(start);
  const projectPath = resolve(root, config.paths.project);
  // Default preview path when config omits layoutSvg.
  const outputPath = resolve(root, config.paths.layoutSvg || 'out/layout-preview.svg');
  const project = parseProject(readFileSync(projectPath, 'utf8'), projectPath);
  mkdirSync(dirname(outputPath), {recursive: true});
  writeFileSync(outputPath, renderLayoutSvg(project));
  return {outputPath};
}
