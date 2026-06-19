# Development Plan

## Project

Video Reposter: Windows desktop batch video processing, online license activation, backend API, and admin dashboard.

**Last Updated:** 2026-06-19
**Status:** Phases 1–5 complete. Phase 6 splits the remaining requirements backlog across two
parallel agents (Claude + Codex) in isolated worktrees — see
[docs/parallel-execution-plan.md](parallel-execution-plan.md).

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
- [x] Add pause/resume safe checkpoints

## Phase 3: Admin Dashboard And Analytics

- [x] Build JWT login and role-aware admin state
- [x] Build dashboard, license, user, package, analytics, and account views
- [x] Build license filters, detail view, extend/revoke/reset-device actions, and CSV exports
- [x] Display audit activity in the admin UI
- [x] Add admin dashboard smoke test
- [x] Add richer chart visualizations for license distribution and daily activations
- [x] Add PDF export endpoint and UI
- [x] Add email notification workflows
- [x] Add integration tests for every admin API endpoint

## Phase 4: Polish, Security, Release

- [x] Add Windows release verification workflow
- [x] Add Claude Code quality gates, secret scan, and local pre-commit guard
- [x] Resolve high/critical npm audit findings in the current workspace dependency tree
- [x] Implement auto-update detection and silent install
- [x] Add performance profiling targets and reports
- [x] Add disk usage monitor and log retention cleanup
- [x] Deploy backend and admin dashboard to production
- [x] Add production monitoring and error tracking
- [x] Write deployment runbook

## Phase 5: Optional Payment Integration

- [x] Select Stripe or Paddle
- [x] Build payment plan pages
- [x] Build invoice history and downloads
- [x] Build payment summary dashboard
- [x] Add webhook handling for payment lifecycle events
- [x] Renew licenses automatically on payment success

## Phase 6: Parallel Agent Execution (Claude + Codex)

Remaining `docs/requirements.md` backlog is split across two AI agents working in **isolated git
worktrees** so they never edit the same files. Full task allocation, worktree setup, the
desktop↔backend telemetry interface contract, the GitHub review/merge workflow, and the live
self-marking checkboxes live in **[docs/parallel-execution-plan.md](parallel-execution-plan.md)**.

**Lane A — Claude** · `desktop-app/**` · branch `feat/desktop-enhancements`

- [x] A1–A9 desktop UX/processing: drag-drop polish, import summary, output picker, quality presets, custom resolution, overall ETA, auto-open output, custom preset editor, device-conflict recovery
- [x] A10 telemetry (desktop half): post finished-job stats to backend per interface contract

**Lane B — Codex** · `backend/**` + `admin-dashboard/**` · branch `feat/backend-admin-enhancements`

- [ ] B1 scheduled expiry-reminder emails (30/14/7/1 days)
- [ ] B2 configurable session-timeout UX
- [ ] B3 dedicated login audit view
- [ ] B4 full user CRUD; B5 soft-delete + retention policy
- [ ] B6 telemetry ingest + admin processing-statistics view; B7 top error codes
- [ ] B8 churn metric; B9 server-side CSV report endpoint
- [ ] B10 HTTPS enforcement at edge; B11 timing-safe license-key comparison

**Integration**

- [ ] Both lanes pass `npm run ship`, reviewed (security review on B1–B5/B10/B11), merged to `integrate/parallel-features`, then to `main`

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
