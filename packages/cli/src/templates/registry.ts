/** Explicit built-in template registry and validated manifest loading. */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, relative, resolve } from "node:path";
import { loadConfig } from "../core/config.ts";
import { PACKAGE_ROOT } from "../core/package-root.ts";
import type { YumoFrameConfig } from "../core/types.ts";
import { centerLineAdapter } from "../../../templates/center-line/adapter-dist/index.js";
import { chatBubblesAdapter } from "../../../templates/chat-bubbles/adapter-dist/index.js";
import { rotatingFlowAdapter } from "../../../templates/rotating-flow/adapter-dist/index.js";
import type {
  TemplateAdapter,
  TemplateCommandContext,
  TemplateFiles,
  TemplateManifest,
  TemplateRegistration,
} from "./types.ts";

const requireAdapter = createRequire(import.meta.url);

const registrations: readonly TemplateRegistration[] = [
  { id: "rotating-flow", runtimeDirectory: "rotating-flow" },
  { id: "center-line", runtimeDirectory: "center-line" },
  { id: "chat-bubbles", runtimeDirectory: "chat-bubbles" },
];

const adapters: ReadonlyMap<string, TemplateAdapter> = new Map([
  [rotatingFlowAdapter.id, rotatingFlowAdapter],
  [centerLineAdapter.id, centerLineAdapter],
  [chatBubblesAdapter.id, chatBubblesAdapter],
]);

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function stringField(value: JsonRecord, key: string, label: string): string {
  if (typeof value[key] !== "string" || value[key].length === 0)
    throw new Error(`${label}.${key} must be a non-empty string`);
  return value[key];
}

function pathMap(value: unknown, label: string): Record<string, string> {
  const map = record(value, label);
  for (const [key, path] of Object.entries(map)) {
    if (typeof path !== "string" || path.length === 0)
      throw new Error(`${label}.${key} must be a non-empty string`);
  }
  return map as Record<string, string>;
}

/** Parse one template manifest at the JSON trust boundary. */
export function parseTemplateManifest(text: string, label = "template.json"): TemplateManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const value = record(parsed, label);
  if (value.schemaVersion !== "yumoframe.template.v1") {
    throw new Error(`${label}.schemaVersion must be yumoframe.template.v1`);
  }
  const schemas = record(value.schemas, `${label}.schemas`);
  const defaults = record(value.defaults, `${label}.defaults`);
  return {
    schemaVersion: "yumoframe.template.v1",
    id: stringField(value, "id", label),
    name: stringField(value, "name", label),
    description: stringField(value, "description", label),
    adapter: stringField(value, "adapter", label),
    entry: stringField(value, "entry", label),
    compositionId: stringField(value, "compositionId", label),
    authoringGuide: stringField(value, "authoringGuide", label),
    schemas: {
      storyboard: stringField(schemas, "storyboard", `${label}.schemas`),
      project: stringField(schemas, "project", `${label}.schemas`),
    },
    defaults: {
      storyboard: stringField(defaults, "storyboard", `${label}.defaults`),
    },
    presets: pathMap(value.presets, `${label}.presets`),
  };
}

/** Return the immutable built-in registrations in display order. */
export function listTemplateRegistrations(): readonly TemplateRegistration[] {
  return registrations;
}

/** Resolve an exact built-in template ID. */
export function getTemplateRegistration(id: string): TemplateRegistration {
  const registration = registrations.find((item) => item.id === id);
  if (!registration) throw new Error(`Unsupported template: ${id}`);
  return registration;
}

/** Resolve the executable Adapter compiled into the CLI for an exact Template ID. */
export function getTemplateAdapter(id: string): TemplateAdapter {
  const adapter = adapters.get(id);
  if (!adapter) throw new Error(`Unsupported template: ${id}`);
  return adapter;
}

function isTemplateAdapter(value: unknown, id: string): value is TemplateAdapter {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    (value as TemplateAdapter).id === id &&
    typeof (value as TemplateAdapter).resolve === "function" &&
    typeof (value as TemplateAdapter).validate === "function"
  );
}

/**
 * Load the Adapter for the active template.
 * Packaged projects use the CLI-bundled Adapter; ejected local projects load
 * `adapter-dist/index.cjs` from the local template so CLI behavior follows eject edits.
 */
function resolveActiveAdapter(
  registration: TemplateRegistration,
  templateRoot: string,
  templateSource: YumoFrameConfig["templateSource"],
): TemplateAdapter {
  if (templateSource !== "local") return getTemplateAdapter(registration.id);

  const adapterPath = resolve(templateRoot, "adapter-dist", "index.cjs");
  if (!existsSync(adapterPath)) {
    throw new Error(
      `Local template adapter not found: ${adapterPath} (rebuild adapter-dist after editing the ejected Adapter)`,
    );
  }
  const resolved = requireAdapter.resolve(adapterPath);
  delete requireAdapter.cache[resolved];
  const mod = requireAdapter(resolved) as Record<string, unknown>;
  const adapter = Object.values(mod).find((value) => isTemplateAdapter(value, registration.id));
  if (!adapter) {
    throw new Error(
      `Local template adapter export for ${registration.id} not found in ${adapterPath}`,
    );
  }
  return adapter;
}

function resolveExistingInside(root: string, path: string, label: string): string {
  if (isAbsolute(path)) throw new Error(`${label} must be relative to the template root`);
  const absolute = resolve(root, path);
  const remainder = relative(root, absolute);
  if (
    remainder === ".." ||
    remainder.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(remainder)
  ) {
    throw new Error(`${label} must stay inside the template root`);
  }
  if (!existsSync(absolute)) throw new Error(`${label} not found: ${absolute}`);
  return absolute;
}

function readManifest(root: string): TemplateManifest {
  const path = resolve(root, "template.json");
  if (!existsSync(path)) throw new Error(`Template manifest not found: ${path}`);
  return parseTemplateManifest(readFileSync(path, "utf8"), path);
}

function resolveTemplateFiles(
  manifest: TemplateManifest,
  templateRoot: string,
  metadataRoot: string,
): TemplateFiles {
  return {
    adapter: resolveExistingInside(metadataRoot, manifest.adapter, "template.adapter"),
    entry: resolveExistingInside(templateRoot, manifest.entry, "template.entry"),
    authoringGuide: resolveExistingInside(
      metadataRoot,
      manifest.authoringGuide,
      "template.authoringGuide",
    ),
    storyboardSchema: resolveExistingInside(
      metadataRoot,
      manifest.schemas.storyboard,
      "template.schemas.storyboard",
    ),
    projectSchema: resolveExistingInside(
      metadataRoot,
      manifest.schemas.project,
      "template.schemas.project",
    ),
    defaultStoryboard: resolveExistingInside(
      metadataRoot,
      manifest.defaults.storyboard,
      "template.defaults.storyboard",
    ),
    presets: Object.fromEntries(
      Object.entries(manifest.presets).map(([id, path]) => [
        id,
        resolveExistingInside(metadataRoot, path, `template.presets.${id}`),
      ]),
    ),
  };
}

/** Public context shared by template-aware commands. */
export interface TemplateContext extends TemplateCommandContext {
  projectRoot: string;
  config: YumoFrameConfig;
  requestedTemplate: string;
  registration: TemplateRegistration;
  adapter: TemplateAdapter;
  templateRoot: string;
  metadataRoot: string;
}

/** Load and validate the active template; local ejects execute the ejected Adapter. */
export function loadTemplateContext(start = process.cwd()): TemplateContext {
  const { root: projectRoot, config } = loadConfig(start);
  const requestedTemplate = config.template;
  const registration = getTemplateRegistration(requestedTemplate);
  const packagedRoot = resolve(
    PACKAGE_ROOT,
    "packages",
    "templates",
    registration.runtimeDirectory,
  );
  const templateRoot =
    config.templateSource === "local"
      ? resolve(projectRoot, config.templatePath ?? "")
      : packagedRoot;
  const metadataRoot = templateRoot;
  const manifest = readManifest(templateRoot);
  if (manifest.id !== registration.id) {
    throw new Error(
      `Template manifest id ${manifest.id} does not match registered id ${registration.id}`,
    );
  }
  const files = resolveTemplateFiles(manifest, templateRoot, metadataRoot);
  if (config.preset && !files.presets[config.preset]) {
    throw new Error(`Unsupported preset for ${registration.id}: ${config.preset}`);
  }
  const adapter = resolveActiveAdapter(registration, templateRoot, config.templateSource);
  return {
    projectRoot,
    config,
    requestedTemplate,
    registration,
    adapter,
    templateRoot,
    metadataRoot,
    manifest,
    files,
  };
}

function readRegisteredManifest(registration: TemplateRegistration): TemplateManifest {
  const root = resolve(PACKAGE_ROOT, "packages", "templates", registration.runtimeDirectory);
  const manifest = readManifest(root);
  if (manifest.id !== registration.id) {
    throw new Error(
      `Template manifest id ${manifest.id} does not match registered id ${registration.id}`,
    );
  }
  resolveTemplateFiles(manifest, root, root);
  return manifest;
}

/** Read one packaged built-in Manifest by exact ID. */
export function getTemplateManifest(id: string): TemplateManifest {
  return readRegisteredManifest(getTemplateRegistration(id));
}

/** Read every packaged built-in Manifest, failing if its declared files are incomplete. */
export function listTemplateManifests(): TemplateManifest[] {
  return registrations.map(readRegisteredManifest);
}
