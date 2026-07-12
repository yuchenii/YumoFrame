#!/usr/bin/env node
/**
 * YumoFrame CLI entry: Commander program wiring for init, resolve, studio, render, and related commands.
 */
import {realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Argument, Command, Option} from 'commander';
import {devProject} from './commands/dev.js';
import {doctorChecks, listTemplates} from './commands/doctor.js';
import {ejectProject} from './commands/eject.js';
import {initProject} from './commands/init.js';
import {layoutProject} from './commands/layout.js';
import {renderProject} from './commands/render.js';
import {transcribeProject} from './commands/transcribe.js';
import {resolveProject} from './commands/resolve.js';
import {syncProjectFiles, type SyncTarget} from './commands/sync.js';
import {validateCurrentProject} from './commands/validate.js';

/** Installed package / CLI version string. */
export const VERSION = '0.1.0';

/** Run validation for the current project and print OK or throw aggregated errors. */
function printValidation(): void {
  const errors = validateCurrentProject();
  if (errors.length) throw new Error(errors.map((error) => `- ${error}`).join('\n'));
  console.log('OK');
}

/**
 * Build the full `yumoframe` Commander program with all subcommands.
 * @returns Configured program (not yet parsed).
 */
export function createProgram(): Command {
  const program = new Command()
    .name('yumoframe')
    .description('Create, review, preview, and render structured YumoFrame video projects.')
    .version(VERSION, '-v, --version', 'display the installed version')
    .addHelpText('after', `
Typical workflows:
  Text:  init -> lines.json -> storyboard.json -> resolve -> validate -> studio
  Media: init -> transcribe -> review/sync transcript -> author (no clocks) -> resolve (auto-align) -> validate -> studio
  Render only after reviewing the studio preview: yumoframe render

Run "yumoframe help <command>" for command-specific usage.`);

  program
    .command('init')
    .description('create a data-only YumoFrame project')
    .argument('<dir>', 'new project directory')
    .addOption(new Option('-t, --template <name>', 'project template').choices(['comedy-text']).default('comedy-text'))
    .addHelpText('after', `
Example:
  yumoframe init comedy-001 --template comedy-text`)
    .action((dir: string, options: {template: string}) => {
      const root = initProject({dir, template: options.template});
      console.log(`Initialized ${root}`);
    });

  program
    .command('transcribe')
    .description('transcribe config.paths.media and extract the original voice track')
    .addHelpText('after', `
Input and outputs are read from yumoframe.config.json:
  paths.media        source audio/video
  paths.transcript   timestamped ASR JSON
  paths.transcriptMd human-reviewable transcript
  paths.voice        extracted original voice track`)
    .action(async () => {
      const result = await transcribeProject();
      console.log(`Wrote ${result.transcriptPath}, ${result.transcriptMdPath}, and ${result.voicePath}`);
    });

  program
    .command('resolve')
    .description('compile storyboard.json into project.json and project.md')
    .option('--no-align', 'keep authored line clocks; skip transcript alignment')
    .addHelpText('after', `
By default, if transcript.json exists, line start/end are overwritten from the ASR char timeline.
AI should author text/breaks/scenes only — not invent clocks for media projects.
Use --no-align for text-only timing or deliberate manual clocks.`)
    .action((options: {align: boolean}) => {
      // Commander default for --no-align is align=true; map that to auto-when-transcript.
      const align: false | 'auto' = options.align === false ? false : 'auto';
      const result = resolveProject(process.cwd(), {align});
      for (const warning of result.warnings ?? []) console.warn(`warn: ${warning}`);
      if (result.aligned) console.log('Aligned line times from transcript.json');
      console.log(`Resolved ${result.path}`);
      console.log(`Wrote ${result.storyboardPath}`);
      if (result.linesPath) console.log(`Wrote ${result.linesPath}`);
      console.log(`Wrote ${result.projectMdPath}`);
    });

  program
    .command('sync')
    .description('apply reviewed Markdown edits back to machine-readable project files')
    .addArgument(new Argument('[target]', 'layer to sync').choices(['all', 'transcript', 'project']).default('all'))
    .addHelpText('after', `
Targets:
  transcript  apply transcript.md corrections without changing ASR clocks
  project     rebuild storyboard/project from project.md; aligns when transcript.json exists
  all         sync transcript first, then project`)
    .action((target: SyncTarget) => {
      // Expand "all" into ordered steps; transcript before project so align sees cleaned text.
      const results = syncProjectFiles(process.cwd(), target === 'all' ? ['transcript', 'project'] : [target]);
      if (results.transcript) {
        console.log(`Synced transcript → ${results.transcript.transcriptPath} (${results.transcript.segments} segments)`);
        console.log(`Wrote ${results.transcript.transcriptMdPath}`);
      }
      if (results.project) {
        for (const warning of results.project.warnings ?? []) console.warn(`warn: ${warning}`);
        console.log(`Synced project → ${results.project.projectPath} (${results.project.lineCount} lines, ${results.project.sceneCount} scenes)`);
        console.log(`Wrote ${results.project.storyboardPath}`);
        console.log(`Wrote ${results.project.linesPath}`);
        console.log(`Wrote ${results.project.projectMdPath}`);
      }
    });

  program
    .command('validate')
    .description('validate authoring files, resolved project data, and referenced assets')
    .action(printValidation);

  program
    .command('studio')
    .alias('dev')
    .description('validate the project, then open the Remotion studio preview')
    .action(() => devProject());

  program
    .command('layout')
    .description('write the configured SVG layout preview')
    .action(() => {
      const result = layoutProject();
      console.log(`Wrote ${result.outputPath}`);
    });

  program
    .command('render')
    .description('validate the project, then render the configured composition and output')
    .addHelpText('after', '\nReview the studio preview before rendering a final video.')
    .action(() => renderProject());

  program
    .command('eject')
    .description('copy the packaged template into the current project for local customization')
    .action(() => console.log(`Ejected ${ejectProject()}`));

  program
    .command('templates')
    .description('list packaged template names')
    .action(() => console.log(listTemplates().join('\n')));

  program
    .command('doctor')
    .description('check required executables, templates, and processors')
    .action(() => {
      const checks = doctorChecks();
      for (const check of checks) console.log(`${check.ok ? 'OK' : 'MISSING'} ${check.name}: ${check.detail}`);
      if (checks.some((check) => !check.ok)) process.exitCode = 1;
    });

  program.action(() => program.outputHelp());
  return program;
}

/**
 * Parse argv and run the CLI.
 * @param args - Arguments after the node/script path (defaults to `process.argv.slice(2)`).
 * @returns Promise that resolves when Commander finishes parsing.
 */
export function main(args = process.argv.slice(2)): Promise<Command> {
  return createProgram().parseAsync(args, {from: 'user'});
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(resolve(process.argv[1]))) {
  // Direct node/bin entry only; skip when imported as a library.
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
