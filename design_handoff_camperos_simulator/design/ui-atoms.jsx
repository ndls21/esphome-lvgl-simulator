// Shared UI atoms for the three simulator-host variations.
// Theme-aware (tokens take theme: "light" | "dark"). Each component is presentational only.

function tokens(theme = "light") {
  const dark = theme === "dark";
  return {
    bg:        dark ? "#0e1014" : "#fafafb",
    panel:     dark ? "#16181d" : "#ffffff",
    panel2:    dark ? "#1c1f25" : "#f4f5f7",
    border:    dark ? "#23272f" : "#e5e7eb",
    borderS:   dark ? "#1c1f25" : "#eef0f3",
    text:      dark ? "#e6e8ec" : "#1a1d22",
    textDim:   dark ? "#9aa0aa" : "#6b7280",
    textFaint: dark ? "#5d626c" : "#9ca3af",
    accent:    "#5c8cff",
    accentBg:  dark ? "rgba(92,140,255,0.16)" : "rgba(92,140,255,0.10)",
    pill:      dark ? "#23272f" : "#eef0f3",
    success:   "#00CC66",
    warn:      "#FFCC00",
    danger:    "#FF4444",
    mono:      `"JetBrains Mono", "SF Mono", ui-monospace, monospace`,
    sans:      `Inter, -apple-system, "Segoe UI", Roboto, sans-serif`,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Panel — labeled container with optional collapse
function Panel({ theme, title, right, children, padded = true, collapsed = false, onToggle, style }) {
  const t = tokens(theme);
  return (
    <div style={{
      background: t.panel,
      border: `1px solid ${t.border}`,
      borderRadius: 10,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
      ...style,
    }}>
      {title && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 12px",
          borderBottom: collapsed ? "none" : `1px solid ${t.borderS}`,
          background: t.panel,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: t.textDim,
          fontFamily: t.sans,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onToggle && (
              <button onClick={onToggle} style={iconBtn(t)}>{collapsed ? "▸" : "▾"}</button>
            )}
            <span>{title}</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>{right}</div>
        </div>
      )}
      {!collapsed && (
        <div style={{ padding: padded ? 12 : 0, flex: 1, minHeight: 0, overflow: "auto" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function iconBtn(t) {
  return {
    background: "transparent",
    border: "none",
    color: t.textDim,
    cursor: "pointer",
    width: 18,
    height: 18,
    padding: 0,
    fontSize: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Toolbar — top strip with title, page selector, sim controls, theme toggle
function Toolbar({ theme, onThemeToggle, currentPage, onPageChange, compact = false }) {
  const t = tokens(theme);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 14px",
      background: t.panel,
      borderBottom: `1px solid ${t.border}`,
      fontFamily: t.sans,
      fontSize: 13,
      color: t.text,
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: "linear-gradient(135deg, #00CC66 0%, #00AAFF 100%)",
          display: "grid", placeItems: "center",
          color: "#000", fontWeight: 800, fontSize: 11,
        }}>L</div>
        <div style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>LVGL Studio</div>
        <div style={{ color: t.textFaint, fontSize: 11 }}>waveshare-146.yaml · 412×412</div>
      </div>

      {!compact && <ToolbarGroup theme={theme}>
        <ToolbarBtn theme={theme} icon="↺">Render</ToolbarBtn>
        <ToolbarBtn theme={theme} icon="⤓">Load</ToolbarBtn>
        <ToolbarBtn theme={theme} icon="⤴">Save</ToolbarBtn>
      </ToolbarGroup>}

      <div style={{ flex: 1 }} />

      <ToolbarGroup theme={theme}>
        <ToolbarBtn theme={theme} icon="←" hint="Swipe right (prev)" />
        <ToolbarBtn theme={theme} icon="→" hint="Swipe left (next)" />
        <ToolbarBtn theme={theme} icon="↑" hint="Swipe up" />
        <ToolbarBtn theme={theme} icon="↓" hint="Swipe down" />
      </ToolbarGroup>

      <PageSelector theme={theme} value={currentPage} onChange={onPageChange} />

      <button onClick={onThemeToggle} style={{
        ...iconBtn(t),
        width: 28, height: 28, borderRadius: 8,
        background: t.pill,
        fontSize: 13,
      }}>{theme === "dark" ? "☼" : "☾"}</button>
    </div>
  );
}

function ToolbarGroup({ children, theme }) {
  const t = tokens(theme);
  return (
    <div style={{
      display: "flex",
      background: t.pill,
      borderRadius: 8,
      padding: 2,
      gap: 2,
    }}>{children}</div>
  );
}

function ToolbarBtn({ theme, icon, children, hint, active }) {
  const t = tokens(theme);
  return (
    <button title={hint} style={{
      background: active ? t.panel : "transparent",
      border: "none",
      borderRadius: 6,
      padding: children ? "6px 10px" : 6,
      fontSize: 12,
      color: active ? t.text : t.textDim,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontFamily: t.sans,
      minWidth: children ? "auto" : 26,
      justifyContent: "center",
    }}>
      <span>{icon}</span>{children && <span>{children}</span>}
    </button>
  );
}

function PageSelector({ theme, value = 4, onChange }) {
  const t = tokens(theme);
  const page = PAGES[value];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      background: t.pill,
      borderRadius: 8,
      padding: "5px 10px 5px 8px",
      fontSize: 12,
      color: t.text,
      cursor: "pointer",
    }}>
      <span style={{
        background: t.panel,
        color: t.textDim,
        padding: "2px 6px",
        borderRadius: 4,
        fontSize: 10,
        fontFamily: t.mono,
      }}>{String(page.idx).padStart(2, "0")}</span>
      <span style={{ fontWeight: 500 }}>{page.title}</span>
      <span style={{ color: t.textFaint, fontSize: 10 }}>▾</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// PageList — left rail vertical list with groups
function PageList({ theme, currentIdx = 4, compact = false, height }) {
  const t = tokens(theme);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, fontFamily: t.sans, height }}>
      {PAGES.map(p => {
        const active = p.idx === currentIdx;
        return (
          <div key={p.idx} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: compact ? "5px 8px" : "6px 10px",
            background: active ? t.accentBg : "transparent",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: compact ? 11 : 12,
            color: active ? t.text : t.textDim,
            position: "relative",
          }}>
            <span style={{
              fontFamily: t.mono,
              fontSize: 10,
              color: active ? t.accent : t.textFaint,
              width: 16,
            }}>{String(p.idx).padStart(2, "0")}</span>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: GROUP_COLORS[p.group] || t.textFaint,
              flexShrink: 0, opacity: 0.85,
            }} />
            <span style={{ fontWeight: active ? 500 : 400, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.title}
            </span>
            {active && <span style={{ color: t.accent, fontSize: 9 }}>●</span>}
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// WidgetTree — hierarchical tree of widgets on the current page
function WidgetTree({ theme, tree = BATTERY_TREE, topLayer = TOP_LAYER_TREE }) {
  const t = tokens(theme);
  return (
    <div style={{ fontFamily: t.sans, fontSize: 12 }}>
      <div style={{ color: t.textFaint, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6, fontWeight: 600 }}>
        battery_page
      </div>
      {tree.map(n => <TreeNode key={n.id} n={n} t={t} />)}
      <div style={{ color: t.textFaint, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", margin: "14px 0 6px", fontWeight: 600 }}>
        Top layer
      </div>
      {topLayer.map(n => <TreeNode key={n.id} n={n} t={t} />)}
    </div>
  );
}

function TreeNode({ n, t }) {
  const selected = n.selected;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "4px 6px",
      paddingLeft: 6 + n.depth * 14,
      background: selected ? t.accentBg : "transparent",
      borderRadius: 5,
      color: n.hidden ? t.textFaint : (selected ? t.text : t.textDim),
      fontSize: 12,
      cursor: "pointer",
    }}>
      <span style={{
        width: 16, height: 16,
        display: "grid", placeItems: "center",
        background: selected ? "rgba(92,140,255,0.2)" : "transparent",
        color: selected ? t.accent : t.textFaint,
        fontFamily: t.mono,
        fontSize: 11,
        borderRadius: 3,
      }}>{n.icon}</span>
      <span style={{
        fontFamily: typeOf(n) === "id" ? t.sans : t.mono,
        fontSize: 11,
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>{n.label}</span>
      <span style={{ color: t.textFaint, fontSize: 9, fontFamily: t.mono }}>{n.type}</span>
      {n.hidden && <span style={{ color: t.textFaint, fontSize: 9 }}>○</span>}
    </div>
  );
}
function typeOf(n) { return n.label.startsWith('"') ? "literal" : "id"; }

// ──────────────────────────────────────────────────────────────────────────
// Inspector — property panel for the selected widget
function Inspector({ theme, sections = BATTERY_LABEL_INSPECTOR }) {
  const t = tokens(theme);
  return (
    <div style={{ fontFamily: t.sans }}>
      <div style={{
        padding: "8px 10px",
        background: t.panel2,
        borderRadius: 8,
        marginBottom: 12,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontFamily: t.mono, fontSize: 10, color: t.textFaint }}>T</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: t.text }}>battery_value_label</div>
          <div style={{ fontSize: 10, color: t.textFaint, fontFamily: t.mono }}>label · page 4</div>
        </div>
        <span style={{
          fontSize: 10, padding: "2px 6px",
          background: "rgba(0,204,102,0.15)", color: "#00CC66",
          borderRadius: 4, fontFamily: t.mono,
        }}>bound</span>
      </div>

      {sections.map(s => (
        <div key={s.section} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: t.textFaint, marginBottom: 6 }}>
            {s.section}
          </div>
          {s.fields.map(f => <InspectorField key={f.k} f={f} t={t} />)}
        </div>
      ))}
    </div>
  );
}

function InspectorField({ f, t }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "70px 1fr",
      gap: 8,
      alignItems: "center",
      padding: "4px 0",
      fontSize: 12,
    }}>
      <span style={{ color: t.textDim, fontFamily: t.mono, fontSize: 11 }}>{f.k}</span>
      <div style={{
        background: t.panel2,
        border: `1px solid ${t.borderS}`,
        borderRadius: 5,
        padding: "3px 8px",
        fontFamily: t.mono,
        fontSize: 11,
        color: t.text,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        {f.swatch && <span style={{ width: 10, height: 10, borderRadius: 2, background: f.swatch, border: `1px solid ${t.border}` }}/>}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{String(f.v)}</span>
        {f.driven && <span style={{ fontSize: 9, color: t.accent }}>↻</span>}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// DrivePanel — the "make the sim do something" panel
function DrivePanel({ theme, tab = "sensors", showTabs = true, compact = false }) {
  const t = tokens(theme);
  return (
    <div style={{ fontFamily: t.sans, fontSize: 12 }}>
      {showTabs && (
        <div style={{
          display: "flex", gap: 2,
          background: t.pill,
          borderRadius: 7,
          padding: 2,
          marginBottom: 12,
        }}>
          <DriveTab theme={theme} active={tab === "sensors"}>Sensors</DriveTab>
          <DriveTab theme={theme} active={tab === "globals"}>Globals</DriveTab>
          <DriveTab theme={theme} active={tab === "popups"}>Top layer</DriveTab>
        </div>
      )}
      {tab === "sensors" && <SensorList theme={theme} compact={compact} />}
      {tab === "globals" && <GlobalsList theme={theme} />}
      {tab === "popups"  && <PopupsList theme={theme} />}
    </div>
  );
}

function DriveTab({ theme, active, children }) {
  const t = tokens(theme);
  return (
    <button style={{
      flex: 1,
      background: active ? t.panel : "transparent",
      color: active ? t.text : t.textDim,
      border: "none",
      borderRadius: 5,
      padding: "5px 8px",
      fontSize: 11,
      fontWeight: active ? 600 : 500,
      cursor: "pointer",
    }}>{children}</button>
  );
}

function SensorList({ theme, compact }) {
  const t = tokens(theme);
  const show = compact ? SENSORS.slice(0, 6) : SENSORS;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 10 }}>
      {show.map(s => <SensorRow key={s.id} s={s} t={t} />)}
    </div>
  );
}

function SensorRow({ s, t }) {
  const [min, max] = s.range;
  const pct = ((s.v - min) / (max - min)) * 100;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: t.textDim, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }}/>
          {s.label}
        </span>
        <span style={{ fontFamily: t.mono, fontSize: 11, color: t.text }}>
          {s.v}<span style={{ color: t.textFaint, marginLeft: 3 }}>{s.unit}</span>
        </span>
      </div>
      <div style={{
        height: 4,
        background: t.borderS,
        borderRadius: 2,
        overflow: "hidden",
      }}>
        <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: s.color }}/>
      </div>
    </div>
  );
}

function GlobalsList({ theme }) {
  const t = tokens(theme);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {GLOBALS.map(g => (
        <div key={g.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 8px", background: t.panel2, borderRadius: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: t.text }}>{g.label}</div>
            <div style={{ fontSize: 9, fontFamily: t.mono, color: t.textFaint }}>{g.id}</div>
          </div>
          <GlobalControl g={g} t={t} />
        </div>
      ))}
    </div>
  );
}

function GlobalControl({ g, t }) {
  if (g.type === "bool") {
    return (
      <div style={{
        width: 32, height: 18,
        background: g.v ? t.accent : t.border,
        borderRadius: 10, position: "relative",
      }}>
        <div style={{
          position: "absolute",
          top: 2, left: g.v ? 16 : 2,
          width: 14, height: 14, borderRadius: "50%",
          background: t.panel,
          boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
        }}/>
      </div>
    );
  }
  if (g.type === "enum") {
    return (
      <div style={{
        fontFamily: t.mono, fontSize: 11,
        background: t.panel, padding: "3px 8px", borderRadius: 4,
        border: `1px solid ${t.borderS}`,
        color: t.text,
      }}>{g.options[g.v]} ▾</div>
    );
  }
  return (
    <div style={{
      fontFamily: t.mono, fontSize: 11,
      background: t.panel, padding: "3px 8px", borderRadius: 4,
      border: `1px solid ${t.borderS}`,
      color: t.text,
    }}>{g.v}{g.unit ? " " + g.unit : ""}</div>
  );
}

function PopupsList({ theme }) {
  const t = tokens(theme);
  const popups = [
    { id: "ping_popup",        title: "Ping gateway",        active: false },
    { id: "dns_popup",         title: "DNS resolve",         active: false },
    { id: "temp_minmax_popup", title: "Temp 24h range",      active: false },
    { id: "bat_alarm_popup",   title: "Low-battery alarm",   active: false },
    { id: "clock_screensaver", title: "Clock screensaver",   active: false },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {popups.map(p => (
        <div key={p.id} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "7px 10px",
          background: t.panel2,
          borderRadius: 6,
          fontSize: 12,
        }}>
          <div>
            <div style={{ color: t.text }}>{p.title}</div>
            <div style={{ fontSize: 9, fontFamily: t.mono, color: t.textFaint }}>{p.id}</div>
          </div>
          <button style={{
            background: t.panel, color: t.textDim,
            border: `1px solid ${t.border}`,
            borderRadius: 5, padding: "3px 10px",
            fontSize: 11, cursor: "pointer", fontFamily: t.sans,
          }}>Show</button>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// SwipeMap — visualises the 4-direction page graph for the active page
function SwipeMap({ theme }) {
  const t = tokens(theme);
  const arrow = (dir, target) => {
    const arrows = { left: "←", right: "→", up: "↑", down: "↓" };
    const positions = {
      left:  { left: 0, top: "50%", transform: "translateY(-50%)" },
      right: { right: 0, top: "50%", transform: "translateY(-50%)" },
      up:    { left: "50%", top: 0, transform: "translateX(-50%)" },
      down:  { left: "50%", bottom: 0, transform: "translateX(-50%)" },
    };
    return (
      <div key={dir} style={{ position: "absolute", ...positions[dir], textAlign: "center" }}>
        <div style={{ color: target ? t.textDim : t.textFaint, fontSize: 14 }}>{arrows[dir]}</div>
        {target && (
          <div style={{ fontSize: 9, color: t.textDim, fontFamily: t.mono, marginTop: 2 }}>
            {String(target.idx).padStart(2,"0")} {target.title}
          </div>
        )}
      </div>
    );
  };
  return (
    <div style={{
      position: "relative",
      height: 90,
      background: t.panel2,
      borderRadius: 8,
      padding: 8,
      fontFamily: t.sans,
    }}>
      {arrow("left",  SWIPE_MAP.left)}
      {arrow("right", SWIPE_MAP.right)}
      {arrow("up",    SWIPE_MAP.up)}
      {arrow("down",  SWIPE_MAP.down)}
      <div style={{
        position: "absolute",
        left: "50%", top: "50%",
        transform: "translate(-50%, -50%)",
        background: t.accent, color: "#fff",
        padding: "3px 10px", borderRadius: 6,
        fontSize: 11, fontWeight: 600,
      }}>04 Battery</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// YamlPane — syntax-tinted YAML view
function YamlPane({ theme, height, source = YAML_SAMPLE, withGutter = true }) {
  const t = tokens(theme);
  const lines = source.split("\n");
  return (
    <div style={{
      fontFamily: t.mono,
      fontSize: 12,
      lineHeight: 1.55,
      color: t.text,
      background: t.panel,
      height,
      overflow: "auto",
      padding: "10px 0",
      whiteSpace: "pre",
    }}>
      {lines.map((line, i) => (
        <div key={i} style={{ display: "flex", paddingRight: 16 }}>
          {withGutter && (
            <span style={{
              width: 36, flexShrink: 0,
              textAlign: "right", paddingRight: 10,
              color: t.textFaint,
              fontSize: 10,
              userSelect: "none",
            }}>{i + 1}</span>
          )}
          <span style={{ flex: 1 }} dangerouslySetInnerHTML={{ __html: colorYaml(line, t) }} />
        </div>
      ))}
    </div>
  );
}

function colorYaml(line, t) {
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let out = esc(line);
  // Comment
  if (/^\s*#/.test(line)) {
    return `<span style="color:${t.textFaint}">${out}</span>`;
  }
  // hex color (0xRRGGBB) — colorize with that color
  out = out.replace(/0x([0-9A-F]{6})\b/gi, (_, hex) => {
    return `<span style="color:#${hex}">0x${hex}</span>`;
  });
  // Strings
  out = out.replace(/"([^"]*)"/g, `<span style="color:#00CC88">"$1"</span>`);
  // Keys
  out = out.replace(/^(\s*-?\s*)([a-z_][a-z0-9_]*)(\s*:)/i,
    `$1<span style="color:${t.accent}">$2</span>$3`);
  // Numbers
  out = out.replace(/\b(\d+\.?\d*)\b/g, `<span style="color:#FFAA55">$1</span>`);
  // Constants/symbols (CENTER, MOVE_LEFT, etc)
  out = out.replace(/\b([A-Z_]{3,})\b/g, `<span style="color:#FFCC66">$1</span>`);
  return out;
}

Object.assign(window, {
  tokens, Panel, Toolbar, ToolbarBtn, ToolbarGroup, PageSelector,
  PageList, WidgetTree, Inspector, DrivePanel, SwipeMap, YamlPane,
});
