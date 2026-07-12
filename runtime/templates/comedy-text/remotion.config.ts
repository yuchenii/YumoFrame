/**
 * Remotion CLI config: overwrite output, optional project public dir and node_modules.
 */

import { resolve } from 'node:path';
import { Config } from '@remotion/cli/config';

Config.setOverwriteOutput(true);

// Serve the active work directory as Remotion public/ so audio.src is just "voice.m4a".
const projectDir = process.env.YUMOFRAME_PROJECT;
if (projectDir) {
  Config.setPublicDir(resolve(projectDir));
}

const runtimeNodeModules = process.env.YUMOFRAME_NODE_MODULES;
if (runtimeNodeModules) {
  Config.overrideWebpackConfig((configuration) => ({
    ...configuration,
    resolve: {
      ...configuration.resolve,
      modules: ['node_modules', runtimeNodeModules],
    },
  }));
}
