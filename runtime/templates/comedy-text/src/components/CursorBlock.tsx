/**
 * Blinking typewriter cursor overlay for the active reveal character.
 */

type CursorBlockProps = {
  /** Primary cursor color when blink is on. */
  color: string;
  /** Dimmed color when blink is off. */
  dimColor: string;
  /** Timeline time in seconds (drives blink phase). */
  time: number;
};

/**
 * Absolute-positioned blink cursor drawn after the current character.
 * @param props.color - On-blink fill color
 * @param props.dimColor - Off-blink fill color
 * @param props.time - Current playback time in seconds
 */
export function CursorBlock({ color, dimColor, time }: CursorBlockProps) {
  // ~1.5 Hz blink (floor(t*3) toggles every 1/3s).
  const blinkOn = Math.floor(time * 3) % 2 === 0;

  return (
    <span
      style={{
        position: 'absolute',
        // Sit just after the glyph box in em units so it scales with fontSize.
        left: 'calc(100% + 0.08em)',
        top: '0.12em',
        width: '0.58em',
        height: '0.92em',
        background: blinkOn ? color : dimColor,
      }}
    />
  );
}
