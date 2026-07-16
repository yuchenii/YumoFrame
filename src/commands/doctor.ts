/** Environment and runtime health checks for YumoFrame tooling. */
import {existsSync, readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {PACKAGE_ROOT} from '../runtime.js';

/** One doctor check result (name, pass/fail, detail string). */
export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

const findExecutable = (name: string): string | null => {
  // Windows: `where`; Unix: `which` — take the first PATH hit.
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], {encoding: 'utf8'});
  return result.status === 0 ? result.stdout.trim().split('\n')[0] : null;
};

/**
 * List template names under `runtime/templates`.
 * @returns Sorted directory names, or `[]` if the templates folder is missing.
 */
export function listTemplates(): string[] {
  const directory = resolve(PACKAGE_ROOT, 'runtime', 'templates');
  // Only top-level directories count as template ids.
  return existsSync(directory) ? readdirSync(directory, {withFileTypes: true}).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort() : [];
}

/**
 * Run doctor checks for Node, uv, ffmpeg, template, and bundled processors.
 * @param which Optional resolver for executables on `PATH` (defaults to `which`/`where`).
 * @returns Array of named check results.
 */
export function doctorChecks(which: (name: string) => string | null = findExecutable): DoctorCheck[] {
  return [
    // Node always passes — this process is already running it.
    {name: 'node', ok: true, detail: process.version},
    {name: 'uv', ok: Boolean(which('uv')), detail: which('uv') || 'not found'},
    {name: 'ffmpeg', ok: Boolean(which('ffmpeg')), detail: which('ffmpeg') || 'not found'},
    // Bundled package assets, not PATH tools.
    {name: 'comedy-text', ok: listTemplates().includes('comedy-text'), detail: 'runtime template'},
    {name: 'funasr', ok: existsSync(resolve(PACKAGE_ROOT, 'runtime', 'processors', 'funasr', 'pyproject.toml')), detail: 'runtime processor'},
    {name: 'qwen3-tts', ok: existsSync(resolve(PACKAGE_ROOT, 'runtime', 'processors', 'qwen3-tts', 'pyproject.toml')), detail: 'runtime processor'},
  ];
}
