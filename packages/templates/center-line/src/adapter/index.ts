import type { CenterLineProject, CenterLineStoryboard } from "./types.ts";
import { isJsonRecord as isRecord, parseTemplateJsonObject } from "@yumoframe/cli/templates/json";

export function parseCenterLineStoryboard(text: string, label: string): CenterLineStoryboard {
  return parseTemplateJsonObject(text, label);
}

export function validateCenterLineStoryboard(storyboard: CenterLineStoryboard): string[] {
  const errors: string[] = [];
  if (typeof storyboard.version !== "string" || !storyboard.version)
    errors.push("version must be a non-empty string");
  if (storyboard.template !== "center-line") errors.push("template must be center-line");
  if (!Array.isArray(storyboard.lines) || storyboard.lines.length === 0)
    return [...errors, "lines must be a non-empty array"];
  const ids = new Set<string>();
  let previousEnd = 0;
  storyboard.lines.forEach((line, index) => {
    const at = `lines[${index}]`;
    if (!isRecord(line)) return errors.push(`${at} must be an object`);
    if (typeof line.id !== "string" || !line.id) errors.push(`${at}.id must be a non-empty string`);
    else if (ids.has(line.id)) errors.push(`${at}.id must be unique`);
    else ids.add(line.id);
    const validText = typeof line.text === "string" && Boolean(line.text.trim());
    if (!validText) errors.push(`${at}.text must be non-empty`);
    if (line.emphasis !== undefined) {
      if (
        !Array.isArray(line.emphasis) ||
        !validText ||
        line.emphasis.some((item) => typeof item !== "string" || !item || !line.text.includes(item))
      ) {
        errors.push(`${at}.emphasis items must be non-empty substrings of text`);
      }
    }
    const hasStart = typeof line.start === "number" && Number.isFinite(line.start);
    const hasEnd = typeof line.end === "number" && Number.isFinite(line.end);
    if (hasStart !== hasEnd) errors.push(`${at} needs both start and end`);
    if (hasStart && hasEnd) {
      if (line.end! <= line.start!) errors.push(`${at}.end must be after start`);
      if (line.start! < previousEnd) errors.push(`${at}.start must not overlap the previous line`);
      previousEnd = line.end!;
    }
  });
  if (storyboard.style !== undefined) {
    if (!isRecord(storyboard.style)) {
      errors.push("style must be an object");
    } else {
      const allowed = new Set([
        "background",
        "textColor",
        "emphasisColor",
        "fontFamily",
        "fontSize",
        "transition",
        "historyLines",
        "echoOpacity",
      ]);
      const unknown = Object.keys(storyboard.style).filter((key) => !allowed.has(key));
      if (unknown.length) errors.push(`style has unsupported fields: ${unknown.join(", ")}`);
      for (const key of ["background", "textColor", "emphasisColor", "fontFamily"] as const) {
        const value = storyboard.style[key];
        if (value !== undefined && (typeof value !== "string" || !value.trim()))
          errors.push(`style.${key} must be a non-empty string`);
      }
      if (
        storyboard.style.fontSize !== undefined &&
        (!Number.isFinite(storyboard.style.fontSize) || storyboard.style.fontSize <= 0)
      )
        errors.push("style.fontSize must be positive");
      if (storyboard.style.transition !== undefined && storyboard.style.transition !== "fade")
        errors.push("style.transition must be fade");
      if (
        storyboard.style.historyLines !== undefined &&
        (!Number.isInteger(storyboard.style.historyLines) || storyboard.style.historyLines < 0)
      )
        errors.push("style.historyLines must be a non-negative integer");
      if (
        storyboard.style.echoOpacity !== undefined &&
        (!Number.isFinite(storyboard.style.echoOpacity) ||
          storyboard.style.echoOpacity < 0 ||
          storyboard.style.echoOpacity > 1)
      )
        errors.push("style.echoOpacity must be between 0 and 1");
    }
  }
  return errors;
}

export function parseCenterLineProject(text: string, label: string): CenterLineProject {
  return parseTemplateJsonObject(text, label);
}

export function validateCenterLineProject(project: CenterLineProject): string[] {
  const errors: string[] = [];
  if (project.template !== "center-line") errors.push("project template must be center-line");
  if (typeof project.preset !== "string" || !project.preset)
    errors.push("project preset must be non-empty");
  if (!Array.isArray(project.lines)) errors.push("project lines must be an array");
  else if (
    project.lines.some((line) => {
      if (!isRecord(line)) return true;
      return (
        !Number.isFinite(line.start) ||
        !Number.isFinite(line.end) ||
        Number(line.end) <= Number(line.start)
      );
    })
  ) {
    errors.push("project lines must have positive numeric timing");
  }
  if (!Number.isFinite(project.composition?.duration) || project.composition.duration <= 0)
    errors.push("composition.duration must be positive");
  if (!Number.isFinite(project.style?.fontSize) || project.style.fontSize <= 0)
    errors.push("style.fontSize must be positive");
  if (!Number.isInteger(project.style?.historyLines) || project.style.historyLines < 0)
    errors.push("style.historyLines must be a non-negative integer");
  if (
    !Number.isFinite(project.style?.echoOpacity) ||
    project.style.echoOpacity < 0 ||
    project.style.echoOpacity > 1
  )
    errors.push("style.echoOpacity must be between 0 and 1");
  return errors;
}
