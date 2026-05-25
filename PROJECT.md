# ESPHome LVGL Simulator — Project Context

A browser-based simulator for ESPHome LVGL display configurations.
Paste ESPHome YAML → see a live visual preview of the LVGL display.
No build step. Pure HTML + vanilla JS + CSS. Hosted on GitHub Pages.

All issues tracked at: https://github.com/ndls21/esphome-lvgl-simulator/issues
Issue #45 is the master roadmap with dependency graph and sprint order.

---

## Architecture

```
index.html              — UI shell, CDN imports (js-yaml 4.1.0), layout
lvgl-simulator.js       — Entry point: imports, ESPHomeLVGLSimulator core class,
                          Object.assign(prototype, widget renderers)
core/store.js           — SimulatorStateStore (observable key-value store)
core/preprocessor.js    — preprocessYAML() pure function
widgets/obj.js          — renderObj
widgets/label.js        — renderLabel
widgets/button.js       — renderButton
widgets/bar.js          — renderBar
widgets/arc.js          — renderArc, makeSVGArc, applyArcPosition
styles.css              — Dark-theme UI + LVGL widget CSS classes
example_config.yaml     — Default config loaded on startup
esphome_proxy.py        — (Stage 6) Local WebSocket bridge to ESP32 device
requirements.txt        — Python deps for proxy script
.github/workflows/      — GitHub Actions (GitHub Pages deploy)
```

Key CDN dependencies (loaded in index.html, no npm/build):
- `js-yaml 4.1.0` — YAML parsing (loaded as non-module script; available as `jsyaml` global)
- Google Fonts — Montserrat, Roboto

### How the module system works

`lvgl-simulator.js` imports each widget renderer as a plain function and assigns
it to `ESPHomeLVGLSimulator.prototype` using `Object.assign`. Widget files use
`this.*` normally — `this` resolves to the simulator instance at call time.

```js
// widgets/bar.js — no imports needed; this.* works via prototype binding
export function renderBar(config, parent) {
    const cfg = this.resolveStyles(config);  // this = ESPHomeLVGLSimulator instance
}
```

Widget files have no imports. All simulator methods (`this.parseColor`, `this.applyCommonStyles`, etc.) are available via `this`.

---

## Parallel work — file ownership

| Issue type | Files written | Safe to parallelise? |
|---|---|---|
| New widget (e.g. slider, checkbox) | `widgets/<type>.js` (new), `styles.css` (append), `lvgl-simulator.js` (2 lines) | ✅ Yes — with each other |
| Preprocessor fix | `core/preprocessor.js` | ✅ Yes — with widget issues |
| State store addition | `core/store.js` | ✅ Yes — with widget issues |
| UI panel / layout change | `index.html`, `styles.css` | ⚠️ Serialise with other `styles.css` writers |
| `renderWidget` dispatch change | `lvgl-simulator.js` | ⚠️ Serialise — only one agent at a time |
| `applyCommonStyles` / core utils | `lvgl-simulator.js` | ❌ Do not parallelise |

`styles.css` and `lvgl-simulator.js` conflicts from widget work are additive (one appended block, one import + one case line per widget) — take BOTH sides when resolving.

---

## Coding Conventions

### Adding a new widget renderer — mandatory checklist

Every new widget lives in its own file. Three files to touch:

**1. Create `widgets/<type>.js`**

```js
export function renderFoo(config, parent) {
    const cfg = this.resolveStyles(config);   // ALWAYS first — use cfg, never config
    const el = document.createElement('div');
    el.className = 'lvgl-foo';
    this.applyCommonStyles(el, cfg);          // position/size/borders/padding
    // widget-specific logic
    return el;
}
```

- `this.resolveStyles(config)` must be the first call
- Check lambda values via `String(val).includes('__lambda__')` — render a safe fallback
- Handle `widgets:` children by calling `this.renderWidget(child, el)` in a forEach
- Handle parts sub-blocks via `this.extractPartStyles(cfg, 'main')` etc.

**2. Add to `lvgl-simulator.js`**

One import at the top:
```js
import { renderFoo } from './widgets/foo.js';
```

One entry in `Object.assign`:
```js
renderFoo,
```

One dispatch case in `renderWidget()`:
```js
case 'foo': return this.renderFoo(cfg, parent);
```

**3. Add CSS to `styles.css`**

```css
.lvgl-foo {
    position: absolute;
    box-sizing: border-box;
}
```

Dynamic values (colors, sizes from config) go in `el.style.*` in JS, not here.

### JS style
- Vanilla JS only — no frameworks, no TypeScript, no npm
- ES6+ fine (arrow functions, const/let, destructuring, template literals)
- Method names: camelCase. CSS classes: kebab-case with `lvgl-` prefix
- Colors always go through `this.parseColor()` — never apply raw config values to style.color
- Never use `eval()` — the lambda evaluator uses `new Function()` with an explicit sandboxed scope (intentional, documented in issue #28)

### CSS conventions
- Structural CSS (position, box-sizing, display defaults) lives in `styles.css`
- Dynamic values from config go in `el.style.*` in JS
- Each widget gets exactly one CSS class: `.lvgl-<type>`
- Sub-elements: `.lvgl-<type>__<part>` (e.g. `.lvgl-slider__knob`)

### What NOT to do
- Do not add click handlers, drag, hover transitions, or any interactivity — static render only
- Do not add CSS animations or transitions
- Do not add new CDN libraries without flagging it first
- Do not touch `preprocessYAML()` or `renderWidget()` for low/moderate complexity issues — these are high-risk central functions

---

## Known Gotchas

**Preprocessing order matters.**
`preprocessYAML()` runs as text manipulation BEFORE `js-yaml.load()`. Do not handle ESPHome-specific constructs on the parsed JS object.

**Globals vs sensors in lambdas.**
ESPHome globals: `id(x)` — no `.state` suffix.
Sensors/binary_sensors/text_sensors: `id(x).state`.
The lambda evaluator must handle both. See issue #30.

**`radius: 255` means circular.**
Map any radius >= 100 to `border-radius: 50%`.

**`options` on roller/dropdown.**
Accepts both a YAML list and a newline-separated string. Always normalise:
```js
const options = Array.isArray(cfg.options)
  ? cfg.options.map(String)
  : String(cfg.options || '').split('\n').filter(Boolean);
```

**`selected_index` not `selected`.**
`selected_index` (integer) is the value property. `selected:` is a PART styling block. See issue #44.

**`SIZE_CONTENT` for width/height.** Map to `width: max-content` / `height: max-content`.

**Event triggers are ignored.**
`on_click`, `on_value`, `on_press` etc. — silently skip all `on_*` properties.

**`flex_grow` on children.**
Map `flex_grow: 1` to CSS `flex-grow: 1` on the child element, applied in `applyCommonStyles`.

---

## Verification Protocol

No automated test suite. Verification differs by context:

### Inside a worktree (no browser available)
1. Read every changed file and confirm it matches the issue specification.
2. Verify every Acceptance Criteria checkbox against the code.
3. Run `node --check` on every modified JS file:
   ```bash
   node --check widgets/<type>.js
   node --check lvgl-simulator.js
   ```
4. Confirm the widget file exports correctly and `lvgl-simulator.js` includes it in both the `renderWidget` switch and the `Object.assign` block.
5. For preprocessor changes: mentally trace a YAML string with `!lambda`, `!secret`, and nested indentation through the new regex logic.
6. Confirm no existing functions were removed or signatures changed.

### In an interactive session (browser available)
1. Load `example_config.yaml` → confirm it renders correctly (no regressions).
2. Paste a minimal YAML snippet exercising the new feature → confirm render.
3. Check DevTools console for zero uncaught JS errors.
4. Step through each Acceptance Criteria checkbox manually.

---

## Agent Workflow — simulator additions

### Picking up a ticket
- Read issue #45 (roadmap) to confirm all dependencies are merged before starting
- The implementation in the issue body is a **specification**, not optional guidance — follow it exactly

### Definition of Done
- All Acceptance Criteria checkboxes satisfied
- `example_config.yaml` renders without regressions
- A YAML snippet exercising the new feature tested in the editor
- No uncaught JS errors in the browser console
- PR created, issue referenced in PR body
