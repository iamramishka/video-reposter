# Video Reposter

Video Reposter is a Windows-first video reposting tool with a local desktop processing app, a license/admin backend, and a web admin dashboard.

## Repository Layout

```text
Video Reposter/
├── desktop-app/       Electron + Vite + React desktop app
├── backend/           Express + Prisma/PostgreSQL API
├── admin-dashboard/   Vite + React admin dashboard
├── api/               Vercel serverless adapters
├── Designs/           UI reference screenshots
├── Claude/            Domain reference docs
├── .claude/           Claude Code settings, agents, commands, hooks
├── docs/              Product and engineering docs
└── scripts/           Release and verification scripts
```

## Current Stack

| Area | Technology |
| --- | --- |
| Monorepo | npm workspaces |
| Desktop | Electron, Vite, React, TypeScript |
| Video tools | `ffmpeg-static`, `ffprobe-static` |
| Admin dashboard | Vite, React, TypeScript, custom CSS, `lucide-react` |
| Backend | Node.js, Express 5, Prisma, PostgreSQL, Zod, Helmet, JWT |
| Optional backend data path | Supabase REST repositories when Supabase env vars are configured |
| Tests | Vitest |
| Packaging | Electron Builder |

## Setup

```bash
npm install
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev
```

Default seeded admin:

- Email: `admin@videoreposter.local`
- Password: `admin12345`
- Sample license: `VDRP-A1B2-C3D4-E5F6-G7H8`

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run ship
```

Windows release verification:

```bash
npm run verify:windows-release
```

## Environment

Never commit real `.env` files. Start from `.env.example` and workspace-specific examples when present.

Important backend variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Important desktop/admin variables:

- `VITE_LICENSE_SERVER_URL`
- `VITE_UPDATE_SERVER_URL`
- `VITE_API_URL`

## Claude Code Project Config

- Root project contract: `CLAUDE.md`
- Claude settings: `.claude/settings.json`
- Agents: `.claude/agents/`
- Commands: `.claude/commands/`
- Hooks: `.claude/hooks/`
- Engineering standards: `docs/standards.md`
- Worktree guide: `docs/worktree-guide.md`

The `Claude/` directory is retained as domain reference material. It is not the functional Claude Code configuration directory.

## Product Docs

- Product roadmap: `docs/plan.md`
- Requirements: `docs/requirements.md`
- Content pipeline: `docs/content-pipeline.md`
- Windows release checklist: `docs/windows-release-checklist.md`

## License

This project is proprietary. Unauthorized distribution or use is prohibited.
