import type { TemplateAdapter, TemplateInitialFiles } from "@yumoframe/cli/templates/types";
import { resolveChatBubbles, validateChatBubbles, validateResolvedChatBubbles } from "./command.ts";

function createInitialFiles(): TemplateInitialFiles {
  return {
    "storyboard.json": {
      version: "0.1.0",
      template: "chat-bubbles",
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
          pauseAfterMs: 500,
        },
        { id: "message-002", speaker: "me", type: "text", text: "刚准备出门。", pauseAfterMs: 900 },
      ],
    },
    "project.json": {
      version: "0.1.0",
      template: "chat-bubbles",
      composition: { width: 1080, height: 1920, fps: 30, duration: 1, background: "#F4F1EA" },
      layout: { maxVisible: 6, rowHeight: 184, bubbleMaxWidth: 720, gap: 22 },
      participants: [],
      messages: [],
      scrollStates: [],
    },
  };
}

export const chatBubblesAdapter: TemplateAdapter = {
  id: "chat-bubbles",
  createInitialFiles,
  resolve: resolveChatBubbles,
  validate: validateChatBubbles,
  validateResolved: validateResolvedChatBubbles,
};
