/** Local preview project for Vite and Remotion Studio development. */

import type { YumoFrameProject } from "./types";

/** Stub intro: what YumoFrame is, with natural 1–8 unit line lengths. */
export const stubProject: YumoFrameProject = {
  version: "0.1.0",
  template: "rotating-flow",
  endOverview: true,
  composition: {
    width: 1080,
    height: 1920,
    fps: 30,
    duration: 18,
    background: "#000000",
  },
  source: {
    type: "text",
    text: "YumoFrame是什么基于RemotionCLI工具用结构化数据做竖屏视频断行高亮分镜交给Agent预览满意再渲染模板可复用数据与代码分离这就是YumoFrame",
  },
  theme: {
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    textColor: "#FFFFFF",
    highlightColor: "#65F2A3",
    cursorColor: "#FFFFFF",
    dimCursorColor: "#7A7A7A",
  },
  timeline: {
    virtualCanvas: {
      width: 40000,
      height: 40000,
    },
    scenes: [
      {
        id: "scene-001",
        start: 0,
        end: 2,
        camera: {
          targetX: 20000,
          targetY: 1900,
          scale: 1,
          rotate: 0,
          ease: "spring",
        },
        elements: [
          {
            id: "text-001",
            type: "kinetic-text",
            x: 19620.5,
            y: 1643.26,
            width: 759,
            rotate: 0,
            scale: 1,
            fontSize: 253,
            lineHeight: 1.32,
            align: "right",
            enter: "typewriter-pop",
            exit: "fade-slide",
            lines: [
              {
                segments: [
                  {
                    text: "Yumo",
                    highlight: false,
                  },
                  {
                    text: "Frame",
                    highlight: true,
                  },
                ],
                start: 0,
                end: 1.2,
              },
              {
                segments: [
                  {
                    text: "是什么",
                    highlight: false,
                  },
                ],
                start: 1.2,
                end: 2,
              },
            ],
          },
        ],
      },
      {
        id: "scene-002",
        start: 2.3,
        end: 4.4,
        camera: {
          targetX: 20000,
          targetY: 2731.22,
          scale: 1,
          rotate: -90,
          ease: "spring",
        },
        elements: [
          {
            id: "text-002",
            type: "kinetic-text",
            x: 19620.5,
            y: 2529.92,
            width: 759,
            rotate: 90,
            scale: 1,
            fontSize: 253,
            lineHeight: 1.32,
            align: "left",
            enter: "typewriter-pop",
            exit: "fade-slide",
            lines: [
              {
                segments: [
                  {
                    text: "基于",
                    highlight: false,
                  },
                  {
                    text: "Remotion",
                    highlight: true,
                  },
                ],
                start: 2.3,
                end: 3.5,
              },
              {
                segments: [
                  {
                    text: "CLI工具",
                    highlight: false,
                  },
                ],
                start: 3.5,
                end: 4.4,
              },
            ],
          },
        ],
      },
      {
        id: "scene-003",
        start: 4.7,
        end: 7.1,
        camera: {
          targetX: 19223.72,
          targetY: 2731.22,
          scale: 1,
          rotate: 0,
          ease: "spring",
        },
        elements: [
          {
            id: "text-003",
            type: "kinetic-text",
            x: 18843.72,
            y: 2547.74,
            width: 760,
            rotate: 0,
            scale: 1,
            fontSize: 253,
            lineHeight: 1.32,
            align: "right",
            enter: "typewriter-pop",
            exit: "fade-slide",
            lines: [
              {
                segments: [
                  {
                    text: "用结构化数据",
                    highlight: false,
                  },
                ],
                start: 4.7,
                end: 5.9,
              },
              {
                segments: [
                  {
                    text: "做",
                    highlight: false,
                  },
                  {
                    text: "竖屏视频",
                    highlight: true,
                  },
                ],
                start: 5.9,
                end: 7.1,
              },
            ],
          },
        ],
      },
      {
        id: "scene-004",
        start: 7.4,
        end: 9.8,
        camera: {
          targetX: 19223.72,
          targetY: 3489.68,
          scale: 1,
          rotate: -90,
          ease: "spring",
        },
        elements: [
          {
            id: "text-004",
            type: "kinetic-text",
            x: 18843.72,
            y: 3308.18,
            width: 760,
            rotate: 90,
            scale: 1,
            fontSize: 253,
            lineHeight: 1.32,
            align: "left",
            enter: "typewriter-pop",
            exit: "fade-slide",
            lines: [
              {
                segments: [
                  {
                    text: "断行高亮分镜",
                    highlight: false,
                  },
                ],
                start: 7.4,
                end: 8.7,
              },
              {
                segments: [
                  {
                    text: "交给",
                    highlight: false,
                  },
                  {
                    text: "Agent",
                    highlight: true,
                  },
                ],
                start: 8.7,
                end: 9.8,
              },
            ],
          },
        ],
      },
      {
        id: "scene-005",
        start: 10.1,
        end: 11.8,
        camera: {
          targetX: 18467.24,
          targetY: 3489.68,
          scale: 1,
          rotate: 0,
          ease: "spring",
        },
        elements: [
          {
            id: "text-005",
            type: "kinetic-text",
            x: 18087.24,
            y: 3197.3,
            width: 760,
            rotate: 0,
            scale: 1,
            fontSize: 253,
            lineHeight: 1.32,
            align: "right",
            enter: "typewriter-pop",
            exit: "fade-slide",
            lines: [
              {
                segments: [
                  {
                    text: "预览满意",
                    highlight: false,
                  },
                ],
                start: 10.1,
                end: 11,
              },
              {
                segments: [
                  {
                    text: "再渲染",
                    highlight: false,
                  },
                ],
                start: 11,
                end: 11.8,
              },
            ],
          },
        ],
      },
      {
        id: "scene-006",
        start: 12.1,
        end: 14.6,
        camera: {
          targetX: 18467.24,
          targetY: 4357.04,
          scale: 1,
          rotate: -90,
          ease: "spring",
        },
        elements: [
          {
            id: "text-006",
            type: "kinetic-text",
            x: 18087.24,
            y: 4185.44,
            width: 760,
            rotate: 90,
            scale: 1,
            fontSize: 253,
            lineHeight: 1.32,
            align: "left",
            enter: "typewriter-pop",
            exit: "fade-slide",
            lines: [
              {
                segments: [
                  {
                    text: "模板可复用",
                    highlight: false,
                  },
                ],
                start: 12.1,
                end: 13.2,
              },
              {
                segments: [
                  {
                    text: "数据与代码分离",
                    highlight: false,
                  },
                ],
                start: 13.2,
                end: 14.6,
              },
            ],
          },
        ],
      },
      {
        id: "scene-007",
        start: 14.9,
        end: 16.4,
        camera: {
          targetX: 17722.66,
          targetY: 4357.04,
          scale: 1,
          rotate: 0,
          ease: "spring",
        },
        elements: [
          {
            id: "text-007",
            type: "kinetic-text",
            x: 17344.66,
            y: 4298.96,
            width: 756,
            rotate: 0,
            scale: 1,
            fontSize: 253,
            lineHeight: 1.32,
            align: "right",
            enter: "typewriter-pop",
            exit: "fade-slide",
            lines: [
              {
                segments: [
                  {
                    text: "这就是",
                    highlight: false,
                  },
                  {
                    text: "YumoFrame",
                    highlight: true,
                  },
                ],
                start: 14.9,
                end: 16.4,
              },
            ],
          },
        ],
      },
    ],
  },
};
