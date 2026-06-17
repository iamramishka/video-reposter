---
description: Run the full pre-merge gate for Video Reposter.
allowed-tools: PowerShell(npm run *), PowerShell(git *), PowerShell(powershell *)
---

# Ship Gate

Run the gate from the repository root and stop on the first hard failure:

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. `powershell -ExecutionPolicy Bypass -File .claude/hooks/secret-scan.ps1 -Scope Tracked`
6. `npm audit --workspaces --audit-level=high` and record existing findings separately from new dependency risk
7. Check env parity against `.env.example`, `backend/.env.example` if present, and documented env keys.
8. Summon `security-auditor` for auth/license/secret-relevant diffs.
9. Summon `code-reviewer` for the final diff review.
10. Produce a changelog-ready summary and rollback note.

Report commands, results, audit findings, remaining risks, and the final verdict.
