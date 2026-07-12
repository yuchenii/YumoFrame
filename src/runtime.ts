/**
 * Remotion template resolution and invocation: locate browsers, build CLI args, run studio/render.
 */
import {spawn, type SpawnOptions} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {homedir, platform} from 'node:os';
import {fileURLToPath} from 'node:url';
import {basename, dirname, resolve} from 'node:path';
import type {YumoFrameConfig} from './types.js';

/** Absolute path to the YumoFrame package root (parent of `src/`). */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/** Resolve the installed `@remotion/cli` entry script. */
function resolveRemotionCli(): string {
  return resolve(dirname(require.resolve('@remotion/cli/package.json')), 'remotion-cli.js');
}

/** OS-specific cache directory for Remotion browser downloads. */
function remotionCacheDir(): string {
  // Mirror Remotion's usual OS cache roots under a yumoframe-scoped path.
  const cache = platform() === 'win32'
    ? process.env.LOCALAPPDATA || resolve(homedir(), 'AppData', 'Local')
    : platform() === 'darwin'
      ? resolve(homedir(), 'Library', 'Caches')
      : process.env.XDG_CACHE_HOME || resolve(homedir(), '.cache');
  return resolve(cache, 'yumoframe', 'remotion', '0.1.0');
}

/** Recursively find `chrome-headless-shell` under a Remotion download tree. */
function findBrowser(directory: string): string | null {
  if (!existsSync(directory)) return null;
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      const found: string | null = findBrowser(path);
      if (found) return found;
    } else if (entry.name === (platform() === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell')) {
      return path;
    }
  }
  return null;
}

/** Prefer well-known system Chrome/Chromium/Edge install paths when headless-shell is unavailable. */
function findSystemBrowser(): string | null {
  // Ordered by likelihood; first existing path wins.
  const candidates = platform() === 'darwin'
    ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      ]
    : platform() === 'win32'
      ? [
          resolve(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          resolve(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        ]
      : ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find(existsSync) || null;
}

/** Spawn a child process and reject on non-zero exit or signal. */
function runChild(executable: string, args: string[], options: SpawnOptions): Promise<void> {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(executable, args, options);
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) reject(new Error(`${basename(executable)} terminated by ${signal}`));
      else if (code !== 0) reject(new Error(`${basename(executable)} exited with code ${code}`));
      else resolvePromise();
    });
  });
}

/**
 * Ensure a Chromium executable is available for Remotion (env override, cache, download, or system).
 * @returns Browser path and Chrome mode string for Remotion flags.
 */
async function ensureRuntimeBrowser(remotionCli: string): Promise<{path: string; mode: string}> {
  const configuredBrowser = process.env.YUMOFRAME_BROWSER_EXECUTABLE;
  if (configuredBrowser) {
    if (!existsSync(configuredBrowser)) throw new Error(`YUMOFRAME_BROWSER_EXECUTABLE not found: ${configuredBrowser}`);
    return {path: configuredBrowser, mode: process.env.YUMOFRAME_CHROME_MODE || 'headless-shell'};
  }
  const cache = remotionCacheDir();
  const downloadRoot = resolve(cache, '.remotion', 'chrome-headless-shell');
  let browser = findBrowser(downloadRoot);
  if (browser) return {path: browser, mode: 'headless-shell'};

  // Dev checkout may already have a Remotion-downloaded browser under the template.
  const developmentBrowser = findBrowser(resolve(PACKAGE_ROOT, 'runtime', 'templates', 'comedy-text', 'node_modules', '.remotion'));
  if (developmentBrowser) return {path: developmentBrowser, mode: 'headless-shell'};

  mkdirSync(cache, {recursive: true});
  try {
    await runChild(process.execPath, [remotionCli, 'browser', 'ensure'], {cwd: cache, env: process.env, stdio: 'inherit'});
  } catch (error) {
    // Remotion may leave a zip even when ensure exits non-zero; continue to extract.
    if (!existsSync(downloadRoot) || !readdirSync(downloadRoot).some((name) => name.endsWith('.zip'))) throw error;
  }
  browser = findBrowser(downloadRoot);
  if (browser) return {path: browser, mode: 'headless-shell'};

  const archive = readdirSync(downloadRoot).find((name) => name.endsWith('.zip'));
  if (archive) {
    const archivePath = resolve(downloadRoot, archive);
    // Zip name encodes platform/arch; unpack into that subdir for Remotion's layout.
    const platformDirectory = resolve(downloadRoot, archive.replace(/^chrome-headless-shell-/, '').replace(/\.zip$/, ''));
    mkdirSync(platformDirectory, {recursive: true});
    if (platform() === 'win32') {
      await runChild('powershell.exe', ['-NoProfile', '-Command', 'Expand-Archive', '-LiteralPath', archivePath, '-DestinationPath', platformDirectory, '-Force'], {stdio: 'inherit'});
    } else {
      await runChild('unzip', ['-q', '-o', archivePath, '-d', platformDirectory], {stdio: 'inherit'});
    }
    browser = findBrowser(downloadRoot);
    if (browser) return {path: browser, mode: 'headless-shell'};
  }

  // Last resort: full Chrome install needs chrome-for-testing mode, not headless-shell.
  const systemBrowser = findSystemBrowser();
  if (systemBrowser) return {path: systemBrowser, mode: 'chrome-for-testing'};

  throw new Error('Remotion browser download completed without an executable; use Node.js 20/22 or install Chrome');
}

/**
 * Resolve the Remotion template directory from config (`runtime` package path or local eject).
 * @param config - Project config with `templateSource` / `template` / `templatePath`.
 * @param projectRoot - Absolute project root for local template paths.
 * @returns Absolute template directory.
 */
export function resolveTemplate(config: YumoFrameConfig, projectRoot: string): string {
  if (config.templateSource === 'local') {
    if (!config.templatePath) throw new Error('templatePath is required for a local template');
    return resolve(projectRoot, config.templatePath);
  }
  // Packaged template lives under the npm package, not the user project.
  return resolve(PACKAGE_ROOT, 'runtime', 'templates', config.template);
}

/** Inputs needed to build a Remotion studio or render invocation. */
export interface TemplateOptions {
  projectRoot: string;
  templateDir: string;
  composition: string;
  projectFile: string;
  output?: string;
  remotionCli?: string;
  dependencyNodeModules?: string;
  browserExecutable?: string;
  chromeMode?: string;
}

/** Spawnable Remotion CLI invocation (node + args + cwd/env). */
export interface TemplateInvocation {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

/**
 * Build the node/Remotion CLI args for studio (`dev`) or `render` without spawning.
 * @param command - `"dev"` opens studio; `"render"` writes a video file.
 * @param options - Paths and optional browser overrides.
 * @returns Invocation object suitable for `spawn`.
 */
export function templateInvocation(command: 'dev' | 'render', options: TemplateOptions): TemplateInvocation {
  const remotionCli = options.remotionCli || resolveRemotionCli();
  // Walk up from remotion-cli.js to the package's node_modules root for the template.
  const dependencyNodeModules = options.dependencyNodeModules || resolve(dirname(remotionCli), '..', '..');
  const args = command === 'render'
    ? [remotionCli, 'render', 'src/index.tsx', options.composition, options.output ?? '', '--props', options.projectFile]
    : [remotionCli, 'studio', 'src/index.tsx', '--props', options.projectFile];
  if (options.browserExecutable) args.push('--browser-executable', options.browserExecutable);
  if (options.chromeMode) args.push('--chrome-mode', options.chromeMode);
  // Avoid stale bundles when project.json / props change between runs.
  args.push('--bundle-cache=false');
  return {
    executable: process.execPath,
    args,
    cwd: options.templateDir,
    env: {
      ...process.env,
      // Template reads project assets relative to the user project, not cwd.
      YUMOFRAME_PROJECT: options.projectRoot,
      YUMOFRAME_NODE_MODULES: dependencyNodeModules,
    },
  };
}

/**
 * Ensure a browser, then run Remotion studio or render with inherited stdio.
 * @param command - `"dev"` or `"render"` (`render` requires `options.output`).
 * @param options - Template paths and composition settings.
 */
export async function runTemplate(command: 'dev' | 'render', options: TemplateOptions): Promise<void> {
  if (command === 'render') {
    if (!options.output) throw new Error('render output is required');
    mkdirSync(dirname(options.output), {recursive: true});
  }
  const remotionCli = resolveRemotionCli();
  const browser = await ensureRuntimeBrowser(remotionCli);
  const invocation = templateInvocation(command, {...options, remotionCli, browserExecutable: browser.path, chromeMode: browser.mode});
  return runChild(invocation.executable, invocation.args, {cwd: invocation.cwd, env: invocation.env, stdio: 'inherit'});
}
