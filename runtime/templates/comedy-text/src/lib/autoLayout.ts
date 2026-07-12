/**
 * Deterministic scene stacking: positions text blocks and camera targets.
 */

import type { Scene, YumoFrameProject } from '../types';
import { estimateTextBlockSize } from './layout';

const MAX_BLOCK_WIDTH = 760;
const BLOCK_GAP = 28;
const CURSOR_WIDTH_EM = 0.66;
const DEFAULT_LINE_HEIGHT = 1.32;
const ALLOWED_ROTATIONS = new Set([-90, 0, 90]);

function getRotatedBox(width: number, height: number, rotate: number) {
  // Axis-aligned AABB after ±90°: width/height swap.
  return Math.abs(rotate) % 180 === 90 ? { width: height, height: width } : { width, height };
}

function getSceneRotation(scene: Scene) {
  return ALLOWED_ROTATIONS.has(scene.camera.rotate) ? scene.camera.rotate : 0;
}

/** Map camera rotation delta to the next block step direction in canvas space. */
function getNextStep(previousRotate: number, rotate: number) {
  const delta = rotate - previousRotate;
  // Screen-right step flips with CW turn; then unrotate into canvas axes.
  const screenX = delta > 0 ? -1 : 1;
  const screenY = 0;
  const radians = (-rotate * Math.PI) / 180;
  const canvasX = Math.round(screenX * Math.cos(radians) - screenY * Math.sin(radians));
  const canvasY = Math.round(screenX * Math.sin(radians) + screenY * Math.cos(radians));

  if (canvasX > 0) return 'right';
  if (canvasX < 0) return 'left';
  return canvasY < 0 ? 'up' : 'down';
}

function getTextAlign(rotate: number) {
  // Keep text trailing the camera turn so the cursor leads into the next beat.
  if (rotate < 0) return 'left';
  if (rotate > 0) return 'right';
  return 'right';
}

/**
 * Returns a copy of the project with element positions and camera targets laid out.
 * @param project - Source project (scenes keep timing; layout is recomputed)
 */
export function getAutoLayoutProject(project: YumoFrameProject): YumoFrameProject {
  const blocks = project.timeline.scenes.map((scene, index) => {
    const sourceElement = scene.elements[0];
    const fontSize = sourceElement.fontSize || 128;
    // Measure upright at max width, then apply camera-canceling element rotate.
    const draftElement = {
      ...sourceElement,
      x: 0,
      y: 0,
      width: MAX_BLOCK_WIDTH,
      rotate: 0,
      scale: sourceElement.scale || 1,
      fontSize,
      lineHeight: sourceElement.lineHeight || DEFAULT_LINE_HEIGHT,
      align: 'right',
    };
    const size = estimateTextBlockSize(draftElement);
    const rotate = getSceneRotation(scene);
    const element = {
      ...draftElement,
      align: getTextAlign(rotate),
      // Negate camera so glyphs stay screen-upright while the world turns.
      rotate: -rotate + (sourceElement.rotate || 0),
      width: Math.ceil(size.width),
    };
    const box = getRotatedBox(element.width, size.height, element.rotate);

    return {
      scene,
      element,
      height: size.height,
      box,
      rotate,
    };
  });

  // Stack blocks from a fixed seed; step along the camera turn direction.
  let centerX = project.timeline.virtualCanvas.width / 2;
  let centerY = 1900;
  const positionedBlocks = blocks.map((block, index) => {
    if (index > 0) {
      const previous = blocks[index - 1];
      const step = getNextStep(previous.rotate, block.rotate);
      // Gap ≈ cursor width + fixed padding so turns don't collide.
      const gap = Math.max(previous.element.fontSize, block.element.fontSize) * CURSOR_WIDTH_EM + BLOCK_GAP;

      if (step === 'right') {
        centerX += previous.box.width / 2 + block.box.width / 2 + gap;
      } else if (step === 'left') {
        centerX -= previous.box.width / 2 + block.box.width / 2 + gap;
      } else if (step === 'up') {
        centerY -= previous.box.height / 2 + block.box.height / 2 + gap;
      } else {
        centerY += previous.box.height / 2 + block.box.height / 2 + gap;
      }
    }

    return {
      ...block,
      centerX,
      centerY,
    };
  });

  const scenes = positionedBlocks.map((block, index): Scene => {
    // Top-left from center using unrotated content height.
    const element = {
      ...block.element,
      x: block.centerX - block.element.width / 2,
      y: block.centerY - block.height / 2,
    };
    const laidOutScene = {
      ...block.scene,
      camera: {
        ...block.scene.camera,
        targetX: block.centerX,
        targetY: block.centerY,
        // Runtime camera fit overwrites framing; keep placeholder 1 for JSON/layout.
        scale: 1,
        rotate: block.rotate,
        ease: 'spring',
      },
      elements: [element],
    };

    return laidOutScene;
  });

  return {
    ...project,
    timeline: {
      ...project.timeline,
      scenes,
    },
  };
}
