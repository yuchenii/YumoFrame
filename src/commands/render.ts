/** Render the Remotion composition for the current YumoFrame project. */
import {resolve} from 'node:path';
import {loadConfig} from '../config.js';
import {resolveTemplate, runTemplate} from '../runtime.js';
import {assertCurrentProjectValid} from './validate.js';

/**
 * Validate the project, then launch the template `render` script.
 * @param start Directory to search upward for `yumoframe.config.json` (default: cwd).
 * @returns Result of the template `render` invocation.
 */
export function renderProject(start = process.cwd()) {
  // Fail fast if project.json is missing or has no resolved scenes.
  assertCurrentProjectValid(start);
  const {root, config} = loadConfig(start);
  return runTemplate('render', {
    projectRoot: root,
    templateDir: resolveTemplate(config, root),
    composition: config.render.composition,
    output: resolve(root, config.paths.output),
    projectFile: resolve(root, config.paths.project),
  });
}
