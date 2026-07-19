import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { CenterLineProject } from "./types";

function emphasizedText(text: string, emphasis: string[], color: string) {
  if (!emphasis.length) return text;
  const pattern = new RegExp(
    `(${emphasis.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "g",
  );
  return text.split(pattern).map((part, index) =>
    emphasis.includes(part) ? (
      <span key={index} style={{ color }}>
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function CenterLineVideo(project: CenterLineProject) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const activeIndex = project.lines.findIndex((line) => time >= line.start && time < line.end);
  const active = activeIndex >= 0 ? project.lines[activeIndex] : undefined;
  const history =
    activeIndex > 0
      ? project.lines.slice(Math.max(0, activeIndex - project.style.historyLines), activeIndex)
      : [];
  const fadeDuration = active
    ? Math.min(0.22, Math.max(0.001, (active.end - active.start) / 2))
    : 0.001;
  const fadeIn = active
    ? interpolate(time, [active.start, active.start + fadeDuration], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const fadeOut = active
    ? interpolate(time, [active.end - fadeDuration, active.end], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;
  const opacity = Math.min(fadeIn, fadeOut);
  return (
    <AbsoluteFill
      style={{
        background: project.style.background,
        color: project.style.textColor,
        fontFamily: project.style.fontFamily,
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      {history.map((line, index) => {
        const age = history.length - index;
        return (
          <div
            key={line.id}
            style={{
              position: "absolute",
              fontSize: project.style.fontSize * 0.62,
              fontWeight: 650,
              opacity: project.style.echoOpacity / age,
              transform: `translateY(${-age * 118}px) scale(${1 - age * 0.035})`,
              filter: `blur(${age * 0.35}px)`,
            }}
          >
            {emphasizedText(line.text, line.emphasis ?? [], project.style.emphasisColor)}
          </div>
        );
      })}
      {active ? (
        <div
          style={{
            maxWidth: "84%",
            textAlign: "center",
            fontSize: project.style.fontSize,
            fontWeight: 760,
            lineHeight: 1.22,
            letterSpacing: "-0.035em",
            opacity,
          }}
        >
          {emphasizedText(active.text, active.emphasis ?? [], project.style.emphasisColor)}
        </div>
      ) : null}
      {project.audio?.voice?.src ? (
        <Sequence from={Math.round((project.audio.voice.start ?? 0) * fps)} layout="none">
          <Audio
            src={staticFile(project.audio.voice.src)}
            volume={project.audio.voice.volume ?? 1}
          />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
}
