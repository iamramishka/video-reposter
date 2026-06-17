---
description: Validate Claude config files, agent frontmatter, command docs, hooks, and dangling references.
allowed-tools: PowerShell(*), Read, Grep, Glob
---

# Skills Health Check

Run these checks from the repository root:

1. Parse `.claude/settings.json` as JSON.
2. Confirm `CLAUDE.md` exists.
3. Confirm all files in `.claude/agents`, `.claude/commands`, and `.claude/hooks` exist.
4. Check every agent has `name`, `description`, `model`, and `tools` frontmatter.
5. Check every command has `description` frontmatter.
6. Search docs for obsolete stack names being claimed as active dependencies; explicit absence/planned-only notes and files marked as "Historical reference" are allowed. Skip files under `Claude/` (legacy reference library), `PLAN.md` (overhaul audit document), and `docs/decisions/` (ADRs that describe historical state).
7. Confirm `.claude/settings.local.json` is ignored.
8. Run `npm run lint`.

Report missing files, malformed metadata, stale references, and a final pass/fail verdict.
