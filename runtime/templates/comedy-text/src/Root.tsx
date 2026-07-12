/**
 * Remotion root: registers the ComedyTextVideo composition and metadata.
 */

import { Composition } from 'remotion';
import { ComedyTextVideo } from './compositions/ComedyTextVideo';
import { stubProject } from './lib/stubProject';

/** Remotion entry that wires ComedyTextVideo with stub defaults and dynamic metadata. */
export const RemotionRoot = () => {
  return (
    <Composition
      id="ComedyTextVideo"
      component={ComedyTextVideo}
      durationInFrames={30}
      fps={stubProject.composition.fps}
      width={stubProject.composition.width}
      height={stubProject.composition.height}
      defaultProps={stubProject}
      calculateMetadata={({props: project}) => {
        // Real projects arrive via input props; size the composition from them.
        const { width, height, fps, duration } = project.composition;
        return {
          durationInFrames: Math.ceil(duration * fps),
          fps,
          width,
          height,
          props: project,
        };
      }}
    />
  );
};
