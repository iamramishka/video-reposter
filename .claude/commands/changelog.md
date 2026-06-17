---
description: Produce a changelog-ready summary from the current diff.
allowed-tools: PowerShell(git *), Read, Grep, Glob
---

# Changelog

Use `git status --short`, `git diff --stat`, and the current diff to write:

- User-visible changes.
- Developer/config changes.
- Tests and verification run.
- Migration or rollback notes.

Keep it concise and avoid marketing language.
