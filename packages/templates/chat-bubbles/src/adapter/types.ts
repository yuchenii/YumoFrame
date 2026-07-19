/** Template-owned chat-bubbles authoring and render contracts. */
export interface ChatParticipant {
  id: string;
  name: string;
  side: "left" | "right";
  avatar?: string;
}

export interface ChatMessage {
  id: string;
  speaker: string;
  type: "text";
  text: string;
  start?: number;
  end?: number;
  durationMs?: number;
  pauseAfterMs?: number;
}

export interface ChatBubblesStoryboard {
  version: string;
  template: "chat-bubbles";
  participants: ChatParticipant[];
  messages: ChatMessage[];
}

export interface ResolvedChatMessage extends ChatMessage {
  start: number;
  end: number;
  pauseAfter: number;
  participantName: string;
  side: "left" | "right";
  avatar?: string;
  layout: { order: number; row: number; scrollOffset: number };
}

export interface ChatBubblesProject {
  version: string;
  template: "chat-bubbles";
  composition: { width: number; height: number; fps: number; duration: number; background: string };
  layout: { maxVisible: number; rowHeight: number; bubbleMaxWidth: number; gap: number };
  participants: ChatParticipant[];
  messages: ResolvedChatMessage[];
  scrollStates: Array<{ at: number; offset: number }>;
  audio?: { voice: { src: string; start: number; volume: number; source: string } };
}
