/**
 * Locate and load `yumoframe.config.json` by walking up from a start directory.
 */
import {existsSync, readFileSync} from 'node:fs';
import {dirname, parse, resolve} from 'node:path';
import {parseConfig} from './json.js';
import type {YumoFrameConfig} from './types.js';

/** Filename of the project config file expected at the project root. */
export const CONFIG_FILE = 'yumoframe.config.json';

/**
 * Walk parents from `start` until `yumoframe.config.json` is found.
 * @param start - Directory to begin the search (defaults to cwd).
 * @returns Absolute path of the project root containing the config.
 */
export function findProjectRoot(start = process.cwd()): string {
  let current = resolve(start);
  const root = parse(current).root;

  while (true) {
    if (existsSync(resolve(current, CONFIG_FILE))) return current;
    // Stop at filesystem root so we never walk into an infinite dirname loop.
    if (current === root) throw new Error(`${CONFIG_FILE} not found from ${resolve(start)}`);
    current = dirname(current);
  }
}

/**
 * Find the project root and parse its config file.
 * @param start - Directory to begin the search (defaults to cwd).
 * @returns `{root, config}` for the discovered project.
 */
export function loadConfig(start = process.cwd()): {root: string; config: YumoFrameConfig} {
  const root = findProjectRoot(start);
  return {
    root,
    config: parseConfig(readFileSync(resolve(root, CONFIG_FILE), 'utf8')),
  };
}
