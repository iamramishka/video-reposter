# Development Plan

## Project

Video Reposter: Windows desktop batch video processing, online license activation, backend API, and admin dashboard.

**Last Updated:** 2026-06-17
**Status:** MVP scaffold implemented; documentation reconciled with current code.

## Current Implementation Snapshot

| Component | Current state |
| --- | --- |
| Monorepo | npm workspaces for backend, desktop, admin |
| Desktop app | Electron + Vite + React scaffold with FFmpeg command generation, local worker API, processing logs, license cache, and Vitest coverage |
| Admin dashboard | Vite + React SPA with login, license management, users, packages, analytics, audit activity, and CSV exports |
| Backend API | Express 5 + Prisma/PostgreSQL repositories with optional Supabase REST repositories |
| Tests | Backend, desktop, and admin smoke tests run through root `npm test` |
| Release | Windows verification workflow and PowerShell release verification script |

## Phase 1: Foundation

- [x] Initialize Electron + React desktop app (`desktop-app/`)
- [x] Initialize Vite + React admin dashboard (`admin-dashboard/`)
- [x] Initialize Node.js + Express backend (`backend/`)
- [x] Set up PostgreSQL schema through Prisma migrations
- [x] Implement license server endpoints for validate, activate, revoke, reset-device, renew, and status
- [x] Implement encrypted local license cache and desktop license client
- [x] Build license activation and dashboard UI scaffolds
- [x] Write unit tests for license validation logic
- [x] Set up env examples and secret-management rules

## Phase 2: Core Video Processing

- [x] Integrate FFmpeg binaries through `ffmpeg-static` and `ffprobe-static`
- [x] Implement video extension validation and FFprobe metadata checks
- [x] Build video import and queue state helpers
- [x] Implement deterministic FFmpeg argument generation
- [x] Implement platform presets for Instagram, YouTube, TikTok, Twitter/X, and Facebook
- [x] Implement progress parsing, stop controls, processing logs, and customer-safe failures
- [x] Write unit tests for FFmpeg command generation
- [x] Add full folder import UI with recursive native/local-worker folder scanning
- [x] Add live worker pool controls and queue slot visibility beyond the local worker flow
- [x] Add GPU auto-detection UI and CPU fallback reporting
- [x] Complete remaining transformation controls: crop, logo/text watermark, replace audio, pitch, speed, fade in/out, custom rotation
- [x] Add output naming templates and optional output formats
- [ ] Add pause/resume safe checkpoints

## Phase 3: Admin Dashboard And Analytics

- [x] Build JWT login and role-aware admin state
- [x] Build dashboard, license, user, package, analytics, and account views
- [x] Build license filters, detail view, extend/revoke/reset-device actions, and CSV exports
- [x] Display audit activity in the admin UI
- [x] Add admin dashboard smoke test
- [ ] Add richer chart visualizations for license distribution and daily activations
- [ ] Add PDF export endpoint and UI
- [ ] Add email notification workflows
- [ ] Add integration tests for every admin API endpoint

## Phase 4: Polish, Security, Release

- [x] Add Windows release verification workflow
- [x] Add Claude Code quality gates, secret scan, and local pre-commit guard
- [x] Resolve high/critical npm audit findings in the current workspace dependency tree
- [ ] Implement auto-update detection and silent install
- [ ] Add performance profiling targets and reports
- [ ] Add disk usage monitor and log retention cleanup
- [ ] Deploy backend and admin dashboard to production
- [ ] Add production monitoring and error tracking
- [ ] Write deployment runbook

## Phase 5: Optional Payment Integration

- [ ] Select Stripe or Paddle
- [ ] Build payment plan pages
- [ ] Build invoice history and downloads
- [ ] Build payment summary dashboard
- [ ] Add webhook handling for payment lifecycle events
- [ ] Renew licenses automatically on payment success

## Key Decisions

| Decision | Current choice | Reason |
| --- | --- | --- |
| Desktop framework | Electron + React + Vite | Desktop file/process access with fast UI development |
| Admin framework | Vite + React SPA | Matches current implementation and simple deployment path |
| Video processing | Direct FFmpeg binaries via `ffmpeg-static` and `ffprobe-static` | Deterministic packaging without wrapper dependency |
| Backend DB | PostgreSQL with Prisma | Relational license/user/audit data with migrations |
| Optional data path | Supabase REST repositories | Supports hosted backend data when configured |
| Auth | JWT | Stateless admin/API auth |
| Encryption | Node.js crypto AES-256-GCM | Built-in strong encryption for local license cache |
| Packaging | Electron Builder | Windows installer and portable artifact support |

## Verification Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run ship
```
