# ADR 0001: Pre-Overhaul Claude Config Snapshot

Date: 2026-06-17

## Status

Accepted as the rollback snapshot for `chore/claude-config-overhaul`.

## Baseline

- Branch before work: `main`.
- New branch: `chore/claude-config-overhaul`.
- Baseline `npm test`: passed backend 22 tests and desktop 61 tests.
- Baseline `npm run build`: passed backend, admin dashboard, and desktop app.
- Untracked files before work: `PLAN.md`, `cls`, `docker`.
- Implementation policy: track `PLAN.md`; leave `cls` and `docker` untouched.

## Previous `.claude` State

- `.claude/settings.json` used a custom project-reference schema rather than Claude Code settings.
- It contained a stale model value and reference arrays for docs, designs, agents, skills, worktree files, rules, and palette values.
- `.claude/common-prompt.md` was the main rule document, but it was not auto-loaded as a root project memory file.
- `.claude/agents/` and `.claude/skills/` existed but had no functional project subagents or commands.
- `.claude/launch.json` contained an admin dev launch hint and remains unchanged.

## Rollback

Delete the `chore/claude-config-overhaul` branch or revert the files introduced by this branch. Product runtime behavior is intentionally unchanged by this config overhaul.
