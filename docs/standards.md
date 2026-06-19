# Video Reposter Engineering Standards

## Working Rules

- Read the relevant files before changing behavior.
- Keep changes within the owning workspace unless the contract requires cross-workspace updates.
- Prefer existing libraries and local patterns before adding dependencies.
- Add abstractions only when they remove real duplication or clarify a shared contract.
- Update docs when implementation changes documented behavior.

## Branches And Commits

- Use `feature/`, `fix/`, `hotfix/`, or `chore/` prefixes.
- Claude config work uses `chore/claude-config-overhaul`.
- Commit messages should explain why the change exists, not only what files changed.
- Do not rewrite or revert user changes unless explicitly asked.

## Quality Gates

- Small logic change: impacted workspace tests.
- Shared contract or multi-workspace change: `npm run typecheck` and `npm test`.
- Pre-merge: `npm run ship`.
- UI change: verify against the relevant `Designs/*.png` and check responsive fit.
- Security/auth/license/env change: run secret scan and security review.

## Definition Of Done

- Code builds and relevant tests pass.
- Type-check is clean.
- No focused tests or `debugger` statements remain.
- No new secrets are committed.
- Customer-facing errors do not leak technical details.
- Docs and checklists match the actual implementation.

## Model And Agent Guidance

- Use `haiku` for mechanical searches, simple audits, and test summarization.
- Use `sonnet` for normal implementation and code review.
- Use `opus` for architecture, security review, and high-risk tradeoffs.
- Use isolated agent worktrees when more than one writing agent runs in parallel.

## Security Defaults

- Secrets live in `.env` files or secret managers only.
- Frontend and renderer code must not receive backend service secrets.
- Device identifiers must be hashed before storage or transport.
- License, auth, package, and audit mutations must be validated and auditable.
- Logs may include correlation IDs and technical metadata, not customer secrets.
