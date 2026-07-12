/** Copy the runtime template into the project and switch config to local source. */
import {cpSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, resolve} from 'node:path';
import {loadConfig} from '../config.js';
import {parseConfig} from '../json.js';
import {resolveTemplate} from '../runtime.js';

/**
 * Eject the configured runtime template into `templates/<name>` and point config at it.
 * @param start Directory to search upward for `yumoframe.config.json` (default: cwd).
 * @returns Absolute path of the ejected local template directory.
 */
export function ejectProject(start = process.cwd()) {
  const {root, config} = loadConfig(start);
  const destinationRelative = `templates/${config.template}`;
  const destination = resolve(root, destinationRelative);
  if (existsSync(destination)) throw new Error(`Local template already exists: ${destination}`);

  mkdirSync(resolve(root, 'templates'), {recursive: true});
  // Force runtime source for the copy; skip install/build artifacts.
  cpSync(resolveTemplate({...config, templateSource: 'runtime'}, root), destination, {
    recursive: true,
    filter: (source) => !['node_modules', 'out', 'dist'].includes(basename(source)),
  });
  // Point the project at the ejected copy via local templateSource.
  const configPath = resolve(root, 'yumoframe.config.json');
  const next = {...parseConfig(readFileSync(configPath, 'utf8'), configPath), templateSource: 'local', templatePath: destinationRelative};
  writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`);
  return destination;
}
