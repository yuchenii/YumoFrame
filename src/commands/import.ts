/** Re-export project.md → project sync as the `import` command entry point. */

/** Sync `project.md` into storyboard/lines/project artifacts (alias of `syncProject`). */
// CLI `import` is the same code path as `sync` project (see syncProject).
export {syncProject as importProjectMd} from './sync.js';
