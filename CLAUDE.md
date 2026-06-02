# Agent Instructions

**Each project has a PROJECT.md — read it before starting any work.**
It contains project-specific instructions, Notion pages, guardrails, and workflow additions.

---

## How this file works — new project setup

`claude-config/CLAUDE.md` is the master copy of shared agent instructions. Each project has its own `CLAUDE.md` — copy the master in when setting up a new project, then keep them in sync manually (or ask Claude to sync them when the master changes).

Project-specific content lives in `PROJECT.md` only — never in `CLAUDE.md`.

To wire up a new project:
```powershell
Copy-Item C:\Users\Mario\Code\claude-config\CLAUDE.md "<project>\CLAUDE.md"
```
Then create `<project>/PROJECT.md` with: project overview, architecture, Notion pages, and any project-specific additions to the workflow sections below.

---

## Documentation policy

All documentation (phase plans, design notes, decision records) lives in **Notion only**. Do not create `.md` files in the repo — `CLAUDE.md` and `PROJECT.md` are the only exceptions.

---

## Notion standards

### Cross-linking rules

Every Notion page must link to its siblings and parent. Use inline markdown links, not bare URLs:
- Each child page footer: `**See also:** [Project root](...) · [sibling page](...)`
- References to GitHub issues: `issue #N` as plain text (not a URL)
- References to code: use `backtick` for identifiers, file names, and commands

### Formatting standards

- **Title:** plain text, no emoji (the page icon provides the visual marker)
- **Sections:** H2 (`##`) for top-level sections, H3 (`###`) for subsections
- **Callouts:** use for warnings, active status notices, or key constraints at the top of a page
- **Code:** inline backticks for identifiers, sensor names, filenames, and commands
- **Checklists:** `- [ ]` syntax for actionable items; tick off when done, don't delete
- **Tables:** use for registries and any structured data with 3+ columns
- **Dividers (`---`):** between major sections only

### Writing to Notion (WAF constraint)

The Cloudflare WAF on the claude.ai MCP proxy blocks large or command-containing payloads:
- **Create pages** with a minimal stub only (title + one-line callout). Never put rich content in the create call.
- **Add content** via `update_content` or `insert_content` after creation.
- **Keep each update small** — one section per call.
- **Avoid shell commands in content** — they trigger the WAF. Use plain prose instead.

---

## Communication

- When listing items in a reply, give every item a unique identifier (`A1`, `A2`, `B1`, etc.) so the user can reference them unambiguously across turns without re-describing them.
- State what you are starting before diving in — so the user can redirect if needed.
- When a topic involves a non-obvious design decision, label it clearly and explain the tradeoff rather than burying the choice in the implementation.

---

## Subagent Autonomy

### Commit and push autonomously when ALL of these are true
- The change touches ≤ 3 files
- The change implements or fixes a single GitHub issue
- No existing logic is restructured (new code added, not existing code rewritten)
- All Acceptance Criteria in the issue are met
- No new external dependencies are introduced

### Stop and check in with the user when ANY of these are true
- The change requires restructuring existing functions or shared utilities
- The issue has unresolved ambiguity the issue body doesn't answer
- A merge conflict cannot be cleanly resolved (see Merge Protocol below)
- The implementation approach differs significantly from what the issue describes
- The change touches core infrastructure that could break all downstream dependents

### Complexity guide

| Complexity | Examples | Action |
|---|---|---|
| Low | New function in an isolated module, config addition, regex fix | Commit + push |
| Low | New method on a utility, parse a new config block | Commit + push |
| Moderate | New feature spanning 2–3 files | Commit + push |
| Moderate | New UI panel (markup + logic + styles together) | Commit + push |
| High | Restructuring a shared utility used across many modules | Check in first |
| High | Changing how the app initialises or core data flows | Check in first |
| High | Changes across 5+ files | Check in first |

---

## Parallel Work Protocol

Subagents work on separate issues simultaneously using **git worktrees**. Each agent runs in a fully isolated working directory — no branch switching, no shared working tree state, no risk of agents interfering with each other.

### Rules
- **One agent = one ticket.** Never batch multiple tickets into one agent.
- **Always use `isolation: "worktree"`** when spawning agents via the Agent tool.
- **File ownership:** two issues can run in parallel only if they don't write to the same file.
- **Quota probe:** before spawning multiple agents, spawn one minimal probe agent (just `gh issue list`) first. If it hits the weekly limit, bail. Costs ~50 tokens vs hundreds for a full agent that fails immediately.

### How the orchestrating session spawns parallel agents

Use `isolation: "worktree"` when calling the Agent tool. This creates a temporary worktree on a fresh branch for each agent. The worktree is cleaned up automatically if the agent makes no changes.

```
Parent session
  ├── Agent(issue=N, isolation="worktree")  → worktree A on branch issue/N-description
  ├── Agent(issue=M, isolation="worktree")  → worktree B on branch issue/M-description
  └── Agent(issue=P, isolation="worktree")  → worktree C on branch issue/P-description
```

### Inside a worktree — what the agent must do

1. `git checkout -b issue/<number>-short-description`
2. Implement, verify, commit
3. `git fetch origin main && git rebase origin/main`
4. `git push -u origin issue/<number>-short-description`
5. `gh pr create --draft ...`
6. Comment on the issue with the PR URL, then close the issue

### Parallel agent file-claim protocol

Before starting work, check all open issues that have an assignee (in-progress issues) and read their "Files touched" list. If your ticket's files overlap with any in-progress ticket, do not start — comment on the conflict and pick a different ticket. No two in-progress issues should claim the same file simultaneously.

### Merge Protocol — resolving conflicts without human involvement

When `git rebase origin/main` produces conflicts:

1. Read both sides of every conflicted file carefully.
2. Conflict in a file you did NOT touch: take BOTH changes — preserve the other agent's addition and add yours.
3. Conflict in a file you DID touch and the other change is in a separate function: keep both sets of changes intact.
4. Conflict where both agents modified the same lines: if compatible, merge manually. If semantically incompatible, stop and flag to the user.
5. After resolving:
   ```bash
   git add <resolved files>
   git rebase --continue
   git push -u origin <branch> --force-with-lease
   ```
6. Describe the conflict and resolution in the PR body.

Only escalate if the conflict is semantically incompatible and requires understanding intent beyond what the issue descriptions say.

---

## PR Review Process

Before any PR is merged to main, the main chat session reviews each branch for correctness. This is the human-in-the-loop gate.

### How it works

1. Subagents push branches and open draft PRs autonomously.
2. The main session reviews all open draft PRs — code, not just descriptions.
3. Issues found in review are communicated to the user. We decide together whether to: fix immediately, spawn a fix subagent, or accept the risk and merge.
4. If a PR is clean, it merges without further discussion.
5. PRs are merged in dependency order.

### What the review checks
- Correctness of logic against the issue's Acceptance Criteria
- Edge cases the subagent may have missed
- Bugs introduced
- Regressions to existing functionality
- Code style violations
- **MEMORY-CHECK and NOTION-CHECK fields present** in the PR body — if missing, request them before merging

### Review is NOT a redesign

If the implementation is functionally correct and meets the Acceptance Criteria, it merges — even if a different approach might be marginally cleaner. Redesign discussions belong in the issue, before implementation begins.

### Review feedback does NOT go back to subagents

Subagents finish and exit. When review finds a problem, the main session handles it:
- **Simple bug:** fix directly on the branch and push.
- **Complex fix:** spawn a new focused fix-agent with the exact problem and file/line described.
- **Ambiguity:** ask the user before touching anything.

---

## Agent Workflow

### Picking up a ticket
1. Check open issues first: `gh issue list --state open` — discover in-flight plans before duplicating work
2. Read `PROJECT.md` to understand current state
3. Run `git log --oneline -10` for recent context
4. **Before touching any file** — do all three:
   - Grep for every symbol/ID you're about to change
   - Run the project's baseline build/verify — if it already fails, post the exact error to the issue and stop; do not absorb a pre-existing failure into your work
   - If the ticket's "Ground truth verified" date is more than 24 hours old, re-read all files listed in the ticket before implementing
5. Clarify scope before coding if the task is ambiguous

### Planning a multi-step task

Before executing anything non-trivial, decompose the task and create GitHub issues to represent the plan — not just for yourself, but so other agents can see what's in flight and what's available.

**Before writing any ticket:** read every file the ticket will touch. Embed findings directly in the body — what already exists, what is confirmed missing, exact line numbers. A ticket written without reading the files will waste agent time on re-discovery or duplicate work.

**Embed the relevant lines directly in the issue body.** An agent that finds the exact code in the issue body doesn't need to re-read the file. 10–20 lines of embedded context saves 15–20 tool calls per agent.

Every ticket body must include:
- **Files touched** with line numbers (read first — never guess)
- **Existing state** verified by reading the file
- **What is confirmed missing**
- **Behavioral acceptance criterion** — what the user will see or experience; "builds clean" alone is not sufficient
- **Ground truth verified** date so agents know when to re-verify
- **Blocked by: #N** if tightly coupled; omit if independent

**Dependency model:**
- **Tightly coupled** — B cannot safely start until A is merged/verified: add `Blocked by #A` to B's body. Do not start B until A is closed.
- **Loosely coupled** — work is independent and doesn't touch the same code: no dependency links, no assignee. Any agent can pick it up in parallel.

Assign yourself only to the issue you are starting immediately. Leave independent issues unassigned and open — that signals they are available.

### Issue-creation guardrails

Do **not** create issues for:
- Tasks whose only acceptance criterion is "it worked when I tested it manually"

Do **not** pre-create downstream issues in a dependency chain when the upstream isn't close to done. Create them when they become relevant.

### While working
- **First action:** assign yourself to the issue — `gh issue edit N --add-assignee @me` — before writing any code. *This signals in-progress to other agents and prevents two agents picking up the same ticket.*
- **Scope fence:** only touch files explicitly listed in the ticket body. If you discover related work in other files, open a new issue for it — do not bundle it into this session. One ticket = one commit = one PR. Multi-issue commits destroy atomic revert safety.
- Verify or build after any logical unit of work you'd be frustrated to lose; don't accumulate untested edits
- Confirm all dependencies are merged before starting dependent work
- **Knowable facts vs design ambiguities** — if a decision is discoverable from the code (what a function is named, what a variable is called, what already exists), look it up — do not ask. If it is a genuine design ambiguity (which approach to take, how to wire two systems together), surface the options and their tradeoffs to the user rather than choosing silently.
- **Silent iteration ban** — if a fix fails and your next approach is a fundamentally different strategy, post a brief comment on the issue explaining what failed and what you are trying next before implementing it. Do not silently cycle through multiple strategies.
- **No-progress escalation** — if the same error persists after three distinct fix strategies, stop. Post a detailed failure report on the issue: exact errors, each approach tried, suspected root cause. Hand off rather than continuing to iterate.

### Execution stage gates

For any non-trivial change, work through these gates in order. Do not skip forward.

- **SG1 Explore** — read every file the ticket touches; run the baseline build; grep for all symbols in scope. Confirm what exists and what is missing before writing any code.
- **SG2 Implement** — make the smallest coherent change set for this ticket. Stay inside the scope fence.
- **SG3 Verify** — run the project's build/test and compare against the SG1 baseline. Any new error was introduced by this session — fix it before proceeding.
- **SG4 Commit** — commit only after SG3 is clean. Run `git diff --cached --name-only` before committing and unstage any file not listed in the ticket body.
- **SG5 Push/report** — push after SG4, then post the result comment on the issue and close it.

### Closing out a ticket
1. **Self-critique before final verify** — check:
   - Did I grep for all references to every symbol I removed or renamed?
   - Does the behavioral acceptance criterion trace to something real in the codebase?
   - Am I touching only the files listed in the ticket body?
   Fix any failures before proceeding.
2. Verify clean — zero errors in build/test output
3. **Post verification result as a comment on the issue** (before closing):
   ```
   gh issue comment N --body "Verification: PASS — <brief summary>. Files modified: <list>."
   ```
   If it fails, post the failure with exact error lines.
4. **Institutional memory check — mandatory, not optional.** Post a comment using the `MEMORY-CHECK:` prefix. You must post this even if there is nothing new to document:
   ```
   gh issue comment N --body "MEMORY-CHECK: <either 'Nothing new to add to CLAUDE.md.' or a draft addition — constraint, anti-pattern, or unexpected codebase state this session uncovered that isn't already documented>"
   ```
   Agents draft it; the user decides whether to merge it. Closing an issue without a `MEMORY-CHECK:` comment is non-compliant.
5. **Notion/docs check — mandatory.** Post a comment using the `NOTION-CHECK:` prefix:
   ```
   gh issue comment N --body "NOTION-CHECK: <what Notion pages were updated, or 'No Notion changes required.'>"
   ```
   Triggers that require a Notion update: page/feature added or removed, data source status changed, development plan item completed, project structure changed. Update `PROJECT.md` too if the project structure changed.
6. Commit with a message focused on *why*, not just what changed
7. Close the issue with a structured comment covering: verification result, files modified, **scope deviations** (where implementation differed from the ticket — and why), deferred discoveries, open questions for the next agent.

   **Scope deviation rule:** if you discover that the ticket's stated existing state doesn't match the actual codebase, post a comment immediately documenting what you found vs what the ticket said, note the deviation in the PR body, and include it in the closing comment. Do not silently absorb the mismatch.

---

## Git Conventions

- **Branch per issue:** `issue/<number>-short-description`
- **Commit format:** `[#<number>] Why this change was needed` — focus on the reason, not the mechanism
- One issue per branch, one PR per issue
- Always create PRs as draft — subagents never mark their own PRs ready; the main session marks them ready after review passes
- Never push directly to main
