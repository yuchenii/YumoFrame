import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, mkdirSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

import {findProjectRoot, loadConfig} from '../dist/config.js';
import {initProject} from '../dist/commands/init.js';
import {resolveComedyText, validateProject, validateStoryboard} from '../dist/comedy-text.js';
import {resolveTemplate, templateInvocation} from '../dist/runtime.js';
import {processorEnvironmentDir, transcribeInvocation} from '../dist/commands/transcribe.js';
import {ejectProject} from '../dist/commands/eject.js';
import {doctorChecks, listTemplates} from '../dist/commands/doctor.js';
import {devProject} from '../dist/commands/dev.js';
import {renderProject} from '../dist/commands/render.js';
import {validateCurrentProject} from '../dist/commands/validate.js';
import {parseConfig, parseProject, parseTranscript} from '../dist/json.js';

const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const cliPath = join(dirname(fileURLToPath(import.meta.url)), '../dist/cli.js');

test('Commander exposes detailed help and rejects invalid choices', () => {
  const empty = spawnSync(process.execPath, [cliPath], {encoding: 'utf8'});
  assert.equal(empty.status, 0, empty.stderr);
  assert.match(empty.stdout, /Usage: yumoframe/);

  const help = spawnSync(process.execPath, [cliPath, '--help'], {encoding: 'utf8'});
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Typical workflows:/);
  assert.match(help.stdout, /studio\|dev/);

  const resolveHelp = spawnSync(process.execPath, [cliPath, 'resolve', '--help'], {encoding: 'utf8'});
  assert.equal(resolveHelp.status, 0, resolveHelp.stderr);
  assert.match(resolveHelp.stdout, /--no-align/);
  assert.match(resolveHelp.stdout, /transcript\.json/);

  const invalid = spawnSync(process.execPath, [cliPath, 'sync', 'unknown'], {encoding: 'utf8'});
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Allowed choices are all, transcript, project/);
});

test('JSON boundaries reject malformed external data', () => {
  assert.throws(() => parseConfig('{}'), /version must be a string/);
  assert.throws(
    () => parseTranscript('{"segments":[{"start":"now","end":1,"text":"测试"}]}'),
    /needs numeric start\/end/,
  );

  const root = initProject({dir: join(mkdtempSync(join(tmpdir(), 'yumoframe-json-')), 'project'), template: 'comedy-text'});
  const config = json(join(root, 'yumoframe.config.json'));
  config.processors.asr.type = 'unknown';
  assert.throws(() => parseConfig(JSON.stringify(config)), /type must be builtin or command/);

  const project = json(join(root, 'project.json'));
  project.timeline.virtualCanvas.width = 'wide';
  assert.throws(() => parseProject(JSON.stringify(project)), /virtualCanvas.width must be a number/);
});

test('init creates a data-only comedy-text project', () => {
  const parent = mkdtempSync(join(tmpdir(), 'yumoframe-init-'));
  const root = join(parent, 'comedy-001');

  initProject({dir: root, template: 'comedy-text'});

  assert.equal(json(join(root, 'yumoframe.config.json')).template, 'comedy-text');
  assert.equal(json(join(root, 'storyboard.json')).template, 'comedy-text');
  assert.ok(json(join(root, 'storyboard.json')).scenes.length >= 1);
  assert.ok(json(join(root, 'lines.json')).lines.length >= 1);
  assert.deepEqual(json(join(root, 'project.json')).timeline.scenes, []);
  assert.equal(readFileSync(join(root, 'assets', '.gitkeep'), 'utf8'), '');
  assert.equal(findProjectRoot(join(root, 'assets')), root);
  assert.equal(loadConfig(join(root, 'assets')).config.paths.project, 'project.json');
  assert.equal(loadConfig(root).config.paths.storyboard, 'storyboard.json');
  assert.equal(loadConfig(root).config.paths.lines, 'lines.json');
});

test('init rejects unsupported templates and non-empty targets', () => {
  const parent = mkdtempSync(join(tmpdir(), 'yumoframe-init-errors-'));
  assert.throws(() => initProject({dir: join(parent, 'bad'), template: 'chat-bubbles'}), /Unsupported template/);

  const occupied = join(parent, 'occupied');
  mkdirSync(occupied);
  writeFileSync(join(occupied, 'keep.txt'), 'user data');
  assert.throws(() => initProject({dir: occupied, template: 'comedy-text'}), /not empty/);
});

test('validate checks lines.json even when storyboard.json exists', () => {
  const root = initProject({dir: join(mkdtempSync(join(tmpdir(), 'yumoframe-lines-')), 'project'), template: 'comedy-text'});
  const linesPath = join(root, 'lines.json');
  const lines = json(linesPath);
  lines.lines[0].segments[0].text = '超过六个中文字';
  writeFileSync(linesPath, `${JSON.stringify(lines, null, 2)}\n`);

  assert.ok(validateCurrentProject(root).some((error) => error.includes('lines[0]') && error.includes('max 6')));
});

test('studio and render stop on validation errors before starting Remotion', () => {
  const root = initProject({dir: join(mkdtempSync(join(tmpdir(), 'yumoframe-preflight-')), 'project'), template: 'comedy-text'});
  const linesPath = join(root, 'lines.json');
  const lines = json(linesPath);
  lines.lines[0].segments[0].text = '超过六个中文字';
  writeFileSync(linesPath, `${JSON.stringify(lines, null, 2)}\n`);

  assert.throws(() => devProject(root), /lines\[0\].*max 6/);
  assert.throws(() => renderProject(root), /lines\[0\].*max 6/);
});

test('studio and render require resolved project scenes', () => {
  const parent = mkdtempSync(join(tmpdir(), 'yumoframe-resolved-preflight-'));
  const emptyRoot = initProject({dir: join(parent, 'empty'), template: 'comedy-text'});
  assert.throws(() => devProject(emptyRoot), /project\.json has no resolved scenes/);

  const missingRoot = initProject({dir: join(parent, 'missing'), template: 'comedy-text'});
  unlinkSync(join(missingRoot, 'project.json'));
  assert.throws(() => renderProject(missingRoot), /missing project\.json/);
});

test('config discovery reports a project outside any config tree', () => {
  const outside = mkdtempSync(join(tmpdir(), 'yumoframe-no-config-'));
  assert.throws(() => findProjectRoot(outside), /yumoframe.config.json/);
});

const storyboard = {
  version: '0.1.0',
  template: 'comedy-text',
  duration: 8,
  scenes: [
    {
      lines: [
        {start: 0, end: 1, segments: [{text: '第一句', highlight: false}]},
        {start: 1, end: 2, segments: [{text: '第二句', highlight: false}]},
        {start: 2, end: 3, segments: [{text: '第三句', highlight: false}]},
      ],
    },
    {
      lines: [
        {start: 3.6, end: 4.5, segments: [{text: '第四句', highlight: false}]},
        {start: 4.5, end: 5.5, segments: [{text: '第五句', highlight: false}]},
        {start: 5.5, end: 6.5, segments: [{text: '第六句', highlight: false}]},
      ],
    },
  ],
};

test('resolve uses scenes tree and alternates rotation', () => {
  const project = resolveComedyText(storyboard, {render: {width: 1080, height: 1920, fps: 30}});
  assert.equal(project.timeline.scenes.length, 2);
  assert.deepEqual(project.timeline.scenes.map((scene) => scene.camera.rotate), [0, -90]);
  assert.deepEqual(project.timeline.scenes.map((scene) => scene.elements[0].lines.length), [3, 3]);
  assert.equal(project.timeline.scenes[0].elements[0].width, 0);
});

test('storyboard validation reports timing, length, and highlight errors together', () => {
  const errors = validateStoryboard({
    version: '0.1.0',
    template: 'comedy-text',
    scenes: [{
      lines: [
        {start: 1, end: 2, segments: [{text: '超过六个中文字', highlight: true}]},
        {start: 1.5, end: 1.5, segments: [{text: '错误', highlight: true}]},
      ],
    }],
  });
  assert.ok(errors.some((error) => error.includes('units') && error.includes('max 6')));
  assert.ok(errors.some((error) => error.includes('previous line')));
  assert.ok(errors.some((error) => error.includes('after start')));
  assert.ok(errors.some((error) => error.includes('35%')));
});

test('project validation checks referenced project assets', () => {
  const root = mkdtempSync(join(tmpdir(), 'yumoframe-project-validation-'));
  const project = resolveComedyText({...storyboard, audio: {src: 'assets/voice.m4a'}}, {
    render: {width: 1080, height: 1920, fps: 30},
  });
  assert.ok(validateProject(project, root).some((error) => error.includes('file missing')));
});

test('runtime template is package-relative and local template is project-relative', () => {
  const projectRoot = '/tmp/yumoframe-project';
  assert.match(resolveTemplate({template: 'comedy-text', templateSource: 'runtime'}, projectRoot), /runtime\/templates\/comedy-text$/);
  assert.equal(
    resolveTemplate({template: 'comedy-text', templateSource: 'local', templatePath: 'templates/comedy-text'}, projectRoot),
    '/tmp/yumoframe-project/templates/comedy-text',
  );
});

test('render invocation uses the configured project and output', () => {
  const invocation = templateInvocation('render', {
    projectRoot: '/tmp/project',
    templateDir: '/tmp/template',
    composition: 'ComedyTextVideo',
    output: '/tmp/project/out/video.mp4',
    projectFile: '/tmp/project/project.json',
    remotionCli: '/tmp/node_modules/@remotion/cli/remotion-cli.js',
    dependencyNodeModules: '/tmp/node_modules',
  });
  assert.deepEqual(invocation.args.slice(1, 5), ['render', 'src/index.tsx', 'ComedyTextVideo', '/tmp/project/out/video.mp4']);
  assert.equal(invocation.cwd, '/tmp/template');
  assert.equal(invocation.env.YUMOFRAME_PROJECT, '/tmp/project');
  assert.equal(invocation.args[invocation.args.indexOf('--props') + 1], '/tmp/project/project.json');
});

test('FunASR uses a versioned virtual environment outside the runtime', () => {
  const environment = processorEnvironmentDir('0.1.0');
  assert.equal(environment.endsWith(join('yumoframe', 'venvs', 'funasr', '0.1.0')), true);
  assert.equal(environment.includes(join('runtime', 'processors')), false);

  const invocation = transcribeInvocation({
    root: '/tmp/project',
    config: {
      runtimeVersion: '0.1.0',
      paths: {media: 'assets/input.mp4', transcript: 'transcript.json'},
      processors: {asr: {type: 'builtin', options: {device: 'cpu', hotwords: '复读 20', maxSegmentMs: 12000}}},
    },
    outputBase: '/tmp/project/.transcript-tmp',
  });
  assert.equal(invocation.command, 'uv');
  assert.equal(invocation.env.UV_PROJECT_ENVIRONMENT, environment);
  assert.ok(invocation.args.includes('--locked'));
  assert.ok(invocation.args.includes('12000'));
});

test('eject copies the template and switches config to local', () => {
  const parent = mkdtempSync(join(tmpdir(), 'yumoframe-eject-'));
  const root = initProject({dir: join(parent, 'project'), template: 'comedy-text'});
  ejectProject(root);
  const config = json(join(root, 'yumoframe.config.json'));
  assert.equal(config.templateSource, 'local');
  assert.equal(config.templatePath, 'templates/comedy-text');
  assert.equal(existsSync(join(root, config.templatePath, 'src', 'index.tsx')), true);
  assert.equal(existsSync(join(root, config.templatePath, 'node_modules')), false);
  assert.throws(() => ejectProject(root), /already exists/);
});

test('doctor and template listing expose required runtime capabilities', () => {
  assert.deepEqual(listTemplates(), ['comedy-text']);
  assert.deepEqual(doctorChecks(() => '/mock/bin/tool').map((check) => check.name), ['node', 'uv', 'ffmpeg', 'comedy-text', 'funasr']);
  assert.ok(doctorChecks(() => null).some((check) => check.ok === false));
});
