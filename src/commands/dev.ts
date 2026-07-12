/** Start the Remotion template preview for the current YumoFrame project. */
import {resolve} from 'node:path';
import {loadConfig} from '../config.js';
import {resolveTemplate, runTemplate} from '../runtime.js';
import {assertCurrentProjectValid} from './validate.js';

/**
 * Validate the project, then launch the template `dev` script.
 * @param start Directory to search upward for `yumoframe.config.json` (default: cwd).
 * @returns Result of the template `dev` invocation.
 */
export function devProject(start = process.cwd()) {
  // Fail fast if project.json is missing or has no resolved scenes.
  assertCurrentProjectValid(start);
  const {root, config} = loadConfig(start);
  return runTemplate('dev', {
    projectRoot: root,
    templateDir: resolveTemplate(config, root),
    composition: config.render.composition,
    projectFile: resolve(root, config.paths.project),
  });
}
