# Handoff: CamperOS Simulator — Host UI

## Overview
A desktop **host application for previewing and debugging a CamperOS device UI** that runs on a round 412×412 LVGL display (Waveshare 1.46B). The device's screens are **defined entirely in YAML** (`waveshare-146.yaml`, ~5,300 lines, 36 pages). This host app ingests that YAML, renders a live preview of the resulting device screen, and lets a developer inspect widgets, read the relevant YAML slices, and *simulate* runtime state (sensor values, globals, popups) to see how the device reacts — without flashing hardware.

The design is a single screen (one window, multiple panels). The example page shown throughout is **page 4, `battery_page`** — a circular battery state-of-charge gauge.

## About the Design Files
The files in this bundle are **design references created in HTML/React (via inline Babel)** — prototypes showing intended look and behavior, **not production code to copy directly**. The components are presentational only: state is mocked, the YAML is static sample text, and the "editor" is styled markup, not a real text editor.

The task is to **recreate this design in the target codebase's environment**, using its established patterns, component library, and conventions. If no environment exists yet, choose an appropriate stack (the design is a desktop tool — Electron + React, Tauri, or a web app are all reasonable) and implement there. The real implementation must wire in:
- A YAML parser that reads the actual `waveshare-146.yaml` and builds the page/widget model.
- A renderer that turns the parsed widget tree into the device preview (ideally a real LVGL simulator/WASM build, or a faithful canvas/DOM re-render).
- A live state layer for the Drive panel.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, and layout are final and should be matched closely. Exact tokens are listed under **Design Tokens** below. The one deliberate abstraction: the YAML panes and the device render are mocked — those become real parsing/rendering work.

## Key Product Decision (important — drove this design)
The CamperOS UI is **YAML-in → visualization-out**. The `.yaml` files are the source of truth, authored in the repo (a separate editor / version control), and ingested by this host. Therefore:
- **The YAML shown in this app is READ-ONLY.** It is for *reference while debugging*, not editing. Every YAML view carries a `read-only · authored in repo` badge and a **Reload** action (re-parse from disk). Do **not** build write-back / serialization.
- **The only place state mutates is the "Drive" panel**, and that is **simulation-only runtime state** — it is explicitly *not* written back to YAML (labeled `simulation only · not written to YAML`). Driving a sensor or global updates the live preview only.

Keep this distinction visible in the real implementation — it is the core mental model of the tool.

## Screens / Views

There is one window. Layout is a fixed 1440×840 frame (scaled to fit the viewport via a transform on a centered stage; in production, make it a normal resizable window and let the panels flex).

### Overall layout
```
┌────────────────────────────────────────────────────────────┐
│ Top bar (44px)                                               │
├──────────┬──────────────────────────────────┬───────────────┤
│ LEFT     │                                  │ RIGHT         │
│ RAIL     │      HERO CANVAS (device)        │ RAIL          │
│ "Pages"  │   round 412px preview, floating  │ "Inspect"     │
│ 220px    │   in a radial-gradient void with │ + "Tree"      │
│          │   left/right/up swipe arrows     │ 300px         │
│          ├──────────────────────────────────┤               │
│          │  BOTTOM CONSOLE (252px tall)     │               │
│          │  tabs + read-only YAML / Drive   │               │
└──────────┴──────────────────────────────────┴───────────────┘
```
- Left rail: fixed 220px, full height, `borderRight`.
- Right rail: fixed 300px, full height, `borderLeft`.
- Bottom console: 252px tall, spans the gap *between* the two rails (left:220, right:300, bottom:0).
- Hero canvas: fills the remaining open area (left:220, right:300, top:0, bottom:252).

### 1. Top bar
- Height 44px, `background: panel`, `borderBottom: 1px border`, font-size 12px.
- **Left cluster** (gap 10): an 18×18 rounded-5 logo chip with gradient `linear-gradient(135deg,#00CC66,#00AAFF)`; bold "LVGL Studio"; then faint mono caption `waveshare-146.yaml · 412×412 · Waveshare 1.46B`.
- **Right cluster** (gap 10): a "↺ Reload YAML" button; a **Page selector** (mono index chip `04` + page title "Battery", pill background, radius 8); a "⊞ All pages" button; a 28×28 theme-toggle button (☾/☼).

### 2. Left rail — "Pages"
- Header row (padding 10/12, `borderBottom: borderS`): uppercase "PAGES" label (11px, 600, letter-spacing .06em, color textDim) + a mono count badge `36` (pill bg).
- Body: scrollable list of all 36 pages. Each row (padding 5/8, radius 6): a 2-digit mono index (`00`–`35`), a 6px group-color dot, the page title (11px). The **active row** (idx 4) uses `accentBg` background. Group dot colors are in **Design Tokens → Group colors**.

### 3. Hero canvas — device preview
- Background: radial gradient. Dark: `radial-gradient(ellipse at center,#14171d 0%,#0a0b0e 70%)`. Light: `radial-gradient(ellipse at center,#f0f1f4 0%,#d9dbe0 100%)`.
- **Device** centered, rendered at scale 0.86. It is a round 412×412 screen inside a 28px circular bezel:
  - Bezel: `radial-gradient(circle at 30% 25%,#2a2a2e,#141416 60%,#0a0a0c)`, with inset hairline + drop shadow `0 18px 40px rgba(0,0,0,0.45)`.
  - Screen content (Battery page): a circular **arc gauge** — radius 130, stroke 14, sweeping 270° (start 135° → end 45°), filled to SOC %. Center shows a battery glyph, a large "78 %" value, and a "Battery SOC" title. (In production this is the LVGL render output, not hand-built SVG.)
  - A soft elliptical **floor shadow** below the device.
- **Swipe affordances**: three 34px circular buttons arced around the device (left `←`, right `→`, up `↑`), each with a mono caption of the destination page (e.g. `05 Solar`, `15 Power Flow`). These represent the device's 4-direction swipe navigation graph for the current page.

### 4. Right rail — "Inspect" + "Tree"
- Header: uppercase "INSPECT" + mono subtitle of the selected widget (`battery_value_label`).
- **Inspector** (property panel for the selected widget):
  - A header chip (`panel2` bg, radius 8): widget type icon, name, and a green `bound` badge (`background: rgba(0,204,102,0.15)`, color `#00CC66`) indicating the value is data-bound.
  - Property rows grouped into sections (Geometry, Style, Text, Binding). Each row: mono key (left, textDim) + a value field (`panel2` bg, `borderS` border, radius 5, mono). Color values show a 10px swatch; data-driven values show a `↻` accent glyph.
- **Tree** (below, after a small uppercase "TREE" label): the widget hierarchy of the current page (`battery_arc`, icon label, `battery_value_label` [selected → accentBg], title label) followed by the **top-layer** widgets shared across all pages (`dots_container`, `ping_popup`, `bat_alarm_popup`, `clock_screensaver`, etc. — hidden ones dimmed). Each node: a mono type-icon chip + name, indented by depth×14px.

### 5. Bottom console — tabbed (the v1 feature the user specifically wanted)
This is the contextual source/debug drawer. It spans between the rails, 252px tall, `background: panel`, `borderTop: border`, shadow `0 -4px 16px rgba(0,0,0,0.18)`.

- **Tab strip** (padding 7/12, `borderBottom: borderS`):
  - Three **mono** tabs for the *relevant YAML slices*: `battery_page` · `top_layer` · `globals`. (Active tab: `panel2` bg + `border`, radius 6.)
  - A vertical divider.
  - One **sans/uppercase-ish** tab: `◉ Drive`.
  - **Right side, context-dependent:**
    - For YAML tabs: a `⌧ read-only · authored in repo` pill, a mono location caption (`L 612 · page 4` / `shared overlay` / `shared globals`), and a "↺ Reload" button.
    - For Drive: a `◉ simulation only · not written to YAML` pill.
- **Body:**
  - YAML tabs → a syntax-styled, **non-editable** YAML pane showing only that slice:
    - `battery_page` → the selected page's YAML (`YAML_SAMPLE`).
    - `top_layer` → shared overlay widgets (`YAML_TOP_LAYER`).
    - `globals` → shared global variables (`YAML_GLOBALS`).
  - Drive tab → a 3-column grid: **Sensors** (live values with progress bars), **Globals** (toggles + value chips), **Top layer** (popup show/hide controls). These are the controls that drive the simulated runtime state into the preview.

## Interactions & Behavior
- **Page selection**: clicking a row in the left rail (or using the top page selector / swipe arrows) changes the active page → updates the device preview, the right-rail tree + inspector, and the `battery_page` YAML slice.
- **Widget selection**: clicking a node in the Tree selects it → populates the Inspector and updates the right-rail subtitle.
- **Console tabs**: clicking a tab switches the bottom body. YAML tabs are view-only (no caret, no editing). `Reload` re-parses the YAML from source.
- **Drive controls**: adjusting a sensor / toggling a global / showing a popup mutates **simulated runtime state only** and re-renders the preview. Never writes to YAML.
- **Theme toggle**: switches the entire host chrome between dark and light token sets. (The device screen itself stays dark — it's an OLED render.)
- Hover states: buttons and list rows get a subtle background lift; keep transitions quick (~120ms).

## State Management
State needed in a real implementation:
- `activePageIdx` (0–35) — drives preview, tree, inspector, and `battery_page` YAML slice.
- `selectedWidgetId` — drives the Inspector + tree highlight.
- `consoleTab` — one of `battery_page | top_layer | globals | drive`.
- `theme` — `dark | light` for host chrome.
- `simState` — the simulated runtime: sensor values, global values, visible popups. Feeds the preview renderer. **Ephemeral, never persisted to YAML.**
- `parsedModel` — the result of parsing `waveshare-146.yaml`: pages, per-page widget trees, top-layer widgets, globals. Re-derived on "Reload".

## Design Tokens

### Colors — dark theme (primary)
| Token | Value | Use |
|---|---|---|
| bg | `#0e1014` | app background |
| panel | `#16181d` | bars, rails, console, cards |
| panel2 | `#1c1f25` | inset fields, chips, secondary surfaces |
| border | `#23272f` | primary borders |
| borderS | `#1c1f25` | subtle/internal dividers |
| text | `#e6e8ec` | primary text |
| textDim | `#9aa0aa` | secondary text |
| textFaint | `#5d626c` | captions, placeholders |
| accent | `#5c8cff` | selection, active, driven values |
| accentBg | `rgba(92,140,255,0.16)` | selected row/node background |
| pill | `#23272f` | pill / segmented backgrounds |
| success | `#00CC66` | bound/OK |
| warn | `#FFCC00` | warning / sim indicator |
| danger | `#FF4444` | alarms |

### Colors — light theme
bg `#fafafb` · panel `#ffffff` · panel2 `#f4f5f7` · border `#e5e7eb` · borderS `#eef0f3` · text `#1a1d22` · textDim `#6b7280` · textFaint `#9ca3af` · accentBg `rgba(92,140,255,0.10)` · pill `#eef0f3`. (accent/success/warn/danger unchanged.)

### Group colors (page dots)
root `#6b7280` · hub `#9ca3af` · power `#FFCC00` · system `#00AAFF` · settings `#AAAAAA` · temp `#FF6644` · solar `#FFCC00` · shunt `#00CC66` · mains `#00CCCC` · energy `#FFAA33`.

### Brand gradient
`linear-gradient(135deg, #00CC66 0%, #00AAFF 100%)` (logo chip).

### Typography
- Sans: `Inter, -apple-system, "Segoe UI", Roboto, sans-serif`.
- Mono: `"JetBrains Mono", "SF Mono", ui-monospace, monospace` (used for indices, YAML, values, captions).
- Sizes: 10px (captions/badges), 11px (list rows, values, tabs), 12px (body, inspector), 13px (top bar emphasis). Uppercase section labels: 10–11px, weight 600, letter-spacing .06–.08em.

### Spacing / radius / shadow
- Layout dims: left rail 220, right rail 300, bottom console 252, top bar 44, frame 1440×840.
- Radius: 4–6 (chips, fields, rows), 8 (pills, selectors), 10 (cards/panels), 50% (dots, device, theme toggle).
- Common gaps: 1–2 (list rows), 6–10 (clusters), 12–18 (grid columns / section spacing).
- Shadows: rail `±4px 0 16px rgba(0,0,0,0.12)`; console `0 -4px 16px rgba(0,0,0,0.18)`; device `0 18px 40px rgba(0,0,0,0.45)`.

### Device geometry
Screen 412×412, bezel 28px. Arc gauge: radius 130, stroke 14, 270° sweep (135°→45°).

## Assets
No external image/icon assets — all glyphs are Unicode (↺ ⊞ ☾ ☼ ← → ↑ ◉ ⌧ ◯ ▣ T) and shapes are CSS. In production, swap to the codebase's icon set. The device render should come from the real LVGL pipeline, not the mock SVG.

## Files
Design-reference files included in this bundle (under `/design/`):
- `CamperOS Simulator UI.html` — entry; loads the chosen design (the combined v3+v1 direction).
- `app-final.jsx` — viewport-fit stage + theme state, renders `V4Final`.
- `v4-final.jsx` — **the chosen layout**: top bar, hero canvas, left/right rails, and the tabbed bottom console (read-only YAML slices + Drive).
- `ui-atoms.jsx` — shared presentational atoms + the `tokens(theme)` design-token function (source of truth for all colors/fonts above).
- `device-preview.jsx` — the round device + arc-gauge mock render.
- `camperos-data.jsx` — sample data model (36 pages, group colors, widget trees, sensors, globals, and the three YAML slice strings) sampled from the real `waveshare-146.yaml`.
- `CamperOS Simulator — Explorations.html` + `v1-classic-ide.jsx` / `v2-yaml-split.jsx` / `v3-preview-centric.jsx` — the three original exploration directions, included for context on what was considered and rejected (v2's edit-the-config model was dropped because YAML is read-only).

To preview the design: open `CamperOS Simulator UI.html` in a browser.
