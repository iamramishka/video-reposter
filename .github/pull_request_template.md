<!-- Video Reposter PR template. See docs/parallel-execution-plan.md for the parallel-lane workflow. -->

## Summary

<!-- What changed and why. Link the task ids from docs/parallel-execution-plan.md (e.g. A4, B6). -->

- Lane: <!-- A (Claude / desktop-app) | B (Codex / backend + admin) | integration -->
- Tasks: <!-- e.g. A4, A5 -->

## Blast radius

- Workspaces touched: <!-- desktop-app | backend | admin-dashboard -->
- Files outside this lane's domain: **none** (lanes must not cross — see Section 1 of the plan)

## Checklist (Definition of Done)

- [ ] Scope stayed inside this lane's owned paths only
- [ ] `npm run ship` is green (lint + typecheck + tests + build + secret scan)
- [ ] New/changed behavior has tests
- [ ] Matching checkbox(es) ticked in `docs/parallel-execution-plan.md` (own lane table only)
- [ ] No secrets, license keys, tokens, production URLs, or raw hardware ids committed
- [ ] Customer-facing messages stay safe; diagnostics go to logs/metadata
- [ ] Docs/checklists updated if documented behavior changed

## Review routing

- [ ] Correctness/cleanliness: `/code-review` (or `code-reviewer` agent)
- [ ] **Security review required** if this touches auth / JWT / license / crypto / secrets / Zod / env (Lane B: B1–B5, B10, B11)
- [ ] UI verified against `Designs/*.png` if this changes desktop or admin UI

## Telemetry contract (only if this PR touches A10 / B6 / B7)

- [ ] Conforms to the interface contract in `docs/parallel-execution-plan.md` Section 6 (field names/types unchanged)
