/**
 * Shared layout constants for adapter (Node resolve) and Remotion (browser).
 * Keep a single source so column width / max font stay aligned.
 */

/** Content column width inside the 1080 frame; leftover sides stay as margin. */
export const MAX_BLOCK_WIDTH = 760;
/** Cap so ~3 CJK chars still sit at full size; longer lines shrink to fit the column. */
export const DEFAULT_MAX_LINE_FONT_SIZE = Math.floor(MAX_BLOCK_WIDTH / 3);
/** Default CSS line-height multiplier for kinetic text. */
export const DEFAULT_LINE_HEIGHT = 1.32;

/** Default kinetic text font stack (system UI + common CJK fallbacks). */
export const DEFAULT_FONT_FAMILY =
  "system-ui, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif";

/** Default CSS font-weight for kinetic text. */
export const DEFAULT_FONT_WEIGHT = 900;
