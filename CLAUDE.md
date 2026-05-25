# ESPHome LVGL Simulator — CLAUDE.md

## Project Overview
A browser-based simulator for ESPHome LVGL display configurations.
Paste ESPHome YAML → see a live visual preview of the LVGL display.
No build step. Pure HTML + vanilla JS + CSS. Hosted on GitHub Pages.

## Architecture
```
index.html            — UI shell, CDN imports (js-yaml 4.1.0), layout
lvgl-simulator.js     — All rendering logic (single class: LVGLSimulator)
styles.css            — Dark-theme UI + LVGL widget CSS classes
example_config.yaml   — Default config loaded on startup
esphome_proxy.py      — (Stage 6) Local WebSocket bridge to ESP32 device
requirements.txt      — Python deps for proxy script
.github/workflows/    — GitHub Actions (GitHub Pages deploy)
```

Key CDN dependencies (loaded in index.html, no npm/build):
- `js-yaml 4.1.0` — YAML parsing
- Google Fonts — Montserrat, Roboto

All issues tracked at: https://github.com/ndls21/esphome-lvgl-simulator/issues
Issue #45 is the master roadmap with dependency graph and sprint order.

---

## Subagent Autonomy Rules

These rules govern when a subagent (or any Claude session) should
commit/push independently vs pause for human review.

### Commit and push autonomously when ALL of these are true:
- The change touches ≤ 3 files
- The change implements or fixes a single GitHub issue
- No existing rendering logic is restructured (new code added, not old code rewritten)
- The Acceptance Criteria in the issue are all met
- The example_config.yaml still renders correctly after the change
- No new external dependencies are introduced

### Stop and check in with the user when ANY of these are true:
- The change requires restructuring existing functions (not just adding new ones)
- The change touches the rendering pipeline in a way that could break
  all existing widgets (e.g. renderWidget, applyCommonStyles, preprocessYAML)
- The issue has unresolved ambiguity that the issue body doesn't answer
- A merge conflict cannot be cleanly resolved (see Merge Protocol below)
- The implementation approach differs significantly from what the issue describes

### Complexity self-assessment guide
| Complexity | Examples | Action |
|---|---|---|
| Low | New widget renderer, CSS addition, preprocessor regex fix | Commit + push |
| Low | New state store method, parse a new YAML block | Commit + push |
| Moderate | Adding a new panel to the UI (HTML + JS + CSS together) | Commit + push |
| Moderate | Implementing lambda translator with new function | Commit + push |
| High | Restructuring preprocessYAML, changing renderWidget dispatch | Check in first |
| High | Adding a new class that changes how the simulator initialises | Check in first |
| High | Anything that requires changes across 5+ files | Check in first |

---

## Parallel Work Protocol

Multiple subagents work on separate issues simultaneously. To do this safely:

### Starting work on an issue
1. Fetch the latest main branch first:
   ```
   git fetch origin main
   git checkout -b issue/<number>-short-description origin/main
   ```
2. Confirm the issue's dependencies are merged into main before starting.
   Check issue #45 for the dependency graph.
3. If a dependency is not yet merged, either wait or pick a different issue.

### Finishing work on an issue
1. Run the verification checklist (see below).
2. Stage only the files relevant to this issue:
   ```
   git add <specific files>
   ```
3. Commit with the format: `[#<number>] Description of what and why`
4. Rebase onto latest main to stay current:
   ```
   git fetch origin main
   git rebase origin/main
   ```
5. Resolve any conflicts (see Merge Protocol below), then push:
   ```
   git push -u origin issue/<number>-short-description
   ```
6. Create a draft PR immediately after pushing (required — do not skip).
7. Close the GitHub issue or add a comment linking to the PR.

### Merge Protocol — resolving conflicts without human involvement
When `git rebase origin/main` produces conflicts:

1. Open each conflicted file. Read both sides carefully.
2. If the conflict is in a file you did NOT touch (e.g. a parallel agent
   also touched styles.css): take BOTH changes — preserve the other
   agent's work and add yours alongside it.
3. If the conflict is in a file you DID touch and the other change is in
   a completely separate function: keep both sets of changes intact.
4. If the conflict is in code you both modified (same lines): examine
   what both changes are trying to do. If compatible, merge them
   manually. If truly incompatible, stop and flag to the user.
5. After resolving:
   ```
   git add <resolved files>
   git rebase --continue
   git push -u origin <branch> --force-with-lease
   ```
6. Note the conflict and resolution in the PR description.

Only escalate to the user if: the two changes are semantically
incompatible and merging them would require understanding intent
beyond what the issues describe.

---

## Issue Workflow

### Picking up an issue
1. Read the full issue body. It contains function signatures, CSS, and edge cases.
   The implementation in the issue body is a specification, not optional guidance.
2. Read issue #45 (roadmap) to confirm all dependencies are merged.
3. Read every file you will touch using the Read tool before editing.
4. If the issue says "depends on #X" — check that #X is in main first.

### Definition of Done for an issue
- All Acceptance Criteria checkboxes in the issue are satisfied
- `example_config.yaml` renders without regressions
- A YAML snippet exercising the new feature has been tested in the editor
- No uncaught JS errors in the browser console
- Code matches the style conventions below
- PR created, issue referenced in PR body

---

## Coding Conventions

### Adding a new widget renderer — mandatory checklist
Every new widget MUST follow this order:

1. Add `case 'widget_type':` in `renderWidget()` switch (~line 217 of lvgl-simulator.js)
2. Call `this.resolveStyles(config)` at the top — use `cfg`, not `config`, throughout
3. Call `this.applyCommonStyles(el, cfg)` for position/size/borders/padding
4. Handle lambda values via `this.lambda.evaluate(val, fallback)` — never
   manually check for `__lambda__` strings after Stage 4 lands
5. Add CSS class `.lvgl-<type>` in styles.css with at minimum:
   `position: absolute; box-sizing: border-box;`
6. Handle `widgets:` children array if the widget can contain children
7. Handle `parts` sub-blocks (main/indicator/knob) via `extractPartStyles()`

### General JS style
- Vanilla JS only — no frameworks, no TypeScript, no npm
- ES6+ features are fine (arrow functions, const/let, destructuring, template literals)
- No comments unless the WHY is non-obvious (not what the code does)
- Method names: camelCase. CSS classes: kebab-case with `lvgl-` prefix
- Colors always go through `this.parseColor()` — never apply raw config values to style.color
- Never use `eval()` — the lambda evaluator uses `new Function()` with an
  explicit sandboxed scope (intentional, documented in issue #28)

### CSS conventions
- Widget structural CSS (position, box-sizing, display defaults) lives in styles.css
- Dynamic values from config (bg_color, width, border-radius) are applied via el.style.* in JS
- Each widget gets exactly one CSS class: `.lvgl-<type>`
- Sub-elements get: `.lvgl-<type>__<part>` (e.g. `.lvgl-slider__knob`)

### What NOT to do
- Do not add click handlers, drag, hover transitions, or any interactivity —
  the simulator renders static state only
- Do not add CSS animations or transitions (spinner exception: static in Phase 1)
- Do not add new CDN libraries without flagging it first
- Do not touch `preprocessYAML()` or `renderWidget()` for low/moderate
  complexity issues — these are high-risk central functions

---

## Known Gotchas — Read Before Coding

**Preprocessing order matters.**
`preprocessYAML()` runs as text manipulation BEFORE `js-yaml.load()`.
Substitutions, tag stripping, and lambda capture all happen at the text level.
Do not try to handle ESPHome-specific constructs on the parsed JS object.

**Globals vs sensors in lambdas.**
ESPHome globals are accessed as `id(x)` — NO `.state` suffix.
Sensors/binary_sensors/text_sensors use `id(x).state`.
The lambda evaluator must handle BOTH patterns. See issue #30.

**`radius: 255` means circular.**
LVGL uses 255 (or 65535) as a sentinel for fully circular border-radius.
Map any radius >= 100 to CSS `border-radius: 50%`.

**`options` on roller/dropdown.**
Accepts BOTH a YAML list AND a newline-separated string. Always normalise:
```js
const options = Array.isArray(cfg.options)
  ? cfg.options.map(String)
  : String(cfg.options || '').split('\n').filter(Boolean);
```

**`selected_index` not `selected`.**
roller and dropdown use `selected_index` (integer) as the property name.
The `selected:` block is a PART styling block, not the index. See issue #44.

**`SIZE_CONTENT` for width/height.**
Map to CSS `width: max-content` / `height: max-content`.

**Event triggers are ignored.**
`on_click`, `on_value`, `on_press` etc. appear in widget configs but the
simulator has no runtime — silently skip all `on_*` properties.

**`flex_grow` on children.**
Children inside a flex container can have `flex_grow: 1` — map to CSS
`flex-grow: 1` on the child element, applied in `applyCommonStyles`.

---

## Verification Protocol
There is no automated test suite. Before every commit:

1. Load `example_config.yaml` in the editor → confirm it renders correctly
   (no regressions to existing obj/label/arc widgets)
2. Write a minimal YAML snippet that exercises only the new/changed feature
   and confirm it renders as described in the issue
3. Verify every Acceptance Criteria checkbox in the issue is satisfied
4. Open browser DevTools console — confirm zero uncaught JS errors
5. For preprocessor changes: test a YAML with multiple `!lambda` blocks,
   `!secret`, and nested indentation — confirm nothing is corrupted

---

## Git Conventions
- Branch per issue: `issue/<number>-short-description`
  e.g. `issue/13-styles-block`, `issue/17-preprocessor-hardening`
- Commit format: `[#<number>] What changed and why in one line`
- One issue per branch, one PR per issue
- Do not bundle unrelated fixes into an issue's PR
- Always create the PR as draft
- Main branch is `main` — never push directly to main
