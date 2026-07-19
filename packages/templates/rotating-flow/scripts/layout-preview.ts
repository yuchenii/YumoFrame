#!/usr/bin/env node
/**
 * Layout stress preview for template development (no user project required).
 *
 * Re-layouts stubProject and writes out/layout-preview.svg.
 *
 * Usage (from this package):
 *   pnpm layout
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { layoutRotatingFlowProject } from "../src/adapter/layout.ts";
import { renderLayoutSvg } from "../src/adapter/layout-command.ts";
import type { RotatingFlowProject } from "../src/adapter/types.ts";
import { stubProject } from "../src/stubProject.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = resolve(root, "out/layout-preview.svg");

// Stub is authored as the Remotion project shape; resolved layout matches RotatingFlowProject.
const laid = layoutRotatingFlowProject(stubProject as RotatingFlowProject);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, renderLayoutSvg(laid));
console.log(outPath);
