/**
 * Vite Player shell for local stub preview (not the `yumoframe dev` Remotion path).
 */

import { Player } from '@remotion/player';
import { ComedyTextVideo } from './compositions/ComedyTextVideo';
import { stubProject } from './lib/stubProject';

/**
 * Renders a Remotion Player with stub project props for Vite-only preview.
 * Real projects are loaded through Remotion input props by `yumoframe dev`.
 */
export function App() {
  const { width, height, fps, duration, background } = stubProject.composition;

  return (
    <main className="app">
      <p style={{ color: '#ccc', padding: 16, fontFamily: 'system-ui' }}>
        Vite preview uses stub data. Run <code>yumoframe dev</code> inside a project to load its generated{' '}
        <code>project.json</code>.
      </p>
      <section className="preview">
        <Player
          component={ComedyTextVideo}
          // Remotion needs frames; duration in project.json is seconds.
          durationInFrames={Math.ceil(duration * fps)}
          fps={fps}
          compositionWidth={width}
          compositionHeight={height}
          controls
          loop
          inputProps={stubProject}
          style={{
            width: 'min(360px, 90vw)',
            aspectRatio: `${width} / ${height}`,
            background,
          }}
        />
      </section>
    </main>
  );
}
