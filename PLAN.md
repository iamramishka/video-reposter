# Claude Code Configuration Overhaul — Master Plan

> **Scope:** Rewrite the Claude Code project configuration (CLAUDE.md, settings, skills,
> agents, rules, worktree strategy, quality gates) for the **Video Reposter** monorepo to
> production-grade standards with zero ambiguity.
>
> **This file is the plan, not the implementation.** Nothing here changes app behavior. It is
> the contract we execute against. The existing `docs/plan.md` (the product development
> roadmap, Phases 1–5) is **untouched** — this is a separate, config-focused plan.
>
> **Status:** Draft for approval · **Owner:** dev@zettab.io · **Created:** 2026-06-17

---

## 0. How to read this document

- **Part A** — Audit: what actually exists today vs. what the docs claim (grounded in the repo).
- **Part B** — Target architecture of the Claude config layer.
- **Part C** — The three meanings of "worktree" (the single biggest source of confusion).
- **Part D** — Phased execution plan with deliverables and acceptance criteria.
- **Part E** — Complete file inventory (create / modify / delete).
- **Part F** — Skill & agent trigger matrix (when each fires, exactly).
- **Part G** — Quality gates, hooks, and comprehension gates.
- **Part H** — Traceability: every item you requested → where it is addressed.
- **Part I** — Risks, rollback, out-of-scope.
- **Part J** — Definition of Done for this overhaul.

---

## Part A — Audit (Ground Truth)

I read the real files. Here is the gap between **what the docs say** and **what the code is**.
These gaps *are* the "halfly done" problem. Fixing the docs/config to match reality is Phase 1.

### A.1 The single biggest gap

| Problem | Reality | Impact |
|---|---|---|
| **No root `CLAUDE.md`** | Claude Code auto-loads `CLAUDE.md` into context every session. This repo has none. All the carefully-written rules live in `.claude/common-prompt.md`, which is **not auto-loaded**. | Every rule you wrote ("read plan first", security checklist, coding rules) is invisible unless someone manually pastes it. This is why the system feels "not enforced." |

### A.2 `.claude/settings.json` is not a valid Claude Code settings file

`.claude/settings.json` currently holds a **custom schema** (`project`, `worktree_refs`,
`agent_refs`, `color_palette`, `rules`). Claude Code's real `settings.json` expects keys like
`permissions`, `hooks`, `env`, `model`, `statusLine`. Consequences:

- `"model": "claude-opus-4-5"` — **stale/invalid model id**. Current ids: `claude-opus-4-8`,
  `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`.
- **No `permissions` block** → every tool call prompts; no allowlist for safe read-only commands.
- **No `hooks` block** → none of the "auto-run lint/type-check/secret-scan" automation exists.
- The useful content here (color palette, refs) belongs in `CLAUDE.md` or a referenced doc, not
  in `settings.json`.

### A.3 Docs ↔ code stack drift (verified file-by-file)

| Doc claims | Actual code | Verdict |
|---|---|---|
| Admin dashboard = **Next.js (App Router)** + NextAuth + Axios + Recharts | `admin-dashboard/` is a **plain Vite + React SPA** (`vite`, `@vitejs/plugin-react`, `main.tsx`, `App.tsx`); deps are only `react`, `react-dom`, `lucide-react` | ❌ Docs wrong |
| Video processing via **fluent-ffmpeg** | `desktop-app` uses **`ffmpeg-static` + `ffprobe-static`** directly; no `fluent-ffmpeg` dependency | ❌ Docs wrong |
| Desktop DB = **SQLite via better-sqlite3** | No `better-sqlite3` dependency present | ❌ Unverified/absent |
| Backend = "Express **or NestJS**" | **Express 5** + Prisma + Zod + Helmet + JWT | ✅ (Express) |
| Persistence = **PostgreSQL/Prisma** only | Backend has **both Prisma repositories AND Supabase repositories** (`supabaseRestClient.ts`, `supabase*Repository.ts` for auth/license/package/audit) | ⚠️ Supabase is real but **undocumented anywhere** |
| UI = **Tailwind + Shadcn/ui**, state via **Zustand** | None of Tailwind, Shadcn, or Zustand are in any `package.json` | ❌ Docs wrong |
| Admin has integration tests | `admin-dashboard` has **zero tests** and **no `test` script** | ⚠️ Gap |

### A.4 What actually exists and is good (keep / build on)

- **Real test suite** via Vitest: `backend/tests/` (2 specs: `api.test.ts`, `licenseService.test.ts`),
  `desktop-app/tests/` (10 specs incl. `accessibility.test.ts`, `licenseCache.test.ts`,
  `processingService.test.ts`). Root `npm test` runs backend + desktop-app.
- **Proper npm workspaces** monorepo: root `package.json` with `backend`, `desktop-app`,
  `admin-dashboard`; orchestrated `dev`, `build`, `test`, `db:*` scripts.
- **Prisma schema + 2 migrations + seed** (`backend/prisma/`).
- **CI exists**: `.github/workflows/windows-release-verification.yml` +
  `scripts/verify-windows-release.ps1` + `docs/windows-release-checklist.md`.
- **Domain knowledge docs** in `Claude/Agents/`, `Claude/Skills/`, `Claude/Worktree/` (capital `C`)
  — these are *prose reference material*, valuable but **not wired into Claude Code**.
- **Built-in skills available** in this environment: `verify`, `code-review`, `security-review`,
  `simplify`, `run`, `init`, plus Anthropic skills.

### A.5 Naming collision to resolve

There are two directories one letter apart:
- `Claude/` (capital) — your prose reference docs. **Not** loaded by Claude Code.
- `.claude/` (lowercase, dot) — the real Claude Code config dir.

The plan keeps `Claude/` as a **reference library** and links to it from `CLAUDE.md`, while making
`.claude/` the **functional** config (agents, commands, hooks, settings).

---

## Part B — Target Architecture of the Claude Config Layer

```
Video Reposter/
├── CLAUDE.md                      ← NEW. Auto-loaded master rules (concise, links out)
├── PLAN.md                        ← this file
│
├── .claude/
│   ├── settings.json              ← REWRITE to real schema: permissions + hooks + model + env
│   ├── settings.local.json        ← (gitignored) personal overrides
│   ├── common-prompt.md           ← KEEP as reference; CLAUDE.md links to it (deduped)
│   ├── agents/                    ← NEW. Wired subagents (frontmatter: name/description/tools/model)
│   │   ├── code-reviewer.md
│   │   ├── security-auditor.md
│   │   ├── test-runner.md
│   │   ├── ui-verifier.md
│   │   └── dependency-auditor.md
│   ├── commands/                  ← NEW. Project slash-commands (skills)
│   │   ├── ship.md                ← orchestrates the full pre-merge gate
│   │   ├── audit-deps.md
│   │   ├── env-parity.md
│   │   ├── changelog.md
│   │   ├── rollback-plan.md
│   │   └── skills-health-check.md
│   └── hooks/                     ← NEW. Scripts invoked by settings.json hooks
│       ├── pre-commit-guard.ps1
│       └── secret-scan.ps1
│
├── Claude/                        ← KEEP. Reference library (domain knowledge), linked from CLAUDE.md
│   ├── Agents/  Skills/  Worktree/
│
└── docs/
    ├── plan.md                    ← KEEP (product roadmap). Reconcile A.3 drift only.
    ├── requirements.md            ← KEEP. Reconcile A.3 drift only.
    ├── standards.md               ← NEW. Coding standards, DoD, branch rules, blast-radius rule
    ├── worktree-guide.md          ← NEW. The 3 worktree meanings (see Part C)
    └── decisions/                 ← NEW. ADR folder (one file per architectural decision)
```

**Design principle:** `CLAUDE.md` stays **short and high-signal** (it is loaded every turn). Heavy
detail lives in `docs/` and `Claude/` and is *referenced* by path, so context stays lean while the
rules remain enforceable.

---

## Part C — The Three Meanings of "Worktree" (disambiguation)

Your complaint "worktree method not perfectly used" is real because **three different things** are
all called "worktree" in this repo and they're conflated. The plan separates them explicitly in
`docs/worktree-guide.md`:

| # | Meaning | Where it lives today | Plan |
|---|---|---|---|
| 1 | **Git worktrees** for humans — parallel branches checked out in sibling folders (`git worktree add ../video-reposter-admin feature/admin`) | README + common-prompt CLI snippets | Keep as an *optional human workflow*. Document it accurately and note it is **not** required for Claude. |
| 2 | **Claude Code Agent `isolation: "worktree"`** — when I spawn a subagent, it can run in its own throwaway git worktree so parallel agents don't collide | **Not used / not documented at all** | **This is the real gap.** Define exactly when I use it: any task that spawns ≥2 agents that both write files, or any agent doing risky multi-file edits while you keep working. Document the rule in `CLAUDE.md` + `worktree-guide.md`. |
| 3 | **`Claude/Worktree/*.md`** — these are **not worktrees at all**; they are phase/execution planning docs (initialization, processing-queue, monitoring…) | `Claude/Worktree/` | Rename concept to "Execution Plans" in references to stop the confusion. Files can stay; CLAUDE.md describes them correctly. |

**Concrete Agent-worktree policy (goes into CLAUDE.md):**
- Single-file or read-only task → **no worktree**, work in place.
- One agent writing while the user continues editing → **`isolation: "worktree"`**.
- Two or more agents writing in parallel → **each gets its own worktree**; merge sequentially.
- After an agent finishes, summarize its diff before merging; never auto-merge unreviewed agent output.

---

## Part D — Phased Execution Plan

Each phase is independently shippable and reversible. **Phase 0 and 1 are prerequisites**; later
phases can be reordered.

### Phase 0 — Safety net (do first)
- [x] Create branch `chore/claude-config-overhaul` (never work on `main`).
- [x] Confirm `npm test` and `npm run build` pass *before* any change (baseline green).
- [x] Snapshot current `.claude/` to `docs/decisions/0001-pre-overhaul-snapshot.md` for rollback.

**Acceptance:** baseline tests recorded; working tree clean on a feature branch.

### Phase 1 — Foundation: CLAUDE.md + settings.json + reconcile drift
- [x] Author root **`CLAUDE.md`** (concise): project identity, the 10-step task workflow,
      coding rules, security checklist, worktree policy (Part C), skill/agent trigger pointers,
      and explicit "verify before you claim" comprehension/hallucination rules.
- [x] Rewrite **`.claude/settings.json`** to the real schema:
      `model` (set to a valid current id), `permissions.allow` (read-only Bash, npm test/build,
      git status/diff), `permissions.ask`/`deny` (no `git push`/`rm -rf` without confirm),
      `hooks`, and `env`.
- [x] **Reconcile A.3 drift** in `docs/requirements.md`, `docs/plan.md` decisions table,
      `README.md`, and `.claude/common-prompt.md`: Vite (not Next.js), `ffmpeg-static`
      (not fluent-ffmpeg), document Supabase, drop unused Tailwind/Shadcn/Zustand claims (or add
      them as explicit "planned, not yet installed").
- [x] Write **`docs/standards.md`**: coding standards, Definition of Done, branch naming
      (`feature/`, `fix/`, `hotfix/`, `chore/`), blast-radius rule, token-budget rule
      (Haiku for mechanical edits / Sonnet default / Opus for architecture).
- [x] Write **`docs/worktree-guide.md`** (Part C).

**Acceptance:** `CLAUDE.md` loads and is accurate; `settings.json` validates; no doc claims a
technology the code doesn't use; `npm test`/`build` still green.

### Phase 2 — Wire the agents
Create real subagents in `.claude/agents/` with proper frontmatter and least-privilege tools:
- [x] `code-reviewer` — diff correctness + reuse/simplification (read-only tools).
- [x] `security-auditor` — license/crypto/JWT/secret/Zod-validation review (read-only).
- [x] `test-runner` — runs `npm test`, parses failures, reports with context.
- [x] `ui-verifier` — drives `preview_*` to verify desktop/admin UI against `Designs/*.png` + palette.
- [x] `dependency-auditor` — `npm audit`/outdated across all three workspaces.

**Acceptance:** each agent spawns, has only the tools it needs, and produces a structured report.

### Phase 3 — Author the skills (slash commands)
Create `.claude/commands/`:
- [x] `ship` — orchestrates the pre-merge gate: build → test → security-auditor → code-reviewer →
      env-parity → changelog. Stops on first hard failure.
- [x] `audit-deps`, `env-parity`, `changelog`, `rollback-plan`, `skills-health-check`.

**Acceptance:** every command runs end-to-end on the current repo and emits a clear pass/fail.

### Phase 4 — Quality gates & hooks
- [x] `.claude/settings.json` hooks: PostToolUse on `Edit|Write` → type-check the touched workspace;
      PreToolUse matcher on `git commit` → run `pre-commit-guard.ps1` (lint + tsc + secret-scan).
- [x] Git-level **husky pre-commit** for enforcement independent of Claude (belt and suspenders).
- [x] `secret-scan.ps1` — entropy + keyword scan for committed secrets (respects `.gitignore`).
- [x] Add a **PR review checklist** template under `.github/` and document the merge-review flow.

**Acceptance:** a deliberately-introduced lint error / fake secret / type error is blocked locally.

### Phase 5 — Domain-specific guards (Video Reposter)
- [x] `admin-dashboard` test scaffold + add it to root `npm test` (closes A.3 gap).
- [x] FFmpeg command-generation regression test note (golden args, not full media) wired into
      `desktop-app` tests.
- [x] License/JWT/rate-limit security cases enumerated for `security-auditor`.
- [x] Document the content pipeline (intake → transform → output) as the `ui-verifier`/`run` target.

**Acceptance:** admin has at least a smoke test; pipeline + security checks are runnable.

### Phase 6 — Verify, self-review, and document
- [x] Run `skills-health-check` → all agents/commands/hooks wired, no dangling path refs.
- [x] Self-consistency pass: re-read `CLAUDE.md` as a critic; fix contradictions.
- [x] Write `docs/decisions/0002-claude-config-architecture.md` (ADR for this overhaul).
- [x] Update memory with the non-obvious facts (Vite-not-Next, ffmpeg-static, Supabase dual-repo).

**Acceptance:** Part J checklist fully green.

---

## Part E — File Inventory

**Create:** `CLAUDE.md`, `docs/standards.md`, `docs/worktree-guide.md`, `docs/decisions/*.md`,
`.claude/agents/{code-reviewer,security-auditor,test-runner,ui-verifier,dependency-auditor}.md`,
`.claude/commands/{ship,audit-deps,env-parity,changelog,rollback-plan,skills-health-check}.md`,
`.claude/hooks/{pre-commit-guard,secret-scan}.ps1`, `.github/pull_request_template.md`.

**Modify:** `.claude/settings.json` (full rewrite to real schema), `.claude/common-prompt.md`
(dedupe vs CLAUDE.md, fix stack drift), `docs/requirements.md`, `docs/plan.md` (decisions table
only), `README.md` (stack section), root `package.json` (add `admin-dashboard` to `test`,
add `lint`/`typecheck` scripts), `.gitignore` (add `.claude/settings.local.json`).

**Delete:** nothing destructive. The custom keys leaving `settings.json` are migrated into
`CLAUDE.md`/`docs`, not lost.

---

## Part F — Skill & Agent Trigger Matrix

| Trigger condition | Action | Tool / Skill |
|---|---|---|
| Any UI change in `desktop-app` or `admin-dashboard` | Verify against design + palette | `ui-verifier` agent → `verify` / `preview_*` |
| Before opening any PR | Correctness + cleanliness review | `code-review` (effort by blast radius) |
| Touching license / crypto / JWT / auth / secrets / Zod | Security pass **before** merge | `security-auditor` agent → `/security-review` |
| After any logic change | Run impacted tests with context | `test-runner` agent → `npm test` |
| Before merge / release | Full gate | `/ship` |
| Before adding/upgrading a dependency | Vuln + outdated audit | `/audit-deps` |
| Before deploy | Config drift check | `/env-parity` |
| After a refactor | Reuse/simplify only | `/simplify` |
| Before any destructive/deploy step | Written rollback steps | `/rollback-plan` |
| After config changes to `.claude/` | Verify everything still wired | `/skills-health-check` |

---

## Part G — Quality, Comprehension & AI-Behavior Gates (into CLAUDE.md)

- **Comprehension gate:** for any multi-file or destructive task, restate the goal + list target
  files + give a 3–5 bullet plan **before** editing. No silent large edits.
- **Hallucination guard:** never assert a file path, function, script, or flag without having read
  it this session. (This plan was written under that rule — every claim in Part A is from a read.)
- **Confidence gate:** below high confidence on an architectural call → stop and ask, don't guess.
- **Self-consistency:** re-read any plan as a critic before executing.
- **Blast-radius rule:** state how many files/workspaces a change touches before starting.
- **Definition of Done:** builds, tests pass, security pass if applicable, UI matches design,
  docs/plan updated, no new secrets, change explained.
- **Accountability:** non-trivial decisions get an ADR in `docs/decisions/`; commit messages
  explain *why*.

---

## Part H — Traceability (your requests → where addressed)

| You asked for | Addressed in |
|---|---|
| UI/UX standards & verification | F (ui-verifier), D-Phase 2/5, `docs/standards.md` |
| Worktree used correctly | **Part C**, `docs/worktree-guide.md`, CLAUDE.md policy |
| Software-engineering standards | `docs/standards.md`, G |
| Skills triggered correctly | **Part F**, Phase 3 |
| Error auditing | `test-runner`, hooks (Phase 4), log-noise check in code-reviewer |
| Verification checklist | G (Definition of Done), `/ship`, `verify` |
| Comprehension gates | G |
| Security scanning wired in | F, `security-auditor`, `/ship`, Phase 4 secret-scan |
| Eval/review agent scope | `code-reviewer` + `security-auditor` agents (Phase 2) |
| PR & merge review | `/ship`, `.github/pull_request_template.md`, Phase 4 |
| Speed vs quality / token budget | `docs/standards.md` model-tier rule, G |
| Accountability | `docs/decisions/` ADRs, commit-message rule |
| Testing / dependency / changelog / rollback / env-parity skills | Phase 3 commands |
| Branch strategy, pre-commit intelligence, dead-code, postmortem | `docs/standards.md`, Phase 4 hooks, ADR template |
| Semantic diff / cross-file impact / API-contract / duplicate logic | `code-reviewer` agent remit |
| Prompt-injection / hallucination / confidence / self-consistency | G |
| Secret rotation / log noise / feature-flag lifecycle | secret-scan + code-reviewer + standards |
| Content pipeline / rate-limit / media regression / platform-API watch | Phase 5 + `/audit-deps` schedule |
| Skills health check (meta-skill) | `/skills-health-check`, Phase 6 |

*Items not yet present in the codebase (e.g. feature flags, a deploy pipeline, social-platform API
integrations) are written as **standards/templates ready to activate** rather than fake wiring —
flagged honestly so we don't pretend coverage that doesn't exist.*

---

## Part I — Risks, Rollback, Out-of-Scope

**Risks & mitigations**
- *Over-stuffing CLAUDE.md* bloats every turn → keep it lean, link out to `docs/`.
- *Hooks blocking legitimate work* → start in "warn" mode, promote to "block" after a clean week.
- *Stack-drift reconciliation touching product docs* → docs-only edits, reviewed; no code behavior change.

**Rollback:** everything lands on `chore/claude-config-overhaul`. Revert = delete branch. Pre-overhaul
`.claude/` snapshot stored in `docs/decisions/0001-…` (Phase 0).

**Out-of-scope (this plan):** building product features, changing FFmpeg/license runtime behavior,
deploying, installing Tailwind/Next.js. Those stay in `docs/plan.md`’s product roadmap.

---

## Part J — Definition of Done (for this overhaul)

- [x] Root `CLAUDE.md` exists, is accurate, and auto-loads.
- [x] `.claude/settings.json` is valid (real schema), with a current model id, permissions, and hooks.
- [x] No documentation claims a technology the code does not use (A.3 fully reconciled).
- [x] All 5 agents + 6 commands exist, are wired, and run on the current repo.
- [x] `/skills-health-check` reports zero dangling references.
- [x] Local gate blocks a planted lint error, type error, and fake secret.
- [x] `npm test` and `npm run build` still green; `admin-dashboard` has at least a smoke test in `npm test`.
- [x] Three worktree meanings are documented and the Agent-worktree policy is in CLAUDE.md.
- [x] ADRs written; memory updated with the non-obvious facts.

---

### Immediate next step (on approval)
Execute **Phase 0 → Phase 1**: branch, baseline tests, then author `CLAUDE.md` +
rewrite `.claude/settings.json` + reconcile the stack drift. I will not touch `main` and will not
change product/runtime code.
