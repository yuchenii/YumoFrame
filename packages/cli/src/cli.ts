#!/usr/bin/env node
/**
 * YumoFrame CLI entry: Commander program wiring for init, resolve, studio, render, and related commands.
 */
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Argument, Command, Option } from "commander";
import { devProject } from "./commands/dev.ts";
import { doctorChecks, listTemplates } from "./commands/doctor.ts";
import { ejectProject } from "./commands/eject.ts";
import { inspectProject } from "./commands/inspect.ts";
import { initProject } from "./commands/init.ts";
import { layoutProject } from "./commands/layout.ts";
import { renderProject } from "./commands/render.ts";
import { synthesizeCapabilities, synthesizeProject } from "./commands/synthesize.ts";
import { transcribeProject } from "./commands/transcribe.ts";
import { resolveProject } from "./commands/resolve.ts";
import { syncProjectFiles, type SyncTarget } from "./commands/sync.ts";
import { validateCurrentProject } from "./commands/validate.ts";
import { PACKAGE_ROOT } from "./core/package-root.ts";
import { listTemplateManifests, listTemplateRegistrations } from "./templates/registry.ts";

/** Installed package / CLI version string. */
export const VERSION = (
  JSON.parse(readFileSync(resolve(PACKAGE_ROOT, "package.json"), "utf8")) as { version: string }
).version;

/** Run validation for the current project and print OK or throw aggregated errors. */
function printValidation(): void {
  const errors = validateCurrentProject();
  if (errors.length) throw new Error(errors.map((error) => `- ${error}`).join("\n"));
  console.log("OK");
}

/**
 * Build the full `yumoframe` Commander program with all subcommands.
 * @returns Configured program (not yet parsed).
 */
export function createProgram(): Command {
  const program = new Command()
    .name("yumoframe")
    .description("Create, review, preview, and render structured YumoFrame video projects.")
    .version(VERSION, "-v, --version", "display the installed version")
    .addHelpText(
      "after",
      `
Typical workflows:
  Text:  init -> lines.json -> storyboard.json -> resolve -> validate -> studio
  Media: init -> transcribe -> review/sync transcript -> author (no clocks) -> resolve (auto-align) -> validate -> studio
  Render only after reviewing the studio preview: yumoframe render

Run "yumoframe help <command>" for command-specific usage.`,
    );

  program
    .command("init")
    .description("create a data-only YumoFrame project")
    .argument("<dir>", "new project directory")
    .addOption(
      new Option("-t, --template <name>", "project template")
        .choices(listTemplateRegistrations().map((item) => item.id))
        .default("rotating-flow"),
    )
    .option("-p, --preset <name>", "template visual preset")
    .addHelpText(
      "after",
      `
Example:
  yumoframe init video-001 --template rotating-flow`,
    )
    .action((dir: string, options: { template: string; preset?: string }) => {
      const root = initProject({ dir, template: options.template, preset: options.preset });
      console.log(`Initialized ${root}`);
    });

  program
    .command("transcribe")
    .description("transcribe config.paths.media and extract the original voice track")
    .addHelpText(
      "after",
      `
Input and outputs are read from yumoframe.config.json:
  paths.media        source audio/video
  paths.transcript   timestamped ASR JSON
  paths.transcriptMd human-reviewable transcript
  paths.voice        extracted original voice track`,
    )
    .action(async () => {
      const result = await transcribeProject();
      console.log(
        `Wrote ${result.transcriptPath}, ${result.transcriptMdPath}, and ${result.voicePath}`,
      );
    });

  program
    .command("synthesize")
    .alias("tts")
    .description("synthesize a voice track from text via the configured TTS processor")
    .option("--text <text>", "inline text to synthesize (overrides the input file)")
    .option("--input <file>", "text file to read (default: config.paths.ttsText or text.txt)")
    .option("--plan <file>", "reviewed speech.json delivery plan")
    .option("--capabilities", "print resolved TTS delivery capabilities as JSON and exit")
    .option("--out <file>", "project-local output audio path (default: config.paths.media)")
    .addHelpText(
      "after",
      `
Reads processors.tts from yumoframe.config.json:
  runner "uv"       bundled local processor, default: Qwen3-TTS 0.6B CustomVoice
  runner "api"      online HTTP TTS (native DashScope or OpenAI-compatible; set the key env)
  runner "command"  external CLI with {text}/{out}/{subs} placeholders, e.g. uvx edge-tts

Timing (skips ASR when possible):
  1. {subs} in the command → TTS subtitles become transcript.json directly
  2. speech.json fragments → one FunASR manifest alignment, then merge clocks + pauses
  3. whole audio → validated processors.align (default: FunASR fa-zh)
  4. rejected alignment → final-audio ASR; unavailable ASR → audio only`,
    )
    .action(
      async (options: {
        text?: string;
        input?: string;
        plan?: string;
        capabilities?: boolean;
        out?: string;
      }) => {
        if (options.capabilities) {
          console.log(JSON.stringify(synthesizeCapabilities(), null, 2));
          return;
        }
        const result = await synthesizeProject(options);
        console.log(JSON.stringify(result));
      },
    );

  program
    .command("resolve")
    .description("compile storyboard.json into project.json and project.md")
    .option("--no-align", "keep authored line clocks; skip transcript alignment")
    .addHelpText(
      "after",
      `
By default, if transcript.json exists, line start/end are overwritten from the ASR char timeline.
AI should author text/breaks/scenes only — not invent clocks for media projects.
Use --no-align for text-only timing or deliberate manual clocks.`,
    )
    .action((options: { align: boolean }) => {
      // Commander default for --no-align is align=true; map that to auto-when-transcript.
      const align: false | "auto" = options.align === false ? false : "auto";
      const result = resolveProject(process.cwd(), { align });
      for (const warning of result.warnings ?? []) console.warn(`warn: ${warning}`);
      if (result.aligned) console.log("Aligned line times from transcript.json");
      console.log(`Resolved ${result.path}`);
      if (result.storyboardPath) console.log(`Wrote ${result.storyboardPath}`);
      if (result.linesPath) console.log(`Wrote ${result.linesPath}`);
      if (result.projectMdPath) console.log(`Wrote ${result.projectMdPath}`);
    });

  program
    .command("sync")
    .description("apply reviewed Markdown edits back to machine-readable project files")
    .addArgument(
      new Argument("[target]", "layer to sync")
        .choices(["all", "transcript", "project"])
        .default("all"),
    )
    .addHelpText(
      "after",
      `
Targets:
  transcript  apply transcript.md corrections without changing ASR clocks
  project     rebuild storyboard/project from project.md; aligns when transcript.json exists
  all         sync transcript first, then project when the template supports it`,
    )
    .action((target: SyncTarget) => {
      // Pass the target as-is so `all` can skip unsupported project Markdown sync.
      const results = syncProjectFiles(process.cwd(), [target]);
      if (results.transcript) {
        console.log(
          `Synced transcript → ${results.transcript.transcriptPath} (${results.transcript.segments} segments)`,
        );
        console.log(`Wrote ${results.transcript.transcriptMdPath}`);
      }
      if (results.skippedProject) console.log(results.skippedProject);
      if (results.project) {
        for (const warning of results.project.warnings ?? []) console.warn(`warn: ${warning}`);
        console.log(
          `Synced project → ${results.project.projectPath} (${results.project.lineCount} lines, ${results.project.sceneCount} scenes)`,
        );
        console.log(`Wrote ${results.project.storyboardPath}`);
        if (results.project.linesPath) console.log(`Wrote ${results.project.linesPath}`);
        if (results.project.projectMdPath) console.log(`Wrote ${results.project.projectMdPath}`);
      }
    });

  program
    .command("validate")
    .description("validate authoring files, resolved project data, and referenced assets")
    .action(printValidation);

  program
    .command("studio")
    .alias("dev")
    .description("validate the project, then open the Remotion studio preview")
    .action(() => devProject());

  program
    .command("layout")
    .description("write the configured SVG layout preview")
    .action(() => {
      const result = layoutProject();
      console.log(`Wrote ${result.outputPath}`);
    });

  program
    .command("render")
    .description("validate the project, then render the configured composition and output")
    .addHelpText("after", "\nReview the studio preview before rendering a final video.")
    .action(() => renderProject());

  program
    .command("eject")
    .description("copy the packaged template into the current project for local customization")
    .action(() => console.log(`Ejected ${ejectProject()}`));

  program
    .command("templates")
    .description("list packaged template names")
    .option("--json", "print template manifests as JSON")
    .action((options: { json?: boolean }) => {
      console.log(
        options.json
          ? JSON.stringify(listTemplateManifests(), null, 2)
          : listTemplates().join("\n"),
      );
    });

  program
    .command("inspect")
    .description("print the resolved project and template context")
    .option("--json", "print machine-readable JSON")
    .action((options: { json?: boolean }) => {
      const result = inspectProject();
      if (!options.json) throw new Error("inspect currently requires --json");
      console.log(JSON.stringify(result, null, 2));
    });

  program
    .command("doctor")
    .description("check required executables, templates, and processors")
    .action(() => {
      const checks = doctorChecks();
      for (const check of checks)
        console.log(`${check.ok ? "OK" : "MISSING"} ${check.name}: ${check.detail}`);
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
  return createProgram().parseAsync(args, { from: "user" });
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
