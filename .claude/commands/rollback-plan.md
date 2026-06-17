---
description: Write rollback steps before destructive, deployment, or release work.
allowed-tools: PowerShell(git *), Read, Grep, Glob
---

# Rollback Plan

Before a destructive, deploy, release, migration, or hook-enforcement change, produce:

1. Current branch and commit.
2. Files or services affected.
3. Exact rollback commands.
4. Data backup or migration reversal notes.
5. Verification after rollback.
