// Round 412×412 device preview, rendering the Battery page as an example LVGL screen.
// Sized via a `scale` prop so the same component can show small (sidebar previews) or large (hero).

function DevicePreview({ scale = 1, soc = 78, withBezel = true, withDots = true, theme = "dark" }) {
  const SIZE = 412;
  const BEZEL = withBezel ? 28 : 0;
  const outer = (SIZE + BEZEL * 2) * scale;

  // Arc geometry — matches YAML: 260x260, start 135°, end 45° (sweeping 270°).
  const ARC_RADIUS = 130;
  const ARC_STROKE = 14;
  const arcCircumference = 2 * Math.PI * ARC_RADIUS;
  const sweepFraction = 270 / 360;
  const fillFraction = (soc / 100) * sweepFraction;

  const dpStyle = {
    width: outer,
    height: outer,
    borderRadius: "50%",
    background: withBezel
      ? "radial-gradient(circle at 30% 25%, #2a2a2e 0%, #141416 60%, #0a0a0c 100%)"
      : "transparent",
    boxShadow: withBezel
      ? "inset 0 0 0 1px #3a3a3e, inset 0 2px 6px rgba(255,255,255,0.04), 0 18px 40px rgba(0,0,0,0.45), 0 4px 10px rgba(0,0,0,0.35)"
      : "none",
    padding: BEZEL * scale,
    boxSizing: "border-box",
    position: "relative",
    flexShrink: 0,
  };

  const screenStyle = {
    width: SIZE * scale,
    height: SIZE * scale,
    borderRadius: "50%",
    background: theme === "dark" ? "#000000" : "#0a0a0a",
    position: "relative",
    overflow: "hidden",
    boxShadow: withBezel
      ? "inset 0 0 0 2px #000, inset 0 2px 12px rgba(255,255,255,0.04)"
      : "inset 0 0 0 1px rgba(255,255,255,0.08)",
  };

  // Inner content uses a fixed 412x412 coordinate space, then scales.
  const inner = {
    position: "absolute",
    inset: 0,
    transform: `scale(${scale})`,
    transformOrigin: "top left",
    width: SIZE,
    height: SIZE,
  };

  return (
    <div style={dpStyle}>
      <div style={screenStyle}>
        <div style={inner}>
          {/* Battery arc */}
          <svg width={SIZE} height={SIZE} style={{ position: "absolute", inset: 0 }}>
            <g transform={`translate(${SIZE / 2}, ${SIZE / 2 - 10})`}>
              {/* Background track */}
              <circle
                r={ARC_RADIUS}
                fill="none"
                stroke="#333333"
                strokeWidth={ARC_STROKE}
                strokeLinecap="round"
                strokeDasharray={`${sweepFraction * arcCircumference} ${arcCircumference}`}
                transform="rotate(135)"
              />
              {/* Indicator */}
              <circle
                r={ARC_RADIUS}
                fill="none"
                stroke="#00CC66"
                strokeWidth={ARC_STROKE}
                strokeLinecap="round"
                strokeDasharray={`${fillFraction * arcCircumference} ${arcCircumference}`}
                transform="rotate(135)"
              />
            </g>
          </svg>

          {/* Battery icon (mdi-battery as glyph) */}
          <div style={{
            position: "absolute",
            left: "50%", top: "calc(50% - 50px)",
            transform: "translate(-50%, -50%)",
            fontSize: 48,
            color: "#00CC66",
            fontFamily: "'Material Design Icons','Segoe UI Emoji',sans-serif",
            lineHeight: 1,
          }}>
            <BatterySvg size={44} color="#00CC66" />
          </div>

          {/* Value */}
          <div style={{
            position: "absolute",
            left: "50%", top: "calc(50% + 5px)",
            transform: "translate(-50%, -50%)",
            fontSize: 48,
            fontWeight: 500,
            color: "#FFFFFF",
            fontFamily: "Roboto, sans-serif",
            letterSpacing: "0.01em",
          }}>
            {soc} %
          </div>

          {/* Title */}
          <div style={{
            position: "absolute",
            left: "50%", bottom: 50,
            transform: "translateX(-50%)",
            fontSize: 28,
            color: "#666666",
            fontFamily: "Roboto, sans-serif",
            fontWeight: 400,
          }}>
            Battery SOC
          </div>

          {/* Dots indicator (3 dots for battery page) */}
          {withDots && (
            <div style={{
              position: "absolute",
              left: "50%", bottom: 20,
              transform: "translateX(-50%)",
              display: "flex",
              gap: 8,
            }}>
              <div style={dotStyle("#FFFFFF")} />
              <div style={dotStyle("#555555")} />
              <div style={dotStyle("#555555")} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function dotStyle(c) {
  return { width: 10, height: 10, borderRadius: "50%", background: c };
}

// Simple battery icon (since mdi font won't load reliably).
function BatterySvg({ size = 48, color = "#00CC66" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="6" width="14" height="12" rx="1.5" stroke={color} strokeWidth="1.6" fill="none"/>
      <rect x="18" y="9" width="2" height="6" rx="0.5" fill={color}/>
      <rect x="5.5" y="7.5" width="11" height="9" rx="0.5" fill={color} opacity="0.85"/>
    </svg>
  );
}

// A simpler version used as a thumb/preview without bezel.
function DevicePreviewMini({ size = 80, soc = 78 }) {
  const scale = size / 412;
  return <DevicePreview scale={scale} soc={soc} withBezel={false} withDots={false} />;
}

Object.assign(window, { DevicePreview, DevicePreviewMini, BatterySvg });
