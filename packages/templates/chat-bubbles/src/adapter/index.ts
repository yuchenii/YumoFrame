import { isAbsolute, normalize, sep } from "node:path";
import { isJsonRecord as isRecord, parseTemplateJsonObject } from "@yumoframe/cli/templates/json";
import type { ChatBubblesProject, ChatBubblesStoryboard } from "./types.ts";

export const parseChatBubblesStoryboard = (text: string, label: string): ChatBubblesStoryboard =>
  parseTemplateJsonObject(text, label);
export const parseChatBubblesProject = (text: string, label: string): ChatBubblesProject =>
  parseTemplateJsonObject(text, label);

export function validProjectRelativePath(path: string): boolean {
  const normalized = normalize(path);
  return !isAbsolute(path) && normalized !== ".." && !normalized.startsWith(`..${sep}`);
}

export function validateChatBubblesStoryboard(storyboard: ChatBubblesStoryboard): string[] {
  const errors: string[] = [];
  if (typeof storyboard.version !== "string" || !storyboard.version)
    errors.push("version must be a non-empty string");
  if (storyboard.template !== "chat-bubbles") errors.push("template must be chat-bubbles");

  const participantIds = new Set<string>();
  if (!Array.isArray(storyboard.participants) || storyboard.participants.length === 0) {
    errors.push("participants must be a non-empty array");
  } else {
    storyboard.participants.forEach((participant, index) => {
      const at = `participants[${index}]`;
      if (!isRecord(participant)) return errors.push(`${at} must be an object`);
      if (typeof participant.id !== "string" || !participant.id)
        errors.push(`${at}.id must be a non-empty string`);
      else if (participantIds.has(participant.id)) errors.push(`${at}.id must be unique`);
      else participantIds.add(participant.id);
      if (typeof participant.name !== "string" || !participant.name.trim())
        errors.push(`${at}.name must be non-empty`);
      if (participant.side !== "left" && participant.side !== "right")
        errors.push(`${at}.side must be left or right`);
      if (
        participant.avatar !== undefined &&
        (typeof participant.avatar !== "string" ||
          !participant.avatar ||
          !validProjectRelativePath(participant.avatar))
      ) {
        errors.push(`${at}.avatar must be a project-relative path`);
      }
    });
  }

  const messageIds = new Set<string>();
  let previousEnd = 0;
  if (!Array.isArray(storyboard.messages) || storyboard.messages.length === 0) {
    errors.push("messages must be a non-empty array");
  } else {
    storyboard.messages.forEach((message, index) => {
      const at = `messages[${index}]`;
      if (!isRecord(message)) return errors.push(`${at} must be an object`);
      if (typeof message.id !== "string" || !message.id)
        errors.push(`${at}.id must be a non-empty string`);
      else if (messageIds.has(message.id)) errors.push(`${at}.id must be unique`);
      else messageIds.add(message.id);
      if (typeof message.speaker !== "string" || !participantIds.has(message.speaker))
        errors.push(`${at}.speaker must reference a participant`);
      if (message.type !== "text") errors.push(`${at}.type only supports text in v1`);
      if (typeof message.text !== "string" || !message.text.trim())
        errors.push(`${at}.text must be non-empty`);
      const hasStart = typeof message.start === "number" && Number.isFinite(message.start);
      const hasEnd = typeof message.end === "number" && Number.isFinite(message.end);
      if (hasStart !== hasEnd) errors.push(`${at} needs both start and end`);
      if (hasStart && hasEnd) {
        if (message.start! < 0 || message.end! <= message.start!)
          errors.push(`${at} must have non-negative, positive timing`);
        if (message.start! < previousEnd)
          errors.push(`${at}.start must not overlap the previous message`);
        previousEnd = message.end!;
      }
      if (
        message.durationMs !== undefined &&
        (!Number.isFinite(message.durationMs) || message.durationMs <= 0)
      )
        errors.push(`${at}.durationMs must be positive`);
      if (hasStart && message.durationMs !== undefined)
        errors.push(`${at} cannot combine start/end with durationMs`);
      if (
        message.pauseAfterMs !== undefined &&
        (!Number.isFinite(message.pauseAfterMs) || message.pauseAfterMs < 0)
      )
        errors.push(`${at}.pauseAfterMs must be non-negative`);
    });
  }
  return errors;
}

export function validateChatBubblesProject(project: ChatBubblesProject): string[] {
  const errors: string[] = [];
  if (project.template !== "chat-bubbles") errors.push("project template must be chat-bubbles");
  if (!Array.isArray(project.participants)) errors.push("project participants must be an array");
  if (!Array.isArray(project.messages)) errors.push("project messages must be an array");
  else if (
    project.messages.some((message) => {
      if (!isRecord(message)) return true;
      return (
        message.type !== "text" ||
        !Number.isFinite(message.start) ||
        !Number.isFinite(message.end) ||
        Number(message.end) <= Number(message.start)
      );
    })
  )
    errors.push("project messages must be resolved text messages with positive timing");
  if (!Number.isFinite(project.composition?.duration) || project.composition.duration <= 0)
    errors.push("composition.duration must be positive");
  if (!Number.isInteger(project.layout?.maxVisible) || project.layout.maxVisible <= 0)
    errors.push("layout.maxVisible must be a positive integer");
  if (!Array.isArray(project.scrollStates)) errors.push("scrollStates must be an array");
  return errors;
}
