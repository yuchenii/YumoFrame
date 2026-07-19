import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { alignStoryboardLines, buildCharTimeline } from "@yumoframe/cli/media/align";
import { parseTranscript } from "@yumoframe/cli/core/json";
import type { TemplateCommandContext, TemplateResolveResult } from "@yumoframe/cli/templates/types";
import {
  parseChatBubblesProject,
  parseChatBubblesStoryboard,
  validateChatBubblesProject,
  validateChatBubblesStoryboard,
} from "./index.ts";
import type { ChatBubblesProject, ChatBubblesStoryboard, ChatMessage } from "./types.ts";

const DEFAULT_PAUSE_MS = 400;
const MAX_VISIBLE = 6;
const ROW_HEIGHT = 184;
const pathOr = (context: TemplateCommandContext, key: string, fallback: string) =>
  context.config.paths[key] || fallback;
const round = (value: number): number => Math.round(value * 1000) / 1000;
const defaultDuration = (text: string): number =>
  Math.min(4, Math.max(1.2, [...text].length * 0.14));

function resolveTextTiming(messages: ChatMessage[]): ChatMessage[] {
  let cursor = 0;
  return messages.map((message) => {
    const pause = (message.pauseAfterMs ?? DEFAULT_PAUSE_MS) / 1000;
    if (Number.isFinite(message.start) && Number.isFinite(message.end)) {
      if (message.start! < cursor)
        throw new Error(
          `message ${message.id} starts before the previous message and pause finish`,
        );
      cursor = Math.max(cursor, message.end!) + pause;
      return message;
    }
    const start = cursor;
    const end =
      start +
      (message.durationMs === undefined
        ? defaultDuration(message.text)
        : message.durationMs / 1000);
    cursor = end + pause;
    return { ...message, start: round(start), end: round(end) };
  });
}

function missingAvatarErrors(
  context: TemplateCommandContext,
  storyboard: ChatBubblesStoryboard,
): string[] {
  if (!Array.isArray(storyboard.participants)) return [];
  return storyboard.participants.flatMap((participant, index) => {
    if (
      !participant ||
      typeof participant !== "object" ||
      Array.isArray(participant) ||
      typeof participant.avatar !== "string"
    )
      return [];
    const path = resolve(context.projectRoot, participant.avatar);
    return !existsSync(path) || !statSync(path).isFile()
      ? [`participants[${index}].avatar not found: ${participant.avatar}`]
      : [];
  });
}

export function resolveChatBubbles(
  context: TemplateCommandContext,
  { align = "auto" }: { align?: boolean | "auto" } = {},
): TemplateResolveResult {
  const storyboardPath = resolve(
    context.projectRoot,
    pathOr(context, "storyboard", "storyboard.json"),
  );
  const projectPath = resolve(context.projectRoot, context.config.paths.project);
  const transcriptPath = resolve(context.projectRoot, context.config.paths.transcript);
  if (!existsSync(storyboardPath)) throw new Error(`Missing ${storyboardPath}`);
  let storyboard = parseChatBubblesStoryboard(readFileSync(storyboardPath, "utf8"), storyboardPath);
  const initialErrors = [
    ...validateChatBubblesStoryboard(storyboard),
    ...missingAvatarErrors(context, storyboard),
  ];
  if (initialErrors.length) throw new Error(initialErrors.map((error) => `- ${error}`).join("\n"));

  const warnings: string[] = [];
  const shouldAlign = align === true || (align === "auto" && existsSync(transcriptPath));
  let transcriptDuration = 0;
  if (align === true && !existsSync(transcriptPath))
    warnings.push("transcript.json missing; used text timing");
  if (shouldAlign && existsSync(transcriptPath)) {
    const transcript = parseTranscript(readFileSync(transcriptPath, "utf8"), transcriptPath);
    transcriptDuration =
      Number(transcript.duration) ||
      Math.max(0, ...transcript.segments.map((segment) => segment.end));
    const aligned = alignStoryboardLines(
      storyboard.messages.map((message) => ({ ...message, segments: [{ text: message.text }] })),
      buildCharTimeline(transcript),
    );
    storyboard = {
      ...storyboard,
      messages: aligned.lines.map(({ segments: _segments, ...message }) => message),
    };
    warnings.push(...aligned.warnings);
  } else {
    storyboard = { ...storyboard, messages: resolveTextTiming(storyboard.messages) };
  }
  const missingTiming = storyboard.messages.flatMap((message, index) =>
    Number.isFinite(message.start) && Number.isFinite(message.end)
      ? []
      : [`messages[${index}] could not be aligned to transcript timing`],
  );
  if (missingTiming.length) throw new Error(missingTiming.map((error) => `- ${error}`).join("\n"));

  const participants = new Map(
    storyboard.participants.map((participant) => [participant.id, participant]),
  );
  const messages = storyboard.messages.map((message, order) => {
    const participant = participants.get(message.speaker)!;
    const scrollOffset = Math.max(0, (order + 1 - MAX_VISIBLE) * ROW_HEIGHT);
    return {
      ...message,
      start: message.start!,
      end: message.end!,
      pauseAfter: (message.pauseAfterMs ?? DEFAULT_PAUSE_MS) / 1000,
      participantName: participant.name,
      side: participant.side,
      ...(participant.avatar ? { avatar: participant.avatar } : {}),
      layout: { order, row: order, scrollOffset },
    };
  });
  const last = messages.at(-1)!;
  const duration = Math.max(1, transcriptDuration, last.end + last.pauseAfter + 0.6);
  const project: ChatBubblesProject = {
    version: "0.1.0",
    template: "chat-bubbles",
    composition: {
      width: context.config.render.width ?? 1080,
      height: context.config.render.height ?? 1920,
      fps: context.config.render.fps ?? 30,
      duration,
      background: "#F4F1EA",
    },
    layout: { maxVisible: MAX_VISIBLE, rowHeight: ROW_HEIGHT, bubbleMaxWidth: 720, gap: 22 },
    participants: storyboard.participants,
    messages,
    scrollStates: messages.map((message) => ({
      at: message.start,
      offset: message.layout.scrollOffset,
    })),
  };
  const voicePath = resolve(context.projectRoot, context.config.paths.voice);
  if (existsSync(voicePath)) {
    const source =
      context.config.processors.tts && context.config.paths.voice === context.config.paths.media
        ? "tts"
        : "user";
    project.audio = { voice: { src: context.config.paths.voice, start: 0, volume: 1, source } };
  }
  writeFileSync(projectPath, `${JSON.stringify(project, null, 2)}\n`);
  return {
    path: projectPath,
    storyboardPath,
    project,
    warnings,
    aligned: shouldAlign && existsSync(transcriptPath),
  };
}

export function validateChatBubbles(context: TemplateCommandContext): string[] {
  const storyboardPath = resolve(
    context.projectRoot,
    pathOr(context, "storyboard", "storyboard.json"),
  );
  const projectPath = resolve(context.projectRoot, context.config.paths.project);
  const errors = existsSync(storyboardPath)
    ? validateChatBubblesStoryboard(
        parseChatBubblesStoryboard(readFileSync(storyboardPath, "utf8"), storyboardPath),
      )
    : [`missing ${pathOr(context, "storyboard", "storyboard.json")}`];
  if (existsSync(storyboardPath))
    errors.push(
      ...missingAvatarErrors(
        context,
        parseChatBubblesStoryboard(readFileSync(storyboardPath, "utf8"), storyboardPath),
      ),
    );
  if (existsSync(projectPath))
    errors.push(
      ...validateChatBubblesProject(
        parseChatBubblesProject(readFileSync(projectPath, "utf8"), projectPath),
      ),
    );
  return [...new Set(errors)];
}

export function validateResolvedChatBubbles(context: TemplateCommandContext): string[] {
  const projectPath = resolve(context.projectRoot, context.config.paths.project);
  if (!existsSync(projectPath))
    return [`missing ${context.config.paths.project}; run yumoframe resolve first`];
  const project = parseChatBubblesProject(readFileSync(projectPath, "utf8"), projectPath);
  const errors = validateChatBubblesProject(project);
  if (errors.length) return errors;
  return project.messages.length
    ? []
    : [`${context.config.paths.project} has no resolved messages; run yumoframe resolve first`];
}
