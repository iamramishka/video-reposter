# Video Reposter Claude Contract

Video Reposter is a Windows-focused monorepo for an Electron + React desktop app, a Vite + React admin dashboard, and an Express + Prisma backend. Keep this file concise: it is loaded into every Claude Code session. Put long procedures in `docs/` or `Claude/`.

## Verified Stack

- Root uses npm workspaces: `backend`, `desktop-app`, `admin-dashboard`.
- Backend: Express 5, Prisma/PostgreSQL, Zod, Helmet, JWT, optional Supabase REST repositories selected by `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Desktop: Electron, Vite, React, `ffmpeg-static`, `ffprobe-static`, Electron Builder.
- Admin: Vite + React SPA with custom CSS and `lucide-react`. It is not Next.js.
- No Tailwind, Shadcn/ui, Zustand, `fluent-ffmpeg`, or `better-sqlite3` dependencies are installed today.

## Standard Workflow

1. Read `docs/plan.md` and `docs/requirements.md` for product intent.
2. Read the relevant source files before claiming behavior or editing.
3. For UI work, inspect the relevant `Designs/*.png` file.
4. For multi-file, security-sensitive, or destructive work, restate the goal, target files, and a short plan before editing.
5. Keep changes scoped to the request and the owning workspace.
6. Run the smallest useful verification while developing, then the required gate before finishing.
7. Update docs/checklists when the implementation changes documented behavior.

## Commands

- Install: `npm install`
- Dev: `npm run dev`
- Test: `npm test`
- Build: `npm run build`
- Type-check: `npm run typecheck`
- Lint guard: `npm run lint`
- Full local gate: `npm run ship`
- Windows release verification: `npm run verify:windows-release`

## Quality Rules

- Verify before claiming: never assert a file path, script, function, flag, dependency, or API shape without reading it in this session.
- Prefer the existing workspace patterns over new frameworks or abstractions.
- Do not hardcode secrets, license keys, API tokens, production URLs, or raw hardware identifiers.
- Keep customer-facing messages safe; technical diagnostics belong in structured metadata or logs.
- For security/auth/license/JWT/Zod/env changes, run a security review before merge.
- For code changes, run impacted tests. For cross-workspace changes, run `npm run ship`.

## Worktree Policy

- Single-file or read-only work: work in place.
- One writing agent while the user keeps editing: use agent isolation `worktree`.
- Two or more writing agents in parallel: each agent gets its own isolated worktree and results are merged sequentially.
- Summarize any agent diff before merging it. Never auto-merge unreviewed agent output.
- `Claude/Worktree/*.md` files are reference execution plans, not git worktrees.

## Reference Docs

- Coding standards and Definition of Done: `docs/standards.md`
- Worktree disambiguation: `docs/worktree-guide.md`
- Product roadmap: `docs/plan.md`
- Requirements: `docs/requirements.md`
- Legacy domain references: `Claude/Agents/`, `Claude/Skills/`, `Claude/Worktree/`
- Config overhaul contract: `PLAN.md`
