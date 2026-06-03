// V4 — The chosen direction.
// v3's preview-centric layout (device hero, edge drawers) +
// v1's tabbed bottom console — but scoped to the *relevant* YAML slices and READ-ONLY,
// because the .yaml files are authored elsewhere and ingested. The console also hosts Drive.

function V4Final({ theme, onThemeToggle }) {
  const t = tokens(theme);
  const RAIL_L = 220;
  const RAIL_R = 300;
  const CONSOLE_H = 252;
  const TOPBAR_H = 44;

  return (
    <div style={{
      width: 1440, height: 840,
      background: t.bg, color: t.text, fontFamily: t.sans,
      display: "flex", flexDirection: "column",
      overflow: "hidden", position: "relative",
    }}>
      {/* Minimal top bar */}
      <div style={{
        height: TOPBAR_H, flexShrink: 0,
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
          <ToolbarBtn theme={theme} icon="↺">Reload YAML</ToolbarBtn>
          <PageSelector theme={theme} value={4} />
          <ToolbarBtn theme={theme} icon="⊞">All pages</ToolbarBtn>
          <button onClick={onThemeToggle} style={{
            background: t.pill, border: "none", borderRadius: 8,
            width: 28, height: 28, cursor: "pointer", color: t.text, fontSize: 13,
          }}>{theme === "dark" ? "☼" : "☾"}</button>
        </div>
      </div>

      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        {/* Hero void */}
        <div style={{
          position: "absolute", inset: 0,
          background: theme === "dark"
            ? "radial-gradient(ellipse at center, #14171d 0%, #0a0b0e 70%)"
            : "radial-gradient(ellipse at center, #f0f1f4 0%, #d9dbe0 100%)",
        }}/>

        {/* Open viewport — the space between the rails and above the console */}
        <div style={{
          position: "absolute",
          left: RAIL_L, right: RAIL_R, top: 0, bottom: CONSOLE_H,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {/* Floor shadow */}
          <div style={{
            position: "absolute", left: "50%", top: "calc(50% + 175px)",
            transform: "translateX(-50%)",
            width: 320, height: 26,
            background: "radial-gradient(ellipse, rgba(0,0,0,0.5) 0%, transparent 70%)",
            filter: "blur(8px)",
          }}/>

          <DevicePreview scale={0.86} soc={78} theme="dark" />

          <SwipeArrow theme={theme} dir="left"  target={{ idx: 5,  title: "Solar" }} />
          <SwipeArrow theme={theme} dir="right" target={{ idx: 15, title: "Power Flow" }} />
          <SwipeArrow theme={theme} dir="up"    target={{ idx: 15, title: "Power Flow" }} />
        </div>

        {/* LEFT RAIL — Pages */}
        <Rail theme={theme} edge="left" width={RAIL_L} title="Pages" badge="36">
          <PageList theme={theme} currentIdx={4} compact />
        </Rail>

        {/* RIGHT RAIL — Inspect + Tree */}
        <Rail theme={theme} edge="right" width={RAIL_R} title="Inspect" subtitle="battery_value_label">
          <Inspector theme={theme} />
          <div style={{ height: 16 }}/>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: t.textFaint, marginBottom: 6 }}>
            Tree
          </div>
          <WidgetTree theme={theme} />
        </Rail>

        {/* BOTTOM CONSOLE — tabbed, contextual, read-only YAML + Drive */}
        <BottomConsole theme={theme} left={RAIL_L} right={RAIL_R} height={CONSOLE_H} />
      </div>
    </div>
  );
}

// ── Bottom console: tab strip switches "aspect"; YAML tabs are read-only slices.
function BottomConsole({ theme, left, right, height }) {
  const t = tokens(theme);
  const [active, setActive] = React.useState("battery_page");

  const yamlTabs = [
    { id: "battery_page", label: "battery_page", source: YAML_SAMPLE,     lines: "L 612 · page 4" },
    { id: "top_layer",    label: "top_layer",    source: YAML_TOP_LAYER,  lines: "shared overlay" },
    { id: "globals",      label: "globals",      source: YAML_GLOBALS,    lines: "shared globals" },
  ];
  const isYaml = active !== "drive";
  const current = yamlTabs.find(x => x.id === active);

  return (
    <div style={{
      position: "absolute", left, right, bottom: 0, height,
      background: t.panel,
      borderTop: `1px solid ${t.border}`,
      borderLeft: `1px solid ${t.border}`,
      borderRight: `1px solid ${t.border}`,
      boxShadow: "0 -4px 16px rgba(0,0,0,0.18)",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Tab strip */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "7px 12px",
        borderBottom: `1px solid ${t.borderS}`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {yamlTabs.map(tab => (
            <ConsoleTab key={tab.id} theme={theme} mono active={active === tab.id} onClick={() => setActive(tab.id)}>
              {tab.label}
            </ConsoleTab>
          ))}
          <div style={{ width: 1, height: 18, background: t.border, margin: "0 6px" }}/>
          <ConsoleTab theme={theme} active={active === "drive"} onClick={() => setActive("drive")}>
            ◉ Drive
          </ConsoleTab>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isYaml ? (
            <>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 10, fontFamily: t.mono, color: t.textFaint,
                background: t.pill, padding: "3px 8px", borderRadius: 5,
              }}>
                <span style={{ fontSize: 10 }}>⌧</span> read-only · authored in repo
              </span>
              <span style={{ fontSize: 10, fontFamily: t.mono, color: t.textFaint }}>{current.lines}</span>
              <ToolbarBtn theme={theme} icon="↺">Reload</ToolbarBtn>
            </>
          ) : (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 10, fontFamily: t.mono, color: t.textFaint,
              background: t.pill, padding: "3px 8px", borderRadius: 5,
            }}>
              ◉ simulation only · not written to YAML
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {isYaml ? (
          <YamlPane theme={theme} height="100%" source={current.source} />
        ) : (
          <div style={{ height: "100%", overflow: "auto", padding: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr", gap: 18 }}>
              <div>
                <ConsoleSubTitle theme={theme}>Sensors</ConsoleSubTitle>
                <DrivePanel theme={theme} tab="sensors" showTabs={false} compact />
              </div>
              <div>
                <ConsoleSubTitle theme={theme}>Globals</ConsoleSubTitle>
                <DrivePanel theme={theme} tab="globals" showTabs={false} />
              </div>
              <div>
                <ConsoleSubTitle theme={theme}>Top layer</ConsoleSubTitle>
                <DrivePanel theme={theme} tab="popups" showTabs={false} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ConsoleTab({ theme, active, mono, onClick, children }) {
  const t = tokens(theme);
  return (
    <button onClick={onClick} style={{
      background: active ? t.panel2 : "transparent",
      color: active ? t.text : t.textDim,
      border: `1px solid ${active ? t.border : "transparent"}`,
      borderRadius: 6,
      padding: "4px 11px",
      fontSize: mono ? 11 : 11,
      fontFamily: mono ? t.mono : t.sans,
      fontWeight: mono ? 500 : 600,
      letterSpacing: mono ? 0 : "0.04em",
      textTransform: mono ? "none" : "uppercase",
      cursor: "pointer",
    }}>{children}</button>
  );
}

function ConsoleSubTitle({ theme, children }) {
  const t = tokens(theme);
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
      textTransform: "uppercase", color: t.textFaint, marginBottom: 8,
    }}>{children}</div>
  );
}

// ── Edge rail (left/right). Always-open labelled panel.
function Rail({ theme, edge, width, title, subtitle, badge, children }) {
  const t = tokens(theme);
  return (
    <div style={{
      position: "absolute", top: 0, bottom: 0,
      [edge]: 0, width,
      background: t.panel,
      [edge === "left" ? "borderRight" : "borderLeft"]: `1px solid ${t.border}`,
      boxShadow: edge === "left" ? "4px 0 16px rgba(0,0,0,0.12)" : "-4px 0 16px rgba(0,0,0,0.12)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 12px",
        borderBottom: `1px solid ${t.borderS}`,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: t.textDim }}>{title}</span>
        {badge && <span style={{
          fontSize: 9, fontFamily: t.mono, background: t.pill, color: t.textFaint,
          padding: "1px 5px", borderRadius: 3,
        }}>{badge}</span>}
        {subtitle && <span style={{ fontSize: 11, color: t.textFaint, fontFamily: t.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</span>}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 12, minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

// ── Swipe affordance arc'd around the device.
function SwipeArrow({ theme, dir, target }) {
  const t = tokens(theme);
  const arrows = { left: "←", right: "→", up: "↑", down: "↓" };
  const pos = {
    left:  { left: "calc(50% - 290px)", top: "50%", transform: "translateY(-50%)" },
    right: { right: "calc(50% - 290px)", top: "50%", transform: "translateY(-50%)" },
    up:    { left: "50%", top: "calc(50% - 215px)", transform: "translateX(-50%)" },
    down:  { left: "50%", bottom: "calc(50% - 215px)", transform: "translateX(-50%)" },
  };
  return (
    <div style={{
      position: "absolute", ...pos[dir],
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: "50%",
        background: t.panel, border: `1px solid ${t.border}`,
        display: "grid", placeItems: "center",
        fontSize: 15, color: t.textDim, cursor: "pointer",
      }}>{arrows[dir]}</div>
      {target && (
        <div style={{ fontSize: 10, color: t.textFaint, fontFamily: t.mono }}>
          {String(target.idx).padStart(2, "0")} {target.title}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { V4Final });
