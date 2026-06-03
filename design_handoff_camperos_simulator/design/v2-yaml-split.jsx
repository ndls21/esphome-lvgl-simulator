// V2 — Split-screen, YAML-first
// Left half: full YAML editor with file tree above.
// Right half: device preview hero, then drive panel as a stack of always-visible collapsible sections.
// Tree + inspector live as a thin floating overlay on the right edge.

function V2YamlSplit({ theme, onThemeToggle }) {
  const t = tokens(theme);
  return (
    <div style={{
      width: 1440, height: 840,
      background: t.bg, color: t.text, fontFamily: t.sans,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      <Toolbar theme={theme} onThemeToggle={onThemeToggle} />

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left half — YAML pane */}
        <div style={{
          flex: 1, minWidth: 0,
          display: "flex", flexDirection: "column",
          background: t.panel,
          borderRight: `1px solid ${t.border}`,
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 14px",
            borderBottom: `1px solid ${t.border}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: t.textDim }}>YAML</span>
              <div style={{ fontFamily: t.mono, fontSize: 11, color: t.textFaint }}>
                <span style={{ color: t.text }}>waveshare-146.yaml</span>
                <span style={{ margin: "0 6px" }}>›</span>
                <span style={{ color: t.text }}>pages</span>
                <span style={{ margin: "0 6px" }}>›</span>
                <span style={{ color: t.accent }}>[4] battery_page</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: t.textFaint, fontFamily: t.mono }}>L 736 · 5324 lines</span>
              <ToolbarBtn theme={theme} icon="⌕">Find</ToolbarBtn>
              <ToolbarBtn theme={theme} icon="≣">Outline</ToolbarBtn>
            </div>
          </div>

          {/* Section nav strip (jump to page) */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 12px",
            borderBottom: `1px solid ${t.borderS}`,
            background: t.panel2,
            overflowX: "auto", flexShrink: 0,
          }}>
            {PAGES.slice(0, 16).map(p => (
              <div key={p.idx} style={{
                fontSize: 10, fontFamily: t.mono,
                padding: "3px 8px", borderRadius: 4,
                background: p.idx === 4 ? t.accent : t.panel,
                color: p.idx === 4 ? "#fff" : t.textDim,
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}>{String(p.idx).padStart(2, "0")} {p.title}</div>
            ))}
            <div style={{ fontSize: 10, color: t.textFaint, padding: "3px 6px", whiteSpace: "nowrap" }}>+20 more…</div>
          </div>

          <YamlPane theme={theme} height="100%" />
        </div>

        {/* Right half */}
        <div style={{
          width: 660, flexShrink: 0,
          display: "flex", flexDirection: "column",
          minHeight: 0,
        }}>
          {/* Hero preview */}
          <div style={{
            height: 420, flexShrink: 0,
            background: theme === "dark"
              ? "linear-gradient(180deg, #16191f 0%, #0e1014 100%)"
              : "linear-gradient(180deg, #f0f1f4 0%, #e6e8ec 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative",
            borderBottom: `1px solid ${t.border}`,
          }}>
            <DevicePreview scale={0.9} soc={78} theme="dark" />

            {/* Floating page info */}
            <div style={{
              position: "absolute", left: 18, top: 18,
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              <div style={{ fontSize: 10, fontFamily: t.mono, color: t.textFaint, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Page 04 · Power sub
              </div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>battery_page</div>
            </div>

            {/* Hover-like select indicator */}
            <div style={{
              position: "absolute", right: 18, top: 18,
              display: "flex", flexDirection: "column", gap: 6,
              padding: "8px 10px",
              background: t.panel,
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              fontSize: 11,
              minWidth: 160,
            }}>
              <div style={{ fontSize: 9, color: t.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Selected</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontFamily: t.mono, fontSize: 10, color: t.accent,
                  background: t.accentBg, padding: "2px 5px", borderRadius: 3,
                }}>label</span>
                <span style={{ fontSize: 12, fontWeight: 500 }}>battery_value_label</span>
              </div>
              <div style={{ fontSize: 10, color: t.textDim, fontFamily: t.mono }}>
                text: <span style={{ color: t.text }}>"78 %"</span>
              </div>
              <div style={{ fontSize: 10, color: t.textDim, fontFamily: t.mono }}>
                bound: <span style={{ color: "#00CC66" }}>shunt_soc ↻</span>
              </div>
            </div>

            {/* Swipe arrows around preview */}
            <FloatingSwipeArrow theme={theme} dir="left" target={SWIPE_MAP.right}/>
            <FloatingSwipeArrow theme={theme} dir="right" target={SWIPE_MAP.left}/>
            <FloatingSwipeArrow theme={theme} dir="down" target={SWIPE_MAP.up}/>
          </div>

          {/* Drive stack — three always-visible collapsible sections */}
          <div style={{
            flex: 1,
            background: t.panel,
            display: "flex", flexDirection: "column",
            minHeight: 0,
            overflow: "auto",
          }}>
            <StackSection theme={theme} title="Sensors" badge="11" open>
              <DrivePanel theme={theme} tab="sensors" showTabs={false} compact />
            </StackSection>
            <StackSection theme={theme} title="Globals" badge="7">
              <div style={{ fontSize: 11, color: t.textFaint, padding: "8px 0" }}>Collapsed — click ▸ to expand</div>
            </StackSection>
            <StackSection theme={theme} title="Top layer · popups" badge="5" open>
              <DrivePanel theme={theme} tab="popups" showTabs={false} />
            </StackSection>
          </div>
        </div>
      </div>
    </div>
  );
}

function StackSection({ theme, title, badge, open = false, children }) {
  const t = tokens(theme);
  return (
    <div style={{ borderBottom: `1px solid ${t.borderS}` }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px",
        cursor: "pointer",
        background: open ? t.panel : t.panel2,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: t.textDim, fontSize: 11, width: 10 }}>{open ? "▾" : "▸"}</span>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: t.textDim }}>{title}</span>
          {badge && <span style={{
            fontSize: 9, fontFamily: t.mono,
            background: t.pill, color: t.textDim,
            padding: "1px 5px", borderRadius: 3,
          }}>{badge}</span>}
        </div>
        {open && <span style={{ fontSize: 10, color: t.textFaint }}>Live ●</span>}
      </div>
      {open && (
        <div style={{ padding: "8px 14px 14px" }}>{children}</div>
      )}
    </div>
  );
}

function FloatingSwipeArrow({ theme, dir, target }) {
  const t = tokens(theme);
  const arrows = { left: "‹", right: "›", up: "ʌ", down: "v" };
  const pos = {
    left:  { left: 8, top: "50%", transform: "translateY(-50%)" },
    right: { right: 8, top: "50%", transform: "translateY(-50%)" },
    up:    { left: "50%", top: 8, transform: "translateX(-50%)" },
    down:  { left: "50%", bottom: 8, transform: "translateX(-50%)" },
  };
  return (
    <div style={{
      position: "absolute", ...pos[dir],
      display: "flex", alignItems: "center", gap: 6,
      padding: "4px 8px",
      background: t.panel,
      border: `1px solid ${t.border}`,
      borderRadius: 6,
      fontSize: 11, color: t.textDim, cursor: "pointer",
    }}>
      <span style={{ fontSize: 16, lineHeight: 0.5 }}>{arrows[dir]}</span>
      {target && <span style={{ fontFamily: t.mono, fontSize: 10 }}>{target.title}</span>}
    </div>
  );
}

Object.assign(window, { V2YamlSplit });
