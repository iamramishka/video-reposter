# Worktree Guide

The word "worktree" appears in three different ways in this repository. Keep them separate.

## 1. Git Worktrees

Git worktrees are optional human workflow checkouts for parallel branches.

Example:

```bash
git worktree add ../video-reposter-admin feature/admin-dashboard
```

Use them when a human wants two branches open at once. They are not required for ordinary Claude Code work.

## 2. Agent Isolation Worktrees

Claude Code agents can run in isolated git worktrees so parallel file edits do not collide.

Policy:

- Read-only or single-file task: no isolated worktree.
- One writing agent while the user keeps editing: use `isolation: "worktree"`.
- Two or more writing agents in parallel: each writing agent gets its own isolated worktree.
- Merge agent output sequentially after reviewing the diff.
- Never auto-merge unreviewed agent output.

## 3. `Claude/Worktree/*.md`

The files under `Claude/Worktree/` are execution-plan references, not git worktrees. They describe product flows such as initialization, processing queues, monitoring, admin actions, and log export.

Keep the directory for historical domain knowledge, but refer to these files as execution plans in new docs.
