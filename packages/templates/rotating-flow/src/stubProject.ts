/** Local preview project for Vite and Remotion Studio development. */

import type { YumoFrameProject } from "./types";

/** Typed defaultProps before calculateMetadata loads a real project. */
export const stubProject: YumoFrameProject = {
  version: "0.1.0",
  template: "rotating-flow",
  endOverview: true,
  composition: {
    width: 1080,
    height: 1920,
    fps: 30,
    duration: 7.3,
    background: "#000000",
  },
  source: { type: "text", text: "让文字开始流动镜头旋转节奏推进最后拉远看见全局" },
  theme: {
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    textColor: "#FFFFFF",
    highlightColor: "#65F2A3",
    cursorColor: "#FFFFFF",
    dimCursorColor: "#7A7A7A",
  },
  timeline: {
    virtualCanvas: { width: 40000, height: 40000 },
    scenes: [
      {
        id: "scene-001",
        start: 0,
        end: 1.8,
        camera: { targetX: 20000, targetY: 1900, scale: 1, rotate: 0, ease: "spring" },
        elements: [
          {
            id: "text-001",
            type: "kinetic-text",
            x: 19718,
            y: 1717.84,
            width: 564,
            rotate: 0,
            scale: 1,
            fontSize: 128,
            lineHeight: 1.32,
            align: "right",
            enter: "typewriter-pop",
            exit: "fade-slide",
            lines: [
              { segments: [{ text: "让文字", highlight: false }], start: 0, end: 0.9 },
              {
                segments: [
                  { text: "开始", highlight: false },
                  { text: "流动", highlight: true },
                ],
                start: 0.9,
                end: 1.8,
              },
            ],
          },
        ],
      },
      {
        id: "scene-002",
        start: 2,
        end: 3.8,
        camera: { targetX: 20000, targetY: 2476.64, scale: 1, rotate: -90, ease: "spring" },
        elements: [
          {
            id: "text-002",
            type: "kinetic-text",
            x: 19718,
            y: 2294.48,
            width: 564,
            rotate: 90,
            scale: 1,
            fontSize: 128,
            lineHeight: 1.32,
            align: "left",
            enter: "typewriter-pop",
            exit: "fade-slide",
            lines: [
              {
                segments: [
                  { text: "镜头", highlight: false },
                  { text: "旋转", highlight: true },
                ],
                start: 2,
                end: 2.9,
              },
              { segments: [{ text: "节奏推进", highlight: false }], start: 2.9, end: 3.8 },
            ],
          },
        ],
      },
      {
        id: "scene-003",
        start: 4,
        end: 5.8,
        camera: { targetX: 19423.36, targetY: 2476.64, scale: 1, rotate: 0, ease: "spring" },
        elements: [
          {
            id: "text-003",
            type: "kinetic-text",
            x: 19141.36,
            y: 2294.48,
            width: 564,
            rotate: 0,
            scale: 1,
            fontSize: 128,
            lineHeight: 1.32,
            align: "right",
            enter: "typewriter-pop",
            exit: "fade-slide",
            lines: [
              {
                segments: [
                  { text: "最后", highlight: false },
                  { text: "拉远", highlight: true },
                ],
                start: 4,
                end: 4.9,
              },
              { segments: [{ text: "看见全局", highlight: false }], start: 4.9, end: 5.8 },
            ],
          },
        ],
      },
    ],
  },
};
