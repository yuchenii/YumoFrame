import assert from 'node:assert/strict';
import test from 'node:test';
import {alignStoryboardLines, buildCharTimeline, formatTranscriptTxt, parseCleanedTranscript} from '../dist/align.js';
import {formatProjectMd, markdownToSegments, parseProjectMd, segmentsToMarkdown} from '../dist/project-md.js';
import {resolveComedyText, sanitizeStoryboard, validateStoryboard} from '../dist/comedy-text.js';
import {applyTranscriptMd, formatTranscriptMd, parseTranscriptMd} from '../dist/transcript-md.js';
import {initProject} from '../dist/commands/init.js';
import {resolveProject} from '../dist/commands/resolve.js';
import {syncProject} from '../dist/commands/sync.js';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('transcript txt helpers still format clocks', () => {
  const transcript = {
    segments: [
      {start: 0.37, end: 1.39, text: '校长知道我要复读，'},
      {start: 1.39, end: 2.5, text: '亲自给我打电话'},
    ],
  };
  const txt = formatTranscriptTxt(transcript);
  assert.match(txt, /\[0000\.37-0001\.39\] 校长知道我要复读，/);
  assert.equal(parseCleanedTranscript(txt).length, 2);
});

test('transcript.md original/cleaned round-trip syncs into json', () => {
  const transcript = {
    segments: [
      {start: 0.37, end: 1.39, text: '校长知道我要复读，', timestamp: [[370, 1390]]},
      {start: 1.39, end: 2.5, text: '掌声', timestamp: [[1390, 2500]]},
    ],
  };
  const md = formatTranscriptMd({
    segments: transcript.segments.map((segment) => ({...segment, cleaned: segment.text})),
  });
  assert.match(md, /原文：校长知道我要复读，/);
  assert.match(md, /校对：校长知道我要复读，/);
  const edited = md.replace('校对：掌声', '校对：');
  const parsed = parseTranscriptMd(edited);
  const next = applyTranscriptMd(transcript, parsed);
  assert.equal(next.segments[0].cleaned, '校长知道我要复读，');
  assert.equal(next.segments[1].cleaned, '');
  assert.equal(next.segments[0].text, '校长知道我要复读，');
});

test('buildCharTimeline uses cleaned and skips empty', () => {
  const timeline = buildCharTimeline({
    segments: [
      {start: 0, end: 1, text: '原文甲', cleaned: '校对甲', timestamp: [[0, 500], [500, 1000], [1000, 1000]]},
      {start: 1, end: 2, text: '掌声', cleaned: ''},
      {start: 2, end: 3, text: '原文乙', cleaned: '校对乙'},
    ],
  });
  assert.ok(timeline.some((item) => item.char === '校'));
  assert.ok(!timeline.some((item) => item.char === '掌'));
});

test('markdown highlight segments round-trip', () => {
  assert.equal(segmentsToMarkdown([{text: '校长知道我要', highlight: false}, {text: '复读', highlight: true}]), '校长知道我要**复读**');
  assert.deepEqual(markdownToSegments('校长知道我要**复读**'), [
    {text: '校长知道我要', highlight: false},
    {text: '复读', highlight: true},
  ]);
});

test('project.md parse builds scenes tree', () => {
  const md = `# demo

## scene-001  0.37–1.39  rotate:0
- 校长知道我要 **复读**
- 亲自给我打电话

## scene-002  1.39–3.00  rotate:-90
- 问我原因
- 我不想让他知道
`;
  const parsed = parseProjectMd(md);
  assert.equal(parsed.scenes.length, 2);
  assert.deepEqual(parsed.scenes.map((scene) => scene.lines.length), [2, 2]);
  assert.equal(parsed.scenes[0].lines[0].segments.find((segment) => segment.highlight).text, '复读');
});

test('text-only project.md sync preserves existing line times', () => {
  const root = initProject({dir: join(mkdtempSync(join(tmpdir(), 'yumoframe-project-md-')), 'project'), template: 'comedy-text'});
  const storyboardPath = join(root, 'storyboard.json');
  const storyboard = JSON.parse(readFileSync(storyboardPath, 'utf8'));
  storyboard.scenes[0].lines[0].start = 1.25;
  storyboard.scenes[0].lines[0].end = 2.75;
  writeFileSync(storyboardPath, `${JSON.stringify(storyboard, null, 2)}\n`);
  resolveProject(root);

  const projectMdPath = join(root, 'project.md');
  writeFileSync(projectMdPath, readFileSync(projectMdPath, 'utf8').replace('示例', '改字'));
  const result = syncProject(root);
  const synced = JSON.parse(readFileSync(result.storyboardPath, 'utf8'));

  assert.equal(synced.scenes[0].lines[0].start, 1.25);
  assert.equal(synced.scenes[0].lines[0].end, 2.75);
  assert.ok(result.warnings.some((warning) => warning.includes('preserved existing line times')));
});

test('align assigns times from transcript char timeline', () => {
  const transcript = {
    segments: [{
      start: 0.37,
      end: 1.39,
      text: '校长知道我要复读',
      timestamp: [
        [370, 590], [590, 770], [770, 850], [850, 950],
        [950, 1030], [1030, 1130], [1130, 1230], [1230, 1390],
      ],
    }],
  };
  const timeline = buildCharTimeline(transcript);
  const {lines, warnings} = alignStoryboardLines([
    {segments: [{text: '校长知道我要', highlight: false}]},
    {segments: [{text: '复读', highlight: true}]},
  ], timeline);
  assert.equal(warnings.length, 0);
  assert.equal(lines[0].start, 0.37);
  assert.equal(lines[0].end, 1.13);
  assert.equal(lines[1].start, 1.13);
  assert.equal(lines[1].end, 1.39);
});

test('resolve uses nested scenes', () => {
  const storyboard = {
    version: '0.1.0',
    template: 'comedy-text',
    scenes: [
      {lines: [{start: 0, end: 1, segments: [{text: '第一句', highlight: false}]}]},
      {lines: [{start: 1, end: 2, segments: [{text: '第二句', highlight: false}]}]},
    ],
  };
  const project = resolveComedyText(storyboard, {render: {}});
  assert.equal(project.timeline.scenes.length, 2);
  const md = formatProjectMd(project, {title: 't'});
  assert.match(md, /## scene-001/);
});

test('validate rejects punctuation, tiny-line spam, and fragmented scenes', () => {
  const tiny = {
    version: '0.1.0',
    template: 'comedy-text',
    scenes: Array.from({length: 16}, (_, index) => ({
      lines: [{start: index, end: index + 0.2, segments: [{text: '字。', highlight: false}]}],
    })),
  };
  const errors = validateStoryboard(tiny);
  assert.ok(errors.some((error) => error.includes('punctuation')));
  assert.ok(errors.some((error) => error.includes('tiny lines')));
  assert.ok(errors.some((error) => error.includes('fragmented')));
});

test('sanitizeStoryboard strips punctuation', () => {
  const cleaned = sanitizeStoryboard({
    version: '0.1.0',
    template: 'comedy-text',
    scenes: [{lines: [{start: 0, end: 1, segments: [{text: '复读。', highlight: true}]}]}],
  });
  assert.equal(cleaned.scenes[0].lines[0].segments[0].text, '复读');
});

test('skill line-units script matches comedy-text lineUnits', async () => {
  const {spawnSync} = await import('node:child_process');
  const {mkdtempSync, writeFileSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {fileURLToPath} = await import('node:url');
  const {dirname, join} = await import('node:path');
  const {lineUnits, stripPunctuation} = await import('../dist/comedy-text.js');
  const script = join(dirname(fileURLToPath(import.meta.url)), '../runtime/skills/yumoframe-comedy-text/scripts/line-units.mjs');
  const samples = ['校长知道我要', 'ABC', '复读。'];
  for (const sample of samples) {
    const expected = lineUnits(stripPunctuation(sample));
    const result = spawnSync(process.execPath, [script, sample], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(Number(result.stdout.trim()), Math.round(expected * 10) / 10);
  }
  const fail = spawnSync(process.execPath, [script, '--check', '超过六个中文字'], {encoding: 'utf8'});
  assert.equal(fail.status, 1);

  const dir = mkdtempSync(join(tmpdir(), 'yumoframe-line-units-'));
  const linesPath = join(dir, 'lines.json');
  writeFileSync(linesPath, JSON.stringify({
    version: '0.1.0',
    template: 'comedy-text',
    lines: [
      {start: 0, end: 1, segments: [{text: '校长知道我要', highlight: false}]},
      {start: 1, end: 2, segments: [{text: '复读', highlight: true}]},
    ],
  }));
  const fileOk = spawnSync(process.execPath, [script, '--file', linesPath], {encoding: 'utf8'});
  assert.equal(fileOk.status, 0, fileOk.stderr + fileOk.stdout);
});
