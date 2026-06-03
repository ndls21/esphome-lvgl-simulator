// V3 — Preview-centric, edge drawers.
// The round device dominates the canvas. All other surfaces are drawers from one of the four edges.
// Some drawers are shown open, others as a thin closed tab — to demonstrate both states.

function V3PreviewCentric({ theme, onThemeToggle }) {
  const t = tokens(theme);
  return (
    <div style={{
      width: 1440, height: 840,
      background: t.bg, color: t.text, fontFamily: t.sans,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      position: "relative",
    }}>
      {/* Minimal top bar */}
      <div style={{
        height: 44, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 18px",
        borderBottom: `1px solid ${t.border}`,
        background: t.panel,
        fontSize: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 18, height: 18, borderRadius: 5,
            background: "linear-gradient(135deg, #00CC66 0%, #00AAFF 100%)",
          }}/>
          <span style={{ fontWeight: 600 }}>LVGL Studio</span>
          <span style={{ color: t.textFaint, fontFamily: t.mono, fontSize: 11 }}>waveshare-146.yaml · 412×412 · Waveshare 1.46B</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PageSelector theme={theme} value={4} />
          <ToolbarBtn theme={theme} icon="⊞">All pages</ToolbarBtn>
          <button onClick={onThemeToggle} style={{
            background: t.pill, border: "none", borderRadius: 8,
            width: 28, height: 28, cursor: "pointer", color: t.text, fontSize: 13,
          }}>{theme === "dark" ? "☼" : "☾"}</button>
        </div>
      </div>

      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        {/* Hero canvas — black void with the device floating */}
        <div style={{
          position: "absolute", inset: 0,
          background: theme === "dark"
            ? "radial-gradient(ellipse at center, #14171d 0%, #0a0b0e 70%)"
            : "radial-gradient(ellipse at center, #f0f1f4 0%, #d9dbe0 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {/* Floor shadow */}
          <div style={{
            position: "absolute",
            left: "50%", top: "calc(50% + 240px)",
            transform: "translateX(-50%)",
            width: 380, height: 30,
            background: "radial-gradient(ellipse, rgba(0,0,0,0.5) 0%, transparent 70%)",
            filter: "blur(8px)",
          }}/>

          <DevicePreview scale={1.05} soc={78} theme="dark" />

          {/* Swipe arrows arc'd around the device */}
          <CircleArrow theme={theme} dir="right" />
          <CircleArrow theme={theme} dir="left" />
          <CircleArrow theme={theme} dir="up" />
        </div>

        {/* LEFT DRAWER — Pages (open, narrow) */}
        <Drawer theme={theme} edge="left" width={220} open title="Pages" badge="36">
          <PageList theme={theme} currentIdx={4} compact />
        </Drawer>

        {/* RIGHT DRAWER — Inspector (open, wider) */}
        <Drawer theme={theme} edge="right" width={300} open title="Inspect" subtitle="battery_value_label">
          <Inspector theme={theme} />
          <div style={{ height: 16 }}/>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: t.textFaint, marginBottom: 6 }}>
            Tree
          </div>
          <WidgetTree theme={theme} />
        </Drawer>

        {/* BOTTOM DRAWER — Drive (open, medium height) */}
        <Drawer theme={theme} edge="bottom" height={220} open title="Drive" subtitle="11 sensors · 7 globals · 5 popups">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <div>
              <SubTitle theme={theme}>Sensors</SubTitle>
              <DrivePanel theme={theme} tab="sensors" showTabs={false} compact />
            </div>
            <div>
              <SubTitle theme={theme}>Globals</SubTitle>
              <DrivePanel theme={theme} tab="globals" showTabs={false} />
            </div>
            <div>
              <SubTitle theme={theme}>Top layer</SubTitle>
              <DrivePanel theme={theme} tab="popups" showTabs={false} />
            </div>
          </div>
        </Drawer>

        {/* TOP TAB — YAML drawer (collapsed) */}
        <Drawer theme={theme} edge="top" open={false} title="YAML" badge="5324 lines" />
      </div>
    </div>
  );
}

function SubTitle({ theme, children }) {
  const t = tokens(theme);
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
      textTransform: "uppercase", color: t.textFaint, marginBottom: 8,
    }}>{children}</div>
  );
}

function CircleArrow({ theme, dir }) {
  const t = tokens(theme);
  const arrows = { left: "←", right: "→", up: "↑", down: "↓" };
  const pos = {
    left:  { left: "calc(50% - 320px)", top: "50%", transform: "translateY(-50%)" },
    right: { right: "calc(50% - 320px)", top: "50%", transform: "translateY(-50%)" },
    up:    { left: "50%", top: "calc(50% - 280px)", transform: "translateX(-50%)" },
    down:  { left: "50%", bottom: "calc(50% - 280px)", transform: "translateX(-50%)" },
  };
  // Target for each direction (relative to battery_page):
  const targets = {
    left: { idx: 15, title: "Power Flow" }, // swipe-right → idx 15
    right: { idx: 5, title: "Solar" },      // swipe-left  → idx 5
    up:   { idx: 15, title: "Power Flow" },
    down: null,
  };
  const target = targets[dir];
  return (
    <div style={{
      position: "absolute", ...pos[dir],
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      color: t.textDim,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        background: t.panel,
        border: `1px solid ${t.border}`,
        display: "grid", placeItems: "center",
        fontSize: 16, color: t.textDim,
        cursor: "pointer",
      }}>{arrows[dir]}</div>
      {target && (
        <div style={{ fontSize: 10, color: t.textFaint, fontFamily: t.mono }}>
          {String(target.idx).padStart(2, "0")} {target.title}
        </div>
      )}
    </div>
  );
}

function Drawer({ theme, edge, open, width = 280, height = 240, title, subtitle, badge, children }) {
  const t = tokens(theme);
  const horizontal = edge === "left" || edge === "right";
  const tabSize = 28;
  const baseStyle = {
    position: "absolute",
    background: t.panel,
    boxShadow: edge === "left"   ? "4px 0 16px rgba(0,0,0,0.18)" :
               edge === "right"  ? "-4px 0 16px rgba(0,0,0,0.18)" :
               edge === "bottom" ? "0 -4px 16px rgba(0,0,0,0.18)" :
                                   "0 4px 16px rgba(0,0,0,0.18)",
    display: "flex", flexDirection: "column",
    overflow: "hidden",
  };
  const positions = {
    left:   { left: 0, top: 0, bottom: 0, width: open ? width : tabSize, borderRight: `1px solid ${t.border}` },
    right:  { right: 0, top: 0, bottom: 0, width: open ? width : tabSize, borderLeft: `1px solid ${t.border}` },
    bottom: { left: 0, right: 0, bottom: 0, height: open ? height : tabSize, borderTop: `1px solid ${t.border}` },
    top:    { left: 0, right: 0, top: 0, height: open ? height : tabSize, borderBottom: `1px solid ${t.border}` },
  };

  // Closed tab — just shows the title perpendicular to its edge
  if (!open) {
    return (
      <div style={{ ...baseStyle, ...positions[edge] }}>
        <div style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center",
          padding: "0 10px",
          gap: 10,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: t.textDim,
          cursor: "pointer",
          writingMode: horizontal ? "vertical-rl" : "horizontal-tb",
        }}>
          <span>{title}</span>
          {badge && <span style={{
            fontSize: 9, fontFamily: t.mono,
            background: t.pill, color: t.textFaint,
            padding: "1px 5px", borderRadius: 3,
          }}>{badge}</span>}
          <span style={{ flex: 1 }}/>
          <span style={{ fontSize: 11 }}>
            {edge === "left" ? "›" : edge === "right" ? "‹" : edge === "bottom" ? "˄" : "˅"}
          </span>
        </div>
      </div>
    );
  }

  // Open
  return (
    <div style={{ ...baseStyle, ...positions[edge] }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px",
        borderBottom: `1px solid ${t.borderS}`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: t.textDim }}>{title}</span>
          {badge && <span style={{
            fontSize: 9, fontFamily: t.mono,
            background: t.pill, color: t.textFaint,
            padding: "1px 5px", borderRadius: 3,
          }}>{badge}</span>}
          {subtitle && <span style={{ fontSize: 11, color: t.textFaint, fontFamily: t.mono }}>{subtitle}</span>}
        </div>
        <button style={{
          background: "transparent", border: "none", cursor: "pointer",
          color: t.textFaint, fontSize: 12, padding: 4,
        }}>
          {edge === "left" ? "‹" : edge === "right" ? "›" : edge === "bottom" ? "˅" : "˄"}
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 12, minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

Object.assign(window, { V3PreviewCentric });
