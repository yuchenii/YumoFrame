import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {initProject} from '../dist/commands/init.js';
import {renderProject} from '../dist/commands/render.js';
import {resolveProject} from '../dist/commands/resolve.js';
import {ejectProject} from '../dist/commands/eject.js';

const root = initProject({dir: join(mkdtempSync(join(tmpdir(), 'yumoframe-render-')), 'project'), template: 'comedy-text'});
const configPath = join(root, 'yumoframe.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
config.render = {...config.render, width: 270, height: 480, fps: 10};
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
writeFileSync(join(root, 'storyboard.json'), `${JSON.stringify({
  version: '0.1.0',
  template: 'comedy-text',
  endOverview: false,
  lines: [{start: 0, end: 0.3, segments: [{text: '测试', highlight: false}]}],
}, null, 2)}\n`);

resolveProject(root);
await renderProject(root);
assert.equal(existsSync(join(root, 'out', 'video.mp4')), true);
ejectProject(root);
const ejectedConfig = JSON.parse(readFileSync(configPath, 'utf8'));
ejectedConfig.paths.output = 'out/ejected.mp4';
writeFileSync(configPath, `${JSON.stringify(ejectedConfig, null, 2)}\n`);
await renderProject(root);
assert.equal(existsSync(join(root, 'out', 'ejected.mp4')), true);
assert.equal(existsSync(join(root, 'templates', 'comedy-text', 'node_modules')), false);
console.log(`Rendered runtime and ejected templates under ${join(root, 'out')}`);
