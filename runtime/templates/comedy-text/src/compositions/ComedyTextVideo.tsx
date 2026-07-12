/**
 * Main Remotion composition: camera, kinetic text, and project audio.
 */

import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { KineticTextBlock } from '../components/KineticTextBlock';
import { getAutoLayoutProject } from '../lib/autoLayout';
import { getCamera, getCameraStyle } from '../lib/camera';
import { findActiveScene } from '../lib/timing';
import type { YumoFrameProject } from '../types';

function secondsToFrame(seconds: number, fps: number) {
  // Remotion Sequence `from` is an integer frame index.
  return Math.max(0, Math.round(seconds * fps));
}

/**
 * Renders the comedy-text video from a YumoFrame project (layout + camera + audio).
 * @param project - Full project document passed as Remotion input props
 */
export function ComedyTextVideo(project: YumoFrameProject) {
  // Recompute positions each render so camera targets match current text metrics.
  const laidOutProject = getAutoLayoutProject(project);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const activeScene = findActiveScene(laidOutProject.timeline.scenes, time);
  const camera = getCamera(laidOutProject, activeScene, frame, fps);
  const audio = laidOutProject.audio;

  return (
    <AbsoluteFill style={{ background: laidOutProject.composition.background, overflow: 'hidden' }}>
      <div style={getCameraStyle(laidOutProject, camera)}>
        {laidOutProject.timeline.scenes.map((scene) =>
          scene.elements.map((element) => (
            <KineticTextBlock key={element.id} element={element} time={time} theme={laidOutProject.theme} />
          )),
        )}
      </div>

      {audio?.voice?.src ? (
        <Sequence from={secondsToFrame(audio.voice.start ?? 0, fps)} layout="none">
          <Audio src={staticFile(audio.voice.src)} volume={audio.voice.volume ?? 1} />
        </Sequence>
      ) : null}

      {audio?.bgm?.src ? (
        <Sequence from={secondsToFrame(audio.bgm.start ?? 0, fps)} layout="none">
          <Audio src={staticFile(audio.bgm.src)} volume={audio.bgm.volume ?? 0.2} loop={audio.bgm.loop ?? true} />
        </Sequence>
      ) : null}

      {(audio?.sfx ?? []).map((cue) => (
        <Sequence key={`${cue.id}-${cue.at}`} from={secondsToFrame(cue.at, fps)} layout="none">
          <Audio src={staticFile(cue.src)} volume={cue.volume ?? 0.5} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
