# Parallel Agent Execution Plan — Claude + Codex

> **Purpose:** Finish the remaining `docs/requirements.md` backlog using **two AI agents in
> parallel** (one Claude Code account, one Codex account) **without them ever touching the same
> files**. This document is the single source of truth: task allocation, git-worktree isolation,
> the GitHub review/merge workflow, and the live checkboxes each agent marks as it finishes.
>
> **Repo:** `https://github.com/iamramishka/video-reposter` · **Owner:** dev@zettab.io
> **Created:** 2026-06-19 · **Integration branch:** `integrate/parallel-features`

---

## 1. Core principle — file-domain isolation

The two agents run at the same time, so they must **never edit the same file**. This monorepo has
three workspaces, which gives a natural, collision-free split:

| Lane | Agent | Owns these paths (and **only** these) | Branch |
|---|---|---|---|
| **A — Desktop** | **Claude Code** | `desktop-app/**` | `feat/desktop-enhancements` |
| **B — Backend + Admin** | **Codex** | `backend/**`, `admin-dashboard/**` | `feat/backend-admin-enhancements` |

**Shared files neither agent edits while in parallel** (edited only during reconciliation/merge by
the human or the last-to-merge lane): root `package.json`, `package-lock.json`, `docs/plan.md`,
`docs/requirements.md`, `vercel.json`, `.github/**`. Each agent **only** updates its **own lane
table in Section 5 of this file** — those tables live in separate regions, so git auto-merges them.

> One task (**Processing statistics from desktop history**) inherently spans both lanes. It is split
> into a desktop half (Lane A) and a backend+admin half (Lane B), joined by the fixed **Interface
> Contract in Section 6**. Because they target different files and agree on the API shape up front,
> neither lane blocks the other.

---

## 2. One-time worktree setup (run from the main checkout)

A git **worktree** is a second working directory attached to the same repo, checked out on its own
branch. Two worktrees = two folders the two agents edit independently with zero collision.

```bash
# --- Step 0: lock in a clean shared base -------------------------------------
# Commit whatever is currently in progress so both lanes branch from the same point.
cd "C:/Users/ramis/Downloads/Video Reposter"
git add -A
git commit -m "chore: snapshot base before parallel feature work"
git push -u origin chore/claude-config-overhaul

# Create the shared integration branch both lanes will target.
git branch integrate/parallel-features
git push -u origin integrate/parallel-features

# --- Step 1: create one isolated worktree per agent --------------------------
# Lane A — Claude (desktop). Lives in a sibling folder.
git worktree add ../video-reposter-desktop -b feat/desktop-enhancements integrate/parallel-features

# Lane B — Codex (backend + admin). Separate sibling folder.
git worktree add ../video-reposter-backend -b feat/backend-admin-enhancements integrate/parallel-features

# --- Step 2: install deps inside each worktree (each is a full checkout) ------
cd ../video-reposter-desktop && npm install
cd ../video-reposter-backend && npm install
```

**Result:**

```
Downloads/
├── Video Reposter/            ← main checkout (integration / review / merge happens here)
├── video-reposter-desktop/    ← Claude works ONLY here   (branch feat/desktop-enhancements)
└── video-reposter-backend/    ← Codex works ONLY here     (branch feat/backend-admin-enhancements)
```

- Point **Claude** at `../video-reposter-desktop`.
- Point **Codex** at `../video-reposter-backend`.
- When a lane is fully merged, remove its worktree: `git worktree remove ../video-reposter-desktop`.

---

## 3. Lane A kickoff prompt — paste into **Claude**

```
You are working in the git worktree ../video-reposter-desktop on branch
feat/desktop-enhancements. You may ONLY edit files under desktop-app/**. Do not
touch backend/, admin-dashboard/, or root config files.

Read docs/parallel-execution-plan.md (Section 5, Lane A table) for your task list,
and docs/requirements.md for product intent. Implement the Lane A tasks one at a
time. For each task: write the code + tests, run `npm test`, then check the box in
the Lane A table of docs/parallel-execution-plan.md in the SAME commit.

For the telemetry task, conform exactly to the Interface Contract in Section 6.
Before pushing, run `npm run ship` and make it green. Then push and open a PR per
Section 7. Follow CLAUDE.md (verify-before-claim, comprehension gate, security rules).
```

## 4. Lane B kickoff prompt — paste into **Codex**

```
You are working in the git worktree ../video-reposter-backend on branch
feat/backend-admin-enhancements. You may ONLY edit files under backend/** and
admin-dashboard/**. Do not touch desktop-app/ or root config files.

Read docs/parallel-execution-plan.md (Section 5, Lane B table) for your task list,
and docs/requirements.md for product intent. Implement the Lane B tasks one at a
time. For each task: write the code + tests, run `npm test`, then check the box in
the Lane B table of docs/parallel-execution-plan.md in the SAME commit.

For the telemetry task, conform exactly to the Interface Contract in Section 6.
Security-sensitive tasks (session timeout, timing-safe key compare, HTTPS, user CRUD)
must pass a security review before merge. Before pushing, run `npm run ship` and make
it green. Then push and open a PR per Section 7.
```

---

## 5. Task allocation & live checkboxes

> **Marking protocol:** when an agent finishes a task, it changes `[ ]` → `[x]` on that row **in
> its own lane table below, in the same commit as the code**. Each table is a separate region of
> this file, so the two agents never edit the same lines. Do not edit the other lane's table.

### Lane A — Claude · `desktop-app/**` · branch `feat/desktop-enhancements`

| # | Task | Source req | Status |
|---|------|-----------|--------|
| A1 | Drag-and-drop polish across all supported views | 1.2 | [ ] |
| A2 | Import summary with total size and validation status | 1.2 | [ ] |
| A3 | Output folder picker polish | 1.4 | [ ] |
| A4 | Quality presets (low/medium/high → encoder settings) | 1.4 | [ ] |
| A5 | Custom resolution UI | 1.4 | [ ] |
| A6 | Overall ETA across the processing queue | 1.5 | [ ] |
| A7 | Auto-open output folder option | 1.5 | [ ] |
| A8 | Fully custom platform preset editor | 1.6 | [ ] |
| A9 | Richer device-conflict recovery UX | 1.1 | [ ] |
| A10 | **Telemetry (desktop half):** POST each finished job's stats to the backend per Section 6 | 2.4 | [ ] |

### Lane B — Codex · `backend/**` + `admin-dashboard/**` · branch `feat/backend-admin-enhancements`

| # | Task | Source req | Status |
|---|------|-----------|--------|
| B1 | Scheduled expiry-reminder emails at 30/14/7/1 days before expiry | 1.1 | [ ] |
| B2 | Configurable session-timeout UX (JWT exp + admin setting) | 2.1 | [ ] |
| B3 | Dedicated login audit view (backend audit query + admin page) | 2.1 | [ ] |
| B4 | Full user CRUD (create/edit/disable/delete) separate from license creation | 2.2 | [ ] |
| B5 | Soft-delete + retention policy for users/licenses | 2.2 | [ ] |
| B6 | **Telemetry (backend+admin half):** ingest endpoint + storage + admin "Processing statistics" view per Section 6 | 2.4 | [ ] |
| B7 | Top error codes analytics (aggregate from telemetry) + admin display | 2.4 | [ ] |
| B8 | Churn metric in payment summary dashboard | 2.5 | [ ] |
| B9 | Server-side CSV report endpoint (separate from client-side export) | 3.2 | [ ] |
| B10 | HTTPS enforcement at the deployment edge | 3.3 | [ ] |
| B11 | Timing-safe license-key comparison review + fix | 3.3 | [ ] |

---

## 6. Interface Contract — processing telemetry (shared by A10 + B6/B7)

Both lanes build against this fixed shape so they never need each other's code.

**Endpoint (Lane B implements, Lane A calls):**

```
POST /api/telemetry/processing
Content-Type: application/json
Authorization: Bearer <desktop license token>

{
  "jobId": "string",            // client-generated id
  "status": "complete" | "failed",
  "preset": "string",           // e.g. "instagram_reel"
  "elapsedMs": 12345,
  "throughputMbPerMin": 42.0,   // optional; omit on failure
  "inputSizeBytes": 60000000,   // optional
  "errorCode": "string"         // present only when status === "failed"
}

Response: 202 { "recorded": true }
```

- **Lane A (A10):** after each job settles, send one POST. Failures to reach the backend must be
  swallowed (telemetry is best-effort; never block or crash processing). Validate the body against
  the shape above before sending.
- **Lane B (B6):** implement the route with Zod validation, persist records, and expose
  `GET /api/analytics/processing` (totals, average throughput, success/fail counts) for the admin
  "Processing statistics" view.
- **Lane B (B7):** aggregate `errorCode` frequency from stored telemetry → "Top error codes" panel.

Field names/types are frozen. Any change requires updating this section first, then both lanes.

---

## 7. GitHub review & merge workflow

Each lane self-gates locally, then goes through review on GitHub before merging to the integration
branch. Merge to `main` happens once, at the end, after both lanes are integrated and green.

### 7.1 Per-lane: gate → push → PR
```bash
# inside the lane's worktree, after finishing (or batching) tasks:
npm run ship                      # lint + typecheck + tests + build + secret scan — must be green
git push -u origin <lane-branch>
gh pr create --base integrate/parallel-features \
  --title "feat(<lane>): parallel batch" \
  --body  "Implements tasks <ids> from docs/parallel-execution-plan.md. Ship gate green."
```

### 7.2 Review (cross-agent + human)
- **Correctness/cleanliness:** run `/code-review` (or the repo `code-reviewer` agent) on the PR diff.
- **Security:** Lane B PRs touching auth/JWT/license/secrets (**B1–B5, B10, B11**) **must** pass the
  `security-auditor` agent / `/security-review` before merge — required by `CLAUDE.md`.
- **UI:** Lane A UI tasks and Lane B admin pages get a `ui-verifier` pass against `Designs/*.png`.
- The opposing agent (or the user) approves the PR. Never self-merge an unreviewed diff.

### 7.3 Merge order
Lanes are file-isolated, so order is low-risk. Recommended:
1. **Lane B → `integrate/parallel-features`** first (so the telemetry endpoint B6 exists).
2. **Lane A → `integrate/parallel-features`** next (desktop telemetry now has a live target).
3. Final PR: **`integrate/parallel-features` → `main`**, run `npm run ship` once more, then
   reconcile `docs/requirements.md` checkboxes and merge.

### 7.4 Conflict policy
Because each agent edits a disjoint file set, the only expected conflicts are in shared docs — and
only this file's two lane tables, which sit in separate regions and auto-merge. If a real conflict
appears, it means a lane edited outside its domain: stop and fix the boundary violation.

---

## 8. Definition of Done (this parallel effort)

- [ ] All Lane A boxes `[x]`; `npm run ship` green in the desktop worktree.
- [ ] All Lane B boxes `[x]`; `npm run ship` green in the backend worktree.
- [ ] Telemetry end-to-end verified (desktop POST → backend store → admin display).
- [ ] Both PRs reviewed; security review passed on B1–B5/B10/B11.
- [ ] Both lanes merged to `integrate/parallel-features`, then to `main`.
- [ ] `docs/requirements.md` reconciled to reflect everything shipped.
- [ ] Worktrees removed (`git worktree remove …`); branches deleted after merge.
