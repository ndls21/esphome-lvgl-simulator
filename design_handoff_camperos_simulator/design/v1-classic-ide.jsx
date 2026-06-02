// V1 — Classic IDE layout
// Left rail: page list + widget tree (collapsible).
// Center:    device preview + swipe map.
// Right:     inspector + drive panel (tabbed).
// Bottom:    YAML drawer.

function V1ClassicIDE({ theme, onThemeToggle }) {
  const t = tokens(theme);
  return (
    <div style={{
      width: 1440, height: 840,
      background: t.bg,
      color: t.text,
      fontFamily: t.sans,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      <Toolbar theme={theme} onThemeToggle={onThemeToggle} />

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left rail */}
        <div style={{
          width: 260, flexShrink: 0,
          background: t.panel,
          borderRight: `1px solid ${t.border}`,
          display: "flex", flexDirection: "column",
          gap: 1,
          minHeight: 0,
        }}>
          <Panel theme={theme} title="Pages" right={<span style={{ fontSize: 10, color: t.textFaint, fontFamily: t.mono }}>36</span>}
                 style={{ border: "none", borderRadius: 0, flex: 2, minHeight: 0 }}>
            <PageList theme={theme} currentIdx={4} compact />
          </Panel>
          <Panel theme={theme} title="Widget tree"
                 right={<button style={iconBtn(t)}>＋</button>}
                 style={{ border: "none", borderRadius: 0, flex: 1.4, minHeight: 0, borderTop: `1px solid ${t.border}` }}>
            <WidgetTree theme={theme} />
          </Panel>
        </div>

        {/* Center */}
        <div style={{
          flex: 1,
          display: "flex", flexDirection: "column",
          minHeight: 0, minWidth: 0,
        }}>
          <div style={{
            flex: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: theme === "dark"
              ? "radial-gradient(circle at 50% 40%, #1a1d24 0%, #0e1014 70%)"
              : "radial-gradient(circle at 50% 40%, #f0f1f4 0%, #e6e8ec 70%)",
            position: "relative",
            minHeight: 0, padding: 24,
          }}>
            <DevicePreview scale={1.05} soc={78} theme="dark" />

            {/* Floating "active page" caption */}
            <div style={{
              position: "absolute", top: 18, left: 18,
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 12px",
              background: t.panel,
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              fontSize: 12,
            }}>
              <span style={{ fontFamily: t.mono, fontSize: 10, color: t.textFaint }}>04</span>
              <span style={{ fontWeight: 600 }}>battery_page</span>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: GROUP_COLORS.power }}/>
              <span style={{ fontSize: 11, color: t.textDim }}>Power sub</span>
            </div>

            {/* Zoom controls */}
            <div style={{
              position: "absolute", bottom: 18, right: 18,
              display: "flex", background: t.panel,
              border: `1px solid ${t.border}`, borderRadius: 8,
              padding: 2, gap: 2,
            }}>
              <ToolbarBtn theme={theme} icon="−" />
              <div style={{ fontSize: 11, color: t.textDim, padding: "4px 8px", alignSelf: "center", fontFamily: t.mono }}>100%</div>
              <ToolbarBtn theme={theme} icon="+" />
              <ToolbarBtn theme={theme} icon="◎" hint="Fit"/>
            </div>
          </div>

          {/* Bottom YAML drawer */}
          <div style={{
            height: 240, flexShrink: 0,
            borderTop: `1px solid ${t.border}`,
            background: t.panel,
            display: "flex", flexDirection: "column",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 14px",
              borderBottom: `1px solid ${t.borderS}`,
              fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: t.textDim,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span>YAML</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <Tab theme={theme} active>battery_page</Tab>
                  <Tab theme={theme}>top_layer</Tab>
                  <Tab theme={theme}>globals</Tab>
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <ToolbarBtn theme={theme} icon="↺">Reparse</ToolbarBtn>
                <ToolbarBtn theme={theme} icon="▾"/>
              </div>
            </div>
            <YamlPane theme={theme} height="100%" />
          </div>
        </div>

        {/* Right rail */}
        <div style={{
          width: 320, flexShrink: 0,
          background: t.panel,
          borderLeft: `1px solid ${t.border}`,
          display: "flex", flexDirection: "column",
          minHeight: 0,
        }}>
          {/* Inspector tab strip */}
          <div style={{
            display: "flex", gap: 0,
            borderBottom: `1px solid ${t.border}`,
            background: t.panel,
            padding: "0 6px",
          }}>
            <SideTab theme={theme} active>Inspect</SideTab>
            <SideTab theme={theme}>Drive</SideTab>
            <SideTab theme={theme}>Swipes</SideTab>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
            <Inspector theme={theme} />
            <div style={{ height: 14 }}/>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: t.textFaint, marginBottom: 6,
            }}>Swipe map</div>
            <SwipeMap theme={theme} />
            <div style={{ height: 14 }}/>
            <div style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: t.textFaint, marginBottom: 6,
            }}>Drive · Sensors</div>
            <DrivePanel theme={theme} tab="sensors" showTabs={false} compact />
          </div>
        </div>
      </div>
    </div>
  );
}

function Tab({ theme, active, children }) {
  const t = tokens(theme);
  return (
    <button style={{
      background: active ? t.panel2 : "transparent",
      color: active ? t.text : t.textDim,
      border: "none",
      borderRadius: 5,
      padding: "3px 9px",
      fontSize: 10,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: t.sans,
    }}>{children}</button>
  );
}

function SideTab({ theme, active, children }) {
  const t = tokens(theme);
  return (
    <button style={{
      background: "transparent",
      color: active ? t.text : t.textDim,
      border: "none",
      borderBottom: `2px solid ${active ? t.accent : "transparent"}`,
      padding: "10px 14px",
      fontSize: 11,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      fontWeight: 600,
      cursor: "pointer",
      fontFamily: t.sans,
      marginBottom: -1,
    }}>{children}</button>
  );
}

Object.assign(window, { V1ClassicIDE });
