---
description: Compare documented environment variables with config usage and env examples.
allowed-tools: Read, Grep, Glob, PowerShell
---

# Environment Parity

Inspect:

- `.env.example`
- `backend/src/config.ts`
- Vite `import.meta.env` usage
- `README.md`, `docs/requirements.md`, and `.claude/common-prompt.md`

Report missing examples, stale variable names, frontend-exposed secrets, and production defaults that should be blocked.
