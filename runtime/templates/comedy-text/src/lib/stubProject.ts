/**
 * Minimal typed stub project for Remotion defaultProps and Vite preview.
 */

import type { YumoFrameProject } from '../types';

/** Typed defaultProps before calculateMetadata loads the real work. */
export const stubProject: YumoFrameProject = {
  version: '0.1.0',
  template: 'comedy-text',
  composition: {
    width: 1080,
    height: 1920,
    fps: 30,
    duration: 1,
    background: '#000000',
  },
  source: { type: 'text', text: '' },
  theme: {
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    textColor: '#FFFFFF',
    highlightColor: '#65F2A3',
    cursorColor: '#FFFFFF',
    dimCursorColor: '#7A7A7A',
  },
  timeline: {
    // Oversized world; autoLayout places blocks far from the origin.
    virtualCanvas: { width: 40000, height: 40000 },
    scenes: [],
  },
};
