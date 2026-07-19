import type { CenterLineProject } from "./types";

export const stubProject: CenterLineProject = {
  version: "0.1.0",
  template: "center-line",
  preset: "echo",
  composition: { width: 1080, height: 1920, fps: 30, duration: 4, background: "#0B0D12" },
  style: {
    background: "#0B0D12",
    textColor: "#F4F7FF",
    emphasisColor: "#8CD7FF",
    fontFamily: "system-ui",
    fontSize: 104,
    transition: "fade",
    historyLines: 4,
    echoOpacity: 0.2,
  },
  lines: [
    { id: "line-001", text: "第一句话", start: 0, end: 1.5, emphasis: [] },
    { id: "line-002", text: "第二句话", start: 1.5, end: 3.5, emphasis: ["第二句"] },
  ],
};
