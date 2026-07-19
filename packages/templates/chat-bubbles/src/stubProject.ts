import type { ChatBubblesProject } from "./types";

export const stubProject: ChatBubblesProject = {
  version: "0.1.0",
  template: "chat-bubbles",
  composition: { width: 1080, height: 1920, fps: 30, duration: 5, background: "#F4F1EA" },
  layout: { maxVisible: 6, rowHeight: 184, bubbleMaxWidth: 720, gap: 22 },
  participants: [
    { id: "friend", name: "朋友", side: "left" },
    { id: "me", name: "我", side: "right" },
  ],
  messages: [
    {
      id: "message-001",
      speaker: "friend",
      type: "text",
      text: "你到哪了？",
      start: 0,
      end: 1.4,
      pauseAfter: 0.5,
      participantName: "朋友",
      side: "left",
      layout: { order: 0, row: 0, scrollOffset: 0 },
    },
    {
      id: "message-002",
      speaker: "me",
      type: "text",
      text: "刚准备出门。",
      start: 1.9,
      end: 3.5,
      pauseAfter: 0.9,
      participantName: "我",
      side: "right",
      layout: { order: 1, row: 1, scrollOffset: 0 },
    },
  ],
  scrollStates: [
    { at: 0, offset: 0 },
    { at: 1.9, offset: 0 },
  ],
};
