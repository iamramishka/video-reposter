# Common Project Prompt Reference

This file is now reference material. The auto-loaded project contract is `CLAUDE.md`.

## Project Identity

Video Reposter is a Windows desktop video-processing product with:

- `desktop-app/`: Electron + Vite + React desktop app.
- `backend/`: Express + Prisma/PostgreSQL license/admin API with optional Supabase REST repositories.
- `admin-dashboard/`: Vite + React admin SPA.

## Current Stack Facts

- Desktop media processing calls `ffmpeg-static` and `ffprobe-static` directly.
- Admin dashboard styling is custom CSS with `lucide-react` icons.
- Backend stores primary data through Prisma repositories unless Supabase env vars are configured.
- Product design references live in `Designs/`.
- Domain reference docs live in `Claude/Agents/`, `Claude/Skills/`, and `Claude/Worktree/`.

## Always Check

1. `CLAUDE.md` for project rules.
2. `docs/plan.md` and `docs/requirements.md` for product intent.
3. Relevant source files for the actual implementation.
4. Relevant `Designs/*.png` before UI changes.
5. `docs/standards.md` for quality gates and Definition of Done.
6. `docs/worktree-guide.md` before using git worktrees or isolated agent worktrees.

## Commands

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run ship
```

## Security Reminders

- Never commit `.env` files or real secrets.
- Do not expose backend service keys to admin or desktop bundles.
- Hash device identifiers before storage or transport.
- Keep technical diagnostics out of customer-facing UI messages.
- Audit license, auth, package, and admin mutations.

## Reference Palette

```css
--color-primary: #3B82F6;
--color-primary-hover: #2563EB;
--color-primary-active: #1D4ED8;
--color-bg: #0F172A;
--color-surface: #1E293B;
--color-border: #334155;
--color-text-primary: #F8FAFC;
--color-text-secondary: #94A3B8;
--color-success: #22C55E;
--color-warning: #F59E0B;
--color-error: #EF4444;
```
