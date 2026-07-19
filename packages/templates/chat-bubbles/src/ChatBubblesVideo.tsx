import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { ChatBubblesProject } from "./types";

const colors = {
  left: { bubble: "#FFFFFF", text: "#20232A", avatar: "#2F6BFF" },
  right: { bubble: "#2359E8", text: "#FFFFFF", avatar: "#141820" },
};

export function ChatBubblesVideo(project: ChatBubblesProject) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const visible = project.messages.filter((message) => message.start <= time);
  const currentScroll = project.scrollStates.reduce(
    (offset, state) => (state.at <= time ? state.offset : offset),
    0,
  );

  return (
    <AbsoluteFill
      style={{
        background: project.composition.background,
        color: "#20232A",
        fontFamily:
          "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif",
        padding: "118px 68px 90px",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "end",
          padding: "0 10px 36px",
          borderBottom: "2px solid rgba(28,31,38,.09)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 720,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              opacity: 0.42,
            }}
          >
            Conversation
          </div>
          <div style={{ fontSize: 58, fontWeight: 780, letterSpacing: "-.045em", marginTop: 8 }}>
            消息
          </div>
        </div>
        <div style={{ fontSize: 28, fontWeight: 650, opacity: 0.42 }}>
          {project.participants.map((participant) => participant.name).join(" · ")}
        </div>
      </header>
      <div style={{ position: "relative", flex: 1, overflow: "hidden", marginTop: 42 }}>
        <div
          style={{
            position: "absolute",
            inset: "0 0 auto",
            transform: `translateY(${-currentScroll}px)`,
          }}
        >
          {visible.map((message) => {
            const enter = interpolate(time, [message.start, message.start + 0.24], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const palette = colors[message.side];
            return (
              <div
                key={message.id}
                style={{
                  height: project.layout.rowHeight,
                  display: "flex",
                  flexDirection: message.side === "right" ? "row-reverse" : "row",
                  alignItems: "end",
                  gap: project.layout.gap,
                  opacity: enter,
                  transform: `translateY(${(1 - enter) * 28}px) scale(${0.97 + enter * 0.03})`,
                }}
              >
                <div
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 25,
                    background: palette.avatar,
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    flex: "0 0 auto",
                    overflow: "hidden",
                    fontSize: 32,
                    fontWeight: 760,
                    boxShadow: "0 12px 32px rgba(24,30,45,.14)",
                  }}
                >
                  {message.avatar ? (
                    <Img
                      src={staticFile(message.avatar)}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    message.participantName.slice(0, 1)
                  )}
                </div>
                <div style={{ maxWidth: project.layout.bubbleMaxWidth }}>
                  <div
                    style={{
                      fontSize: 23,
                      fontWeight: 650,
                      margin: message.side === "right" ? "0 8px 9px 0" : "0 0 9px 8px",
                      textAlign: message.side,
                      opacity: 0.44,
                    }}
                  >
                    {message.participantName}
                  </div>
                  <div
                    style={{
                      background: palette.bubble,
                      color: palette.text,
                      borderRadius:
                        message.side === "right" ? "34px 34px 10px 34px" : "34px 34px 34px 10px",
                      padding: "25px 32px 27px",
                      fontSize: 38,
                      fontWeight: 600,
                      lineHeight: 1.36,
                      letterSpacing: "-.018em",
                      boxShadow:
                        message.side === "left"
                          ? "0 16px 48px rgba(32,37,49,.10)"
                          : "0 16px 44px rgba(35,89,232,.22)",
                    }}
                  >
                    {message.text}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
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
