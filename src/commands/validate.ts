/** Validate project authoring artifacts (lines, storyboard, project.md, project.json). */
import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {validateLinesDoc, validateProject, validateStoryboard} from '../comedy-text.js';
import {loadConfig} from '../config.js';
import {parseLinesDocument, parseProject, parseStoryboard} from '../json.js';
import {parseProjectMd, storyboardFromParsedMd, storyboardFromProject} from '../project-md.js';
import type {LinesDocument, Storyboard, YumoFrameConfig, YumoFrameProject} from '../types.js';

function pathOr(config: YumoFrameConfig, key: string, fallback: string): string {
  return config.paths?.[key] || fallback;
}

/**
 * Collect validation errors for available project layers without throwing.
 * @param start Directory to search upward for `yumoframe.config.json` (default: cwd).
 * @returns Deduplicated error messages (empty when valid).
 */
export function validateCurrentProject(start = process.cwd()): string[] {
  const {root, config} = loadConfig(start);
  const storyboardPath = resolve(root, pathOr(config, 'storyboard', 'storyboard.json'));
  const linesPath = resolve(root, pathOr(config, 'lines', 'lines.json'));
  const projectPath = resolve(root, config.paths.project);
  const projectMdPath = resolve(root, pathOr(config, 'projectMd', 'project.md'));
  const errors: string[] = [];

  if (existsSync(linesPath)) {
    errors.push(...validateLinesDoc(parseLinesDocument(readFileSync(linesPath, 'utf8'), linesPath)));
  }

  if (existsSync(storyboardPath)) {
    const storyboard = parseStoryboard(readFileSync(storyboardPath, 'utf8'), storyboardPath);
    errors.push(...validateStoryboard(storyboard));
  } else if (existsSync(projectMdPath)) {
    // No storyboard.json: validate structure from project.md with stub times.
    try {
      const parsed = parseProjectMd(readFileSync(projectMdPath, 'utf8'));
      const storyboard = storyboardFromParsedMd(parsed, {template: 'comedy-text'});
      let index = 0;
      for (const scene of storyboard.scenes) {
        for (const line of scene.lines) {
          if (typeof line.start !== 'number') {
            // Placeholder times so timing errors do not drown out structure issues.
            line.start = index;
            line.end = index + 0.4;
          }
          index += 1;
        }
      }
      errors.push(...validateStoryboard(storyboard).filter((error) => !error.includes('needs numeric start/end')));
    } catch (error) {
      errors.push(`project.md: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (existsSync(projectPath)) {
    const project = parseProject(readFileSync(projectPath, 'utf8'), projectPath);
    const fromProject = storyboardFromProject(project);
    // When storyboard is missing, still validate scenes recovered from project.json.
    if (fromProject.scenes.length > 0 && !existsSync(storyboardPath)) {
      errors.push(...validateStoryboard(fromProject));
    }
    errors.push(...validateProject(project, root));
  } else if (!existsSync(storyboardPath) && !existsSync(projectMdPath) && !existsSync(linesPath)) {
    errors.push('missing lines.json / storyboard.json / project.md / project.json');
  }

  // Deduplicate overlapping messages from multiple layers.
  return [...new Set(errors)];
}

/**
 * Validate the project and require a resolved `project.json` with scenes; throw on failure.
 * @param start Directory to search upward for `yumoframe.config.json` (default: cwd).
 */
export function assertCurrentProjectValid(start = process.cwd()): void {
  const errors = validateCurrentProject(start);
  const {root, config} = loadConfig(start);
  const projectPath = resolve(root, config.paths.project);
  // Preview/render need a resolved timeline, not just authoring files.
  if (!existsSync(projectPath)) {
    errors.push(`missing ${config.paths.project}; run yumoframe resolve first`);
  } else {
    const project = parseProject(readFileSync(projectPath, 'utf8'), projectPath);
    if (!project.timeline?.scenes?.length) errors.push(`${config.paths.project} has no resolved scenes; run yumoframe resolve first`);
  }
  if (errors.length) throw new Error(errors.map((error) => `- ${error}`).join('\n'));
}
