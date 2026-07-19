export type ChatBubblesProject = {
  version: string;
  template: "chat-bubbles";
  composition: { width: number; height: number; fps: number; duration: number; background: string };
  layout: { maxVisible: number; rowHeight: number; bubbleMaxWidth: number; gap: number };
  participants: Array<{ id: string; name: string; side: "left" | "right"; avatar?: string }>;
  messages: Array<{
    id: string;
    speaker: string;
    type: "text";
    text: string;
    start: number;
    end: number;
    pauseAfter: number;
    participantName: string;
    side: "left" | "right";
    avatar?: string;
    layout: { order: number; row: number; scrollOffset: number };
  }>;
  scrollStates: Array<{ at: number; offset: number }>;
  audio?: { voice?: { src: string; start: number; volume: number; source: string } };
};
