/** Build an SVG preview from the resolved rotating-flow coordinates. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadConfig } from "@yumoframe/cli/core/config";
import { parseProject } from "./json.ts";
import { measureRotatingFlowElement } from "./layout.ts";
import type { RotatingFlowProject } from "./types.ts";

const PREVIEW_PADDING = 200;

const esc = (value: unknown): string =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const rotatedBox = (
  width: number,
  height: number,
  rotate: number,
): { width: number; height: number } =>
  Math.abs(rotate) % 180 === 90 ? { width: height, height: width } : { width, height };

/** Render the coordinates already stored in project.json; this command does not perform layout. */
export function renderLayoutSvg(project: RotatingFlowProject): string {
  const positioned = project.timeline.scenes.flatMap((scene) => {
    const element = scene.elements[0];
    if (!element) return [];
    const layout = measureRotatingFlowElement(element);
    const box = rotatedBox(element.width, layout.height, element.rotate);
    return [
      {
        element,
        layout,
        box,
        centerX: element.x + element.width / 2,
        centerY: element.y + layout.height / 2,
      },
    ];
  });

  const textNodes = positioned
    .map(({ element, layout }, blockIndex) => {
      const anchor =
        element.align === "right" ? "end" : element.align === "center" ? "middle" : "start";
      const textX =
        element.align === "right"
          ? element.width
          : element.align === "center"
            ? element.width / 2
            : 0;
      let lineTop = 0;
      const lines = element.lines
        .map((line, lineIndex) => {
          const lineHeight = layout.lineHeights[lineIndex] ?? element.fontSize * element.lineHeight;
          const fontSize = layout.lineFontSizes[lineIndex] ?? element.fontSize;
          const y = lineTop + lineHeight * 0.82;
          lineTop += lineHeight;
          const tspans = line.segments
            .map(
              (token) =>
                `<tspan fill="${String(token.highlight ? project.theme.highlightColor : project.theme.textColor)}">${esc(token.text)}</tspan>`,
            )
            .join("");
          return `<text x="${textX.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-size="${fontSize}">${tspans}</text>`;
        })
        .join("\n");

      return `<g transform="translate(${element.x.toFixed(1)} ${element.y.toFixed(1)}) rotate(${element.rotate} ${(element.width / 2).toFixed(1)} ${(layout.height / 2).toFixed(1)})">
  <rect width="${element.width.toFixed(1)}" height="${layout.height.toFixed(1)}" fill="none" stroke="#3b82f6" stroke-width="3" stroke-dasharray="18 14" opacity="0.42"/>
  <text x="0" y="-18" fill="#94a3b8" font-size="38" font-weight="700">#${blockIndex + 1}</text>
  <g font-family="${esc(project.theme.fontFamily)}" font-weight="900" letter-spacing="0">${lines}</g>
</g>`;
    })
    .join("\n");

  const virtualWidth = project.timeline.virtualCanvas.width;
  const virtualHeight = project.timeline.virtualCanvas.height;
  const bounds =
    positioned.length > 0
      ? positioned.reduce(
          (result, block) => ({
            minX: Math.min(result.minX, block.centerX - block.box.width / 2),
            minY: Math.min(result.minY, block.centerY - block.box.height / 2),
            maxX: Math.max(result.maxX, block.centerX + block.box.width / 2),
            maxY: Math.max(result.maxY, block.centerY + block.box.height / 2),
          }),
          { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
        )
      : { minX: 0, minY: 0, maxX: virtualWidth, maxY: virtualHeight };
  const viewX = Math.floor(bounds.minX - PREVIEW_PADDING);
  const viewY = Math.floor(bounds.minY - PREVIEW_PADDING);
  const width = Math.ceil(bounds.maxX + PREVIEW_PADDING - viewX);
  const height = Math.ceil(bounds.maxY + PREVIEW_PADDING - viewY);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewX} ${viewY} ${width} ${height}">
<rect x="${viewX}" y="${viewY}" width="${width}" height="${height}" fill="${project.composition.background}"/>
<rect x="${viewX}" y="${viewY}" width="${width}" height="${height}" fill="none" stroke="#1f2937" stroke-width="8"/>
${textNodes}
</svg>
`;
}

/** Load project.json and write the configured SVG preview path. */
export function layoutProject(start = process.cwd()): { outputPath: string } {
  const { root, config } = loadConfig(start);
  const projectPath = resolve(root, config.paths.project);
  const outputPath = resolve(root, config.paths.layoutSvg || "out/layout-preview.svg");
  const project = parseProject(readFileSync(projectPath, "utf8"), projectPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderLayoutSvg(project));
  return { outputPath };
}
