/**
 * Runtime camera: line-fit framing, scene transitions, and end overview zoom.
 */

import type { CSSProperties } from 'react';
import { interpolate } from 'remotion';
import type { Camera, KineticTextElement, Scene, YumoFrameProject } from '../types';
import { estimateTextBlockSize, getStableTextLayout } from './layout';

/** Duration of scene-to-scene camera transitions in seconds. */
export const CAMERA_TRANSITION_SECONDS = 0.4;
const OVERVIEW_DELAY_SECONDS = 0.35;
const OVERVIEW_ZOOM_SECONDS = 1;
const OVERVIEW_PADDING = 96;

/** Line-milestone fit: short beats push in, dense beats pull out. */
export const FIT_MIN_SCALE = 0.85;
export const FIT_MAX_SCALE = 2.0;
export const FIT_PADDING_RATIO = 0.11;
export const FIT_EASE_SECONDS = 0.2;

type FitFraming = {
  scale: number;
  targetX: number;
  targetY: number;
};

function rotatePoint(x: number, y: number, rotate: number) {
  const radians = (rotate * Math.PI) / 180;
  return {
    x: x * Math.cos(radians) - y * Math.sin(radians),
    y: x * Math.sin(radians) + y * Math.cos(radians),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** World-space center and upright box for a single line within an element. */
function getLineContentFraming(element: KineticTextElement, lineIndex: number) {
  const full = getStableTextLayout(element);
  const index = Math.max(0, Math.min(lineIndex, element.lines.length - 1));
  const metrics = full.lineMetrics[index];
  // Align local left edge to match textAlign within the block width.
  let localLeft = 0;
  if (element.align === 'right') {
    localLeft = element.width - metrics.width;
  } else if (element.align === 'center') {
    localLeft = (element.width - metrics.width) / 2;
  }

  const localTop = full.lineMetrics.slice(0, index).reduce((sum, item) => sum + item.height, 0);
  const localCenterX = localLeft + metrics.width / 2;
  const localCenterY = localTop + metrics.height / 2;
  const blockCenterX = element.x + element.width / 2;
  const blockCenterY = element.y + full.height / 2;
  // Offset from block center, then apply element rotate into world space.
  const dx = element.x + localCenterX - blockCenterX;
  const dy = element.y + localCenterY - blockCenterY;
  const rotated = rotatePoint(dx, dy, element.rotate);

  return {
    targetX: blockCenterX + rotated.x,
    targetY: blockCenterY + rotated.y,
    // Fit the active line only (not the whole scene stack) for stronger hierarchy.
    // Camera rotate cancels element.rotate — use upright on-screen size.
    box: { width: metrics.width, height: metrics.height },
  };
}

function fitScaleForBox(box: { width: number; height: number }, viewWidth: number, viewHeight: number) {
  const pad = Math.min(viewWidth, viewHeight) * FIT_PADDING_RATIO;
  const availW = Math.max(viewWidth - 2 * pad, 1);
  const availH = Math.max(viewHeight - 2 * pad, 1);
  // Contain fit, then clamp so short lines don't explode / dense lines don't shrink away.
  const raw = Math.min(availW / Math.max(box.width, 1), availH / Math.max(box.height, 1));
  return clamp(raw, FIT_MIN_SCALE, FIT_MAX_SCALE);
}

function getMilestoneIndex(element: KineticTextElement, time: number) {
  // Latest line whose start has been reached (sticky until the next).
  let index = 0;
  for (let i = 0; i < element.lines.length; i++) {
    if (time >= element.lines[i].start) {
      index = i;
    }
  }
  return index;
}

/**
 * Line-milestone camera fit: scale/target for the active line, eased from the previous.
 * @param project - Project (composition size)
 * @param scene - Current scene
 * @param time - Playback time in seconds
 */
export function getSceneFitFraming(project: YumoFrameProject, scene: Scene, time: number): FitFraming {
  const element = scene.elements[0];
  const { width: viewW, height: viewH } = project.composition;

  if (!element?.lines?.length) {
    return {
      scale: scene.camera.scale || 1,
      targetX: scene.camera.targetX,
      targetY: scene.camera.targetY,
    };
  }

  const milestone = getMilestoneIndex(element, time);
  const toContent = getLineContentFraming(element, milestone);
  const to: FitFraming = {
    scale: fitScaleForBox(toContent.box, viewW, viewH),
    targetX: toContent.targetX,
    targetY: toContent.targetY,
  };

  if (milestone === 0) {
    return to;
  }

  const lineStart = element.lines[milestone].start;
  const fromContent = getLineContentFraming(element, milestone - 1);
  const from: FitFraming = {
    scale: fitScaleForBox(fromContent.box, viewW, viewH),
    targetX: fromContent.targetX,
    targetY: fromContent.targetY,
  };
  // Ease from previous line framing over FIT_EASE_SECONDS after line start.
  const progress = easeOutCubic(clamp((time - lineStart) / FIT_EASE_SECONDS, 0, 1));

  return {
    scale: from.scale + (to.scale - from.scale) * progress,
    targetX: from.targetX + (to.targetX - from.targetX) * progress,
    targetY: from.targetY + (to.targetY - from.targetY) * progress,
  };
}

/** Bounds of all text plus an overview zoom anchor near the last scene edge. */
function getOverviewLayout(project: YumoFrameProject, rotate: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let lastMinX = Infinity;
  let lastMinY = Infinity;
  let lastMaxX = -Infinity;
  let lastMaxY = -Infinity;
  const lastScene = project.timeline.scenes.at(-1);

  for (const scene of project.timeline.scenes) {
    for (const element of scene.elements) {
      const { height } = estimateTextBlockSize(element);
      const centerX = element.x + element.width / 2;
      const centerY = element.y + height / 2;
      const halfWidth = (element.width * element.scale) / 2;
      const halfHeight = (height * element.scale) / 2;

      for (const [x, y] of [
        [-halfWidth, -halfHeight],
        [halfWidth, -halfHeight],
        [halfWidth, halfHeight],
        [-halfWidth, halfHeight],
      ]) {
        // Element rotate into world, then camera rotate into overview space.
        const local = rotatePoint(x, y, element.rotate);
        const point = rotatePoint(centerX + local.x, centerY + local.y, rotate);
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);

        if (scene === lastScene) {
          lastMinX = Math.min(lastMinX, point.x);
          lastMinY = Math.min(lastMinY, point.y);
          lastMaxX = Math.max(lastMaxX, point.x);
          lastMaxY = Math.max(lastMaxY, point.y);
        }
      }
    }
  }

  return {
    // Zoom out from the last scene's outer edge (away from the stack center).
    anchor: rotatePoint(
      (lastMinX + lastMaxX) / 2 >= (minX + maxX) / 2 ? lastMaxX : lastMinX,
      (lastMinY + lastMaxY) / 2 >= (minY + maxY) / 2 ? lastMaxY : lastMinY,
      -rotate,
    ),
    rotatedBounds: { minX, minY, maxX, maxY },
  };
}

function getScreenPoint(
  point: { x: number; y: number },
  camera: Camera,
  pivotX: number,
  pivotY: number,
  width: number,
  height: number,
) {
  // World → screen: scale about target, then rotate about pivot.
  const beforeRotation = {
    x: width / 2 + camera.scale * (point.x - camera.targetX),
    y: height / 2 + camera.scale * (point.y - camera.targetY),
  };
  const rotated = rotatePoint(beforeRotation.x - pivotX, beforeRotation.y - pivotY, camera.rotate);
  return { x: pivotX + rotated.x, y: pivotY + rotated.y };
}

/** Invert screen mapping so `anchor` stays fixed while scale changes. */
function getFixedAnchorTarget(
  anchor: { x: number; y: number },
  screen: { x: number; y: number },
  scale: number,
  rotate: number,
  pivotX: number,
  pivotY: number,
  width: number,
  height: number,
) {
  const unrotated = rotatePoint(screen.x - pivotX, screen.y - pivotY, -rotate);
  // Solve for targetX/Y that map `anchor` onto the remembered screen point.
  return {
    targetX: anchor.x - (pivotX + unrotated.x - width / 2) / scale,
    targetY: anchor.y - (pivotY + unrotated.y - height / 2) / scale,
  };
}

/** Max scale that keeps all bounds on-screen with the given anchored screen point. */
function getAnchoredOverviewScale(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  anchor: { x: number; y: number },
  screen: { x: number; y: number },
  rotate: number,
  width: number,
  height: number,
) {
  const rotatedAnchor = rotatePoint(anchor.x, anchor.y, rotate);
  const limits = [1];
  const left = rotatedAnchor.x - bounds.minX;
  const right = bounds.maxX - rotatedAnchor.x;
  const top = rotatedAnchor.y - bounds.minY;
  const bottom = bounds.maxY - rotatedAnchor.y;

  // Each side: max scale so that edge stays inside padded viewport from the anchor.
  if (left > 0) limits.push((screen.x - OVERVIEW_PADDING) / left);
  if (right > 0) limits.push((width - OVERVIEW_PADDING - screen.x) / right);
  if (top > 0) limits.push((screen.y - OVERVIEW_PADDING) / top);
  if (bottom > 0) limits.push((height - OVERVIEW_PADDING - screen.y) / bottom);

  return Math.max(0.01, Math.min(...limits));
}

/** Adjust target so rotation about a non-center pivot keeps framing correct. */
function getPivotAdjustedTarget(camera: Camera, pivotX: number, pivotY: number, width: number, height: number) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radians = (-camera.rotate * Math.PI) / 180;
  // Where the viewport center lands after undoing pivot rotation.
  const dx = centerX - pivotX;
  const dy = centerY - pivotY;
  const unrotatedCenterX = pivotX + dx * Math.cos(radians) - dy * Math.sin(radians);
  const unrotatedCenterY = pivotY + dx * Math.sin(radians) + dy * Math.cos(radians);

  return {
    targetX: camera.targetX - (unrotatedCenterX - centerX) / camera.scale,
    targetY: camera.targetY - (unrotatedCenterY - centerY) / camera.scale,
  };
}

function withFit(scene: Scene, fit: FitFraming): Camera {
  return {
    ...scene.camera,
    scale: fit.scale,
    targetX: fit.targetX,
    targetY: fit.targetY,
  };
}

/**
 * Computed camera for the current frame (fit, transitions, optional end overview).
 * @param project - Laid-out project
 * @param scene - Active scene (or undefined for a centered fallback)
 * @param frame - Current frame index
 * @param fps - Composition FPS
 */
export function getCamera(project: YumoFrameProject, scene: Scene | undefined, frame: number, fps: number): Camera {
  if (!scene) {
    return { targetX: project.composition.width / 2, targetY: project.composition.height / 2, scale: 1, rotate: 0, ease: 'linear' };
  }

  const time = frame / fps;
  const sceneIndex = project.timeline.scenes.indexOf(scene);
  const next = project.timeline.scenes[sceneIndex + 1];
  const transitionFrames = Math.max(1, Math.round(fps * CAMERA_TRANSITION_SECONDS));
  // Always reserve a full window ending at next.start. Do not clamp to scene.end —
  // back-to-back scenes (gap=0) would otherwise get a 0-length snap.
  const transitionStart = next ? next.start - CAMERA_TRANSITION_SECONDS : Infinity;
  const transitionEnd = next?.start ?? Infinity;
  const inTransition = time >= transitionStart && time < transitionEnd;
  const elapsedFrames = Math.max(0, frame - transitionStart * fps);
  const linearProgress = Math.min(1, elapsedFrames / transitionFrames);
  const progress = scene.camera.ease === 'linear' ? linearProgress : easeInOutCubic(linearProgress);
  const rotationDelta = next ? next.camera.rotate - scene.camera.rotate : 0;
  // Pivot on left/right edge so ±90° turns feel like page flips, not spins.
  const pivotX =
    inTransition && rotationDelta !== 0
      ? rotationDelta < 0
        ? 0
        : project.composition.width
      : scene.camera.rotate < 0
        ? 0
        : project.composition.width;
  const pivotY = project.composition.height;

  const currentFit = getSceneFitFraming(project, scene, time);
  const currentFitted = withFit(scene, currentFit);
  // Next scene's first-line framing is the transition destination.
  const nextFit = next ? getSceneFitFraming(project, next, next.elements[0]?.lines[0]?.start ?? next.start) : currentFit;
  const nextFitted = next ? withFit(next, nextFit) : currentFitted;

  const currentTarget = getPivotAdjustedTarget(
    currentFitted,
    pivotX,
    pivotY,
    project.composition.width,
    project.composition.height,
  );
  const nextTarget = next
    ? getPivotAdjustedTarget(nextFitted, pivotX, pivotY, project.composition.width, project.composition.height)
    : currentTarget;
  const lastScene = project.timeline.scenes.at(-1);
  const overviewStart = (lastScene?.end ?? Infinity) + OVERVIEW_DELAY_SECONDS;

  if (project.endOverview !== false && scene === lastScene && time >= overviewStart) {
    const overview = getOverviewLayout(project, scene.camera.rotate);
    // Freeze line-fit at overview start, then pull out with a fixed screen anchor.
    const overviewFit = getSceneFitFraming(project, scene, overviewStart);
    const overviewPivotTarget = getPivotAdjustedTarget(
      withFit(scene, overviewFit),
      pivotX,
      pivotY,
      project.composition.width,
      project.composition.height,
    );
    const currentCamera = {
      ...withFit(scene, overviewFit),
      targetX: overviewPivotTarget.targetX,
      targetY: overviewPivotTarget.targetY,
      pivotX,
      pivotY,
    };
    const anchorScreen = getScreenPoint(
      overview.anchor,
      currentCamera,
      pivotX,
      pivotY,
      project.composition.width,
      project.composition.height,
    );
    const overviewScale = getAnchoredOverviewScale(
      overview.rotatedBounds,
      overview.anchor,
      anchorScreen,
      scene.camera.rotate,
      project.composition.width,
      project.composition.height,
    );
    const overviewLinear = Math.min(1, (time - overviewStart) / OVERVIEW_ZOOM_SECONDS);
    const overviewProgress = 1 - (1 - overviewLinear) ** 3;
    const scale = interpolate(overviewProgress, [0, 1], [overviewFit.scale, overviewScale]);
    const target = getFixedAnchorTarget(
      overview.anchor,
      anchorScreen,
      scale,
      scene.camera.rotate,
      pivotX,
      pivotY,
      project.composition.width,
      project.composition.height,
    );

    return {
      targetX: target.targetX,
      targetY: target.targetY,
      scale,
      rotate: scene.camera.rotate,
      ease: 'linear',
      pivotX,
      pivotY,
    };
  }

  const rotate =
    inTransition && next
      ? interpolate(progress, [0, 1], [scene.camera.rotate, next.camera.rotate])
      : scene.camera.rotate;
  const targetX =
    inTransition && next ? interpolate(progress, [0, 1], [currentTarget.targetX, nextTarget.targetX]) : currentTarget.targetX;
  const targetY =
    inTransition && next ? interpolate(progress, [0, 1], [currentTarget.targetY, nextTarget.targetY]) : currentTarget.targetY;
  const scale =
    inTransition && next ? interpolate(progress, [0, 1], [currentFit.scale, nextFit.scale]) : currentFit.scale;

  return {
    targetX,
    targetY,
    scale,
    rotate,
    ease: scene.camera.ease,
    pivotX,
    pivotY,
  };
}

/**
 * CSS transform that maps the virtual canvas through the given camera.
 * @param project - Project (composition + virtual canvas sizes)
 * @param camera - Computed camera state
 */
export function getCameraStyle(project: YumoFrameProject, camera: Camera): CSSProperties {
  const { width, height } = project.composition;
  const centerX = width / 2;
  const centerY = height / 2;
  const pivotX = camera.pivotX ?? centerX;
  const pivotY = camera.pivotY ?? centerY;

  return {
    position: 'absolute',
    width: project.timeline.virtualCanvas.width,
    height: project.timeline.virtualCanvas.height,
    transformOrigin: '0 0',
    // Pivot rotate → place viewport center → scale → pull world target to origin.
    transform: `translate(${pivotX}px, ${pivotY}px) rotate(${camera.rotate}deg) translate(${-pivotX}px, ${-pivotY}px) translate(${centerX}px, ${centerY}px) scale(${camera.scale}) translate(${-camera.targetX}px, ${-camera.targetY}px)`,
  };
}
