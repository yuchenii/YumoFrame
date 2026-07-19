import { Player } from "@remotion/player";
import { ChatBubblesVideo } from "./ChatBubblesVideo";
import { stubProject } from "./stubProject";

export function App() {
  return (
    <main className="app">
      <Player
        component={ChatBubblesVideo}
        durationInFrames={150}
        fps={30}
        compositionWidth={1080}
        compositionHeight={1920}
        inputProps={stubProject}
        controls
        loop
        style={{ width: "min(360px, 90vw)", aspectRatio: "9 / 16" }}
      />
    </main>
  );
}
