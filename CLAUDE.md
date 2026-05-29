# Agent Instructions

**Each project has a PROJECT.md — read it before starting any work.**
It contains project-specific instructions, Notion pages, guardrails, and workflow additions.

---

## How this file works — new project setup

`CLAUDE.md` is a hardlink in every project pointing to the master in `claude-config/CLAUDE.md`. All projects share identical global instructions. Project-specific content lives in `PROJECT.md` only — never in `CLAUDE.md`.

To wire up a new project:
```powershell
Remove-Item "<project>\CLAUDE.md"   # if one exists
New-Item -ItemType HardLink -Path "<project>\CLAUDE.md" -Target "C:\Users\Mario\Code\claude-config\CLAUDE.md"
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

### File ownership rule

Two issues can run in parallel if and only if they do not write to the same file. If two issues only add new code (new files, appended blocks) without modifying the same existing function body, they are safe to parallelise. *This prevents merge conflicts at the source rather than resolving them after the fact.*

### How the orchestrating session spawns parallel agents

Use `isolation: "worktree"` when calling the Agent tool. This creates a temporary worktree on a fresh branch for each agent. The worktree is cleaned up automatically if the agent makes no changes.

```
Parent session
  ├── Agent(issue=N, isolation="worktree")  → worktree A on branch issue/N-description
  ├── Agent(issue=M, isolation="worktree")  → worktree B on branch issue/M-description
  └── Agent(issue=P, isolation="worktree")  → worktree C on branch issue/P-description
```

### Inside a worktree — what the agent must do

Immediately rename the branch to match the issue convention:
```bash
git checkout -b issue/<number>-short-description
```

### Finishing work inside a worktree

1. Verify all Acceptance Criteria are met.
2. Stage only the files relevant to this issue.
3. Commit with format: `[#<number>] Description of what and why`
4. Rebase onto latest main before pushing:
   ```bash
   git fetch origin main
   git rebase origin/main
   ```
5. Resolve any conflicts (see Merge Protocol), then push:
   ```bash
   git push -u origin issue/<number>-short-description
   ```
6. Create a draft PR immediately after pushing — do not skip.
7. Add a comment to the GitHub issue linking to the PR.

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
4. Clarify scope before coding if the task is ambiguous

### Planning a multi-step task

Before executing anything non-trivial, decompose the task and create GitHub issues to represent the plan — not just for yourself, but so other agents can see what's in flight and what's available.

**On claims in ticket bodies:** if you write that something is missing, broken, or needs changing — verify it in the file first. You don't need to read every file upfront, but every assertion ("X doesn't exist", "line N needs converting", "this handler is absent") must be grounded in what you've actually read. Unverified claims waste agent time on re-discovery or duplicate work.

```
gh issue create --title "short action-oriented title" --body "$(cat <<'EOF'
What: ...
Why: ...

Files identified so far (verify before asserting state):
- path/to/file.ext (lines N–M, briefly what you found there)

Existing state (verified by reading the files):
- what already exists that's relevant
- what is confirmed missing

Acceptance:
- [ ] criterion one
- [ ] criterion two

Blocked by: #N   ← omit if independent
EOF
)"
```

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
- State what you're starting before diving in — so the user can redirect if needed
- Verify or build after any logical unit of work you'd be frustrated to lose; don't accumulate untested edits
- Confirm all dependencies are merged before starting dependent work

### Closing out a ticket
1. Verify the change works as expected
2. For **Moderate or High complexity** changes, post a verification comment before closing — this creates an audit trail that lets regressions be traced to specific commits:
   ```
   gh issue comment N --body "Verification: PASS — <brief summary of what was tested/built/verified>"
   ```
   If verification fails, post the failure. Low complexity changes can close without a comment.
3. Commit with a message focused on *why*, not just what changed
4. Close the issue: `gh issue close N --comment "done — <one line summary>"`
5. Update Notion and any project documentation to reflect the changed state

---

## Git Conventions

- **Branch per issue:** `issue/<number>-short-description`
- **Commit format:** `[#<number>] Why this change was needed` — focus on the reason, not the mechanism
- One issue per branch, one PR per issue
- Always create PRs as draft — subagents never mark their own PRs ready; the main session marks them ready after review passes
- Never push directly to main
