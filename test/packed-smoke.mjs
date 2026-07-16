import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const bin = process.argv[2];
if (!bin) throw new Error('Usage: node test/packed-smoke.mjs <packed-yumoframe-bin>');
const skipRender = process.argv.includes('--skip-render');
const packageVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const env = process.env;
const run = (args, cwd = process.cwd()) => {
  const result = spawnSync(bin, args, {cwd, env, encoding: 'utf8'});
  if (result.status !== 0) throw new Error(`${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
};

assert.equal(run(['--version']).trim(), packageVersion);
assert.equal(run(['templates']).trim(), 'comedy-text');
assert.match(run(['doctor']), /OK funasr/);

const parent = mkdtempSync(join(tmpdir(), 'yumoframe-packed-'));
const root = join(parent, 'project');
run(['init', root, '--template', 'comedy-text']);
const configPath = join(root, 'yumoframe.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
config.render = {...config.render, width: 270, height: 480, fps: 10};
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
writeFileSync(join(root, 'storyboard.json'), `${JSON.stringify({
  version: '0.1.0',
  template: 'comedy-text',
  endOverview: true,
  scenes: [{lines: [{start: 0, end: 0.3, segments: [{text: '打包测试', highlight: false}]}]}],
}, null, 2)}\n`);

run(['resolve'], root);
run(['validate'], root);
if (!skipRender) {
  run(['render'], root);
  assert.equal(existsSync(join(root, 'out', 'video.mp4')), true);
}
run(['eject'], root);
const ejectedConfig = JSON.parse(readFileSync(configPath, 'utf8'));
ejectedConfig.paths.output = 'out/ejected.mp4';
writeFileSync(configPath, `${JSON.stringify(ejectedConfig, null, 2)}\n`);
if (!skipRender) {
  run(['render'], root);
  assert.equal(existsSync(join(root, 'out', 'ejected.mp4')), true);
}
assert.equal(existsSync(join(root, 'node_modules')), false);
assert.equal(existsSync(join(root, '.venv')), false);
assert.equal(existsSync(join(root, 'templates', 'comedy-text', 'node_modules')), false);
console.log(`Packed CLI smoke test passed: ${root}`);
