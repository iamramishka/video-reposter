---
description: Audit npm dependency vulnerabilities and drift across workspaces.
allowed-tools: PowerShell(npm audit *), PowerShell(npm outdated *), Read, Grep, Glob
---

# Dependency Audit

Run:

1. `npm audit --workspaces`
2. `npm outdated --workspaces`

Inspect package changes and report vulnerabilities, outdated high-risk packages, and any dependency additions that duplicate existing stack choices.
