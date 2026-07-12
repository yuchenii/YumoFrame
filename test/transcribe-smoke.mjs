import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

import {initProject} from '../dist/commands/init.js';
import {transcribeProject} from '../dist/commands/transcribe.js';

const root = initProject({dir: join(mkdtempSync(join(tmpdir(), 'yumoframe-transcribe-')), 'project'), template: 'comedy-text'});
const media = join(root, 'assets', 'input.wav');
const ffmpeg = spawnSync('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', media,
]);
assert.equal(ffmpeg.status, 0);

const fakeAsr = join(root, 'fake-asr.mjs');
writeFileSync(fakeAsr, `import {writeFileSync} from 'node:fs';
const output = process.argv[3];
writeFileSync(output + '.json', JSON.stringify({engine: 'fixture', language: 'zh', duration: 0.2, segments: [{start: 0, end: 0.2, text: '测试'}]}));
`);

const configPath = join(root, 'yumoframe.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
config.paths.media = 'assets/input.wav';
config.processors.asr = {type: 'command', command: [process.execPath, fakeAsr], env: {}};
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

const result = await transcribeProject(root);
assert.equal(JSON.parse(readFileSync(result.transcriptPath, 'utf8')).segments[0].text, '测试');
assert.equal(existsSync(result.voicePath), true);
assert.equal(existsSync(join(root, '.venv')), false);
console.log(`Transcribe smoke test passed: ${root}`);
