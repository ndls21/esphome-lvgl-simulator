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

Subagents work on separate issues simultaneously using **git worktrees**.
Each agent runs in a fully isolated working directory — no branch switching,
no shared working tree state, no risk of agents interfering with each other.

### How the orchestrating session spawns parallel agents

The parent session uses `isolation: "worktree"` when calling the Agent tool.
This automatically creates a temporary worktree on a fresh branch for each agent.
The agent works in that isolated directory, commits there, then pushes its branch.
The worktree is cleaned up automatically if the agent makes no changes.

```
Parent session
  ├── Agent(issue=13, isolation="worktree")  → worktree A on branch issue/13-styles-block
  ├── Agent(issue=17, isolation="worktree")  → worktree B on branch issue/17-preprocessor
  └── Agent(issue=35, isolation="worktree")  → worktree C on branch issue/35-github-pages
```

Each agent is fully isolated — they cannot see or affect each other's changes.

### Inside a worktree — what the agent must do

The worktree starts on a temporary branch. The agent should immediately
rename it to match the issue convention:

```bash
git checkout -b issue/<number>-short-description
```

Then work normally. The working tree is already isolated — no need to stash,
no risk of picking up another agent's uncommitted changes.

### Finishing work inside a worktree

1. Run the verification checklist (see below).
2. Stage only the files relevant to this issue:
   ```bash
   git add <specific files>
   ```
3. Commit with the format: `[#<number>] Description of what and why`
4. Rebase onto latest main before pushing:
   ```bash
   git fetch origin main
   git rebase origin/main
   ```
5. Resolve any conflicts (see Merge Protocol below), then push:
   ```bash
   git push -u origin issue/<number>-short-description
   ```
6. Create a draft PR immediately after pushing (required — do not skip).
7. Add a comment to the GitHub issue linking to the PR.

### Merge Protocol — resolving conflicts without human involvement

When `git rebase origin/main` produces conflicts:

1. Read both sides of every conflicted file carefully.
2. Conflict in a file you did NOT touch (a parallel agent also changed it):
   take BOTH changes — preserve the other agent's addition and add yours.
3. Conflict in a file you DID touch and the other change is in a separate
   function: keep both sets of changes intact.
4. Conflict where both agents modified the same lines: examine what both
   changes intend. If compatible, merge manually. If semantically
   incompatible, stop and flag to the user — do not guess.
5. After resolving:
   ```bash
   git add <resolved files>
   git rebase --continue
   git push -u origin <branch> --force-with-lease
   ```
6. Describe the conflict and how it was resolved in the PR body.

Only escalate to the user if the conflict is semantically incompatible
and resolving it correctly requires understanding intent beyond what
the issue descriptions say.

---

## PR Review Process

Before any PR is merged to main, the main chat session (not a subagent) reviews
each branch for correctness. This is the human-in-the-loop gate.

### How it works

1. Subagents push branches and open draft PRs autonomously (per the rules above).
2. The main session reviews all open draft PRs together — code, not just descriptions.
3. Issues found in review are communicated to the user in the main chat. We decide
   together whether to: fix immediately (main session edits the branch), spawn a
   fix subagent, or accept the risk and merge anyway.
4. If a PR is clean (no issues found), it is merged without further discussion.
5. PRs are merged in dependency order (foundational changes first).

### What the review checks
- Correctness of logic against the issue's Acceptance Criteria
- Edge cases the subagent may have missed
- Bugs introduced (bad regex flags, off-by-one, unhandled undefined)
- Regressions to existing functionality (renderWidget, applyCommonStyles, preprocessYAML)
- Code style violations (see Coding Conventions below)

### Review is NOT a redesign

The review process is a bug-catch gate, not a redesign session. If the implementation
is functionally correct and meets the Acceptance Criteria, it merges — even if a
different approach might be marginally cleaner. Redesign discussions belong in the
issue, before implementation begins.

### Review feedback does NOT go back to subagents

Subagents finish and exit — they have no persistent watch on the PR.
When review finds a problem, the main session handles it:
- **Simple bug** (wrong flag, off-by-one, missed edge case): main session fixes
  directly on the branch via the GitHub API and pushes.
- **Complex fix** (requires re-thinking the approach): main session spawns a new
  focused fix-agent with the exact problem described and the file/line to change.
- **Ambiguity** (the right fix depends on user intent): main session asks the user
  before touching anything.

In all cases the fix lands on the existing branch before merge — the PR diff is
the complete record of what shipped.

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

There is no automated test suite. Verification differs by context:

### Inside a worktree (subagent context — no browser available)
1. Read every changed file and confirm it matches the issue specification.
2. Verify every Acceptance Criteria checkbox in the issue against the code.
3. For JS changes: confirm no syntax errors (`node --check lvgl-simulator.js`
   if Node is available, otherwise read carefully for obvious syntax issues).
4. For preprocessor changes: mentally trace a YAML string with `!lambda`,
   `!secret`, and nested indentation through the new regex logic.
5. Confirm no existing functions were removed or their signatures changed.
6. Confirm `example_config.yaml` is not referenced or broken by the change.

### In an interactive session (browser available)
1. Load `example_config.yaml` → confirm it renders correctly (no regressions).
2. Paste a minimal YAML snippet that exercises the new feature → confirm render.
3. Check browser DevTools console for zero uncaught JS errors.
4. Step through each Acceptance Criteria checkbox manually.
5. For preprocessor changes: test with a lambda-heavy config and nested lambdas.

---

## Git Conventions
- Branch per issue: `issue/<number>-short-description`
  e.g. `issue/13-styles-block`, `issue/17-preprocessor-hardening`
- Commit format: `[#<number>] What changed and why in one line`
- One issue per branch, one PR per issue
- Do not bundle unrelated fixes into an issue's PR
- Always create the PR as draft
- Main branch is `main` — never push directly to main
