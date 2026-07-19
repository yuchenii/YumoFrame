import { Composition } from "remotion";
import { CenterLineVideo } from "./CenterLineVideo";
import { stubProject } from "./stubProject";

export const RemotionRoot = () => (
  <Composition
    id="CenterLineVideo"
    component={CenterLineVideo}
    durationInFrames={120}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={stubProject}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.ceil(props.composition.duration * props.composition.fps),
      fps: props.composition.fps,
      width: props.composition.width,
      height: props.composition.height,
      props,
    })}
  />
);
