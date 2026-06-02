# Development Plan

## Project: Video Reposter — Batch Processing & License Management System

**Last Updated:** 2026-05-31  
**Status:** Phase 1 — MVP Foundation Implemented

---

## Phase 1 — Foundation (Weeks 1–2)

### Goals
Set up the full project skeleton, implement license activation, and connect to the license server API.

### Tasks
- [ ] Initialize Electron + React desktop app (`desktop-app/`)
- [ ] Initialize Next.js admin dashboard (`admin-dashboard/`)
- [ ] Initialize Node.js + Express backend (`backend/`)
- [ ] Set up PostgreSQL schema (users, licenses, audit_log)
- [ ] Set up SQLite schema for desktop app (processing_events, analytics)
- [ ] Implement license server endpoints (validate, activate, revoke, reset-device, renew)
- [ ] Implement License Agent (validation algorithm, device binding, AES-256 cache)
- [ ] Build License Activation screen (matches `Designs/License Activation.png`)
- [ ] Build license expiry reminder system (30/14/7/1 day emails)
- [ ] Write unit tests for license validation logic
- [ ] Set up `.env` files and secret management for all three apps

**Reference:**
- `Claude/Agents/license-agent.md`
- `Claude/Skills/license-validation.md`
- `Claude/Worktree/initialization.md`

---

## Phase 2 — Core Video Processing (Weeks 3–5)

### Goals
Build the complete video processing pipeline with the full feature set.

### Tasks
- [ ] Integrate FFmpeg (fluent-ffmpeg) into desktop app
- [ ] Implement video validation (format check, FFprobe scan)
- [ ] Build drag-and-drop video import UI
- [ ] Build bulk folder import
- [ ] Implement processing queue (FIFO, priority modes)
- [ ] Implement worker pool (2 workers default, configurable up to 8)
- [ ] Implement GPU auto-detection (NVENC / AMF / QSV fallback to libx264)
- [ ] Implement all video transformation features:
  - [ ] Mirror / flip (horizontal + vertical)
  - [ ] Brightness, contrast, saturation, sharpness adjustments
  - [ ] Resize (preset + custom)
  - [ ] Crop
  - [ ] Rotate (90 / 180 / 270 / custom)
  - [ ] Logo watermark (PNG, position, opacity)
  - [ ] Text watermark (font, size, color, position, opacity)
  - [ ] Remove audio
  - [ ] Replace audio with custom file
  - [ ] Volume control
  - [ ] Pitch adjustment
  - [ ] Speed adjustment (0.25x–4.0x)
  - [ ] Fade in / fade out
- [ ] Implement output settings (quality, resolution, codec, naming template)
- [ ] Implement platform presets (Instagram, YouTube, TikTok, Twitter, Facebook, Custom)
- [ ] Build Desktop Dashboard UI (matches `Designs/Dashboard.png`)
- [ ] Implement real-time progress bars and ETA
- [ ] Implement pause / resume / stop controls
- [ ] Implement processing log panel
- [ ] Write unit tests for FFmpeg command generation

**Reference:**
- `Claude/Agents/processing-agent.md`
- `Claude/Skills/batch-processing.md`
- `Claude/Worktree/processing-queue.md`
- `Claude/Worktree/monitoring.md`

---

## Phase 3 — Admin Dashboard & Analytics (Weeks 6–8)

### Goals
Build the admin web dashboard with full user management, license management, and analytics.

### Tasks
- [ ] Build admin authentication (JWT login, role-based access)
- [ ] Build Admin Dashboard overview (matches `Designs/Admin Dashboard.png`)
- [ ] Build User Management page (create, view, edit, disable, delete)
- [ ] Build License Management page (matches `Designs/License.png`)
  - [ ] Filterable license table (plan, status, device, expiry)
  - [ ] Extend, revoke, reset-device actions
  - [ ] License distribution pie chart
  - [ ] Activity timeline
- [ ] Build Analytics section (totals, charts, export)
- [ ] Implement User Agent (onboarding, email notifications)
- [ ] Implement Analytics Agent (SQLite DB, PDF reports, CSV export)
- [ ] Set up daily report auto-generation (midnight cron job)
- [ ] Implement audit log viewing in admin panel
- [ ] Write integration tests for all admin API endpoints

**Reference:**
- `Claude/Agents/analytics-agent.md`
- `Claude/Agents/user-agent.md`
- `Claude/Skills/analytics-reporting.md`
- `Claude/Skills/notification-system.md`
- `Claude/Worktree/admin-actions.md`
- `Claude/Worktree/export-logs.md`

---

## Phase 4 — Polish, Security & Release (Weeks 9–10)

### Goals
Harden security, polish UX, implement auto-update, and prepare for production release.

### Tasks
- [ ] Implement auto-update detection and silent install (electron-updater)
- [ ] Security audit: license key storage, API validation, secret handling
- [ ] Full error handling pass (all edge cases, user-friendly messages)
- [ ] Performance profiling (startup time < 5s, processing throughput target)
- [ ] Disk usage monitor + auto-clean old logs
- [ ] Beta testing (internal)
- [ ] Fix beta feedback issues
- [ ] Build and package desktop app (electron-builder → .exe installer)
- [ ] Deploy backend to production (Railway / Render / VPS)
- [ ] Deploy admin dashboard to production (Vercel / Netlify)
- [ ] Set up monitoring + error tracking (Sentry)
- [ ] Write deployment runbook

**Reference:**
- `Claude/Skills/auto-update-detection.md`

---

## Phase 5 — Optional Payment Integration (Post-launch)

### Goals
Add subscription payment management.

### Tasks
- [ ] Integrate Stripe or Paddle for payment processing
- [ ] Build payment plan pages (monthly / yearly)
- [ ] Build invoice history + download
- [ ] Build payment summary dashboard (MRR, ARR, churn)
- [ ] Webhook handling for payment events (success, failure, refund, cancellation)
- [ ] Automatic license renewal on payment success

---

## Current Status

| Component | Status |
|-----------|--------|
| Project folder structure | ✅ Done |
| Design screenshots | ✅ Done |
| Agent plans | ✅ Done |
| Worktree plans | ✅ Done |
| Skill definitions | ✅ Done |
| Common prompt | ✅ Done |
| Requirements doc | ✅ Done |
| .gitignore | ✅ Done |
| Claude settings | ✅ Done |
| Desktop app code | ✅ Phase 1 MVP scaffold implemented |
| Admin dashboard code | ✅ Phase 1 MVP scaffold implemented |
| Backend API code | ✅ Phase 1 MVP scaffold implemented |

## Phase 1 MVP Developer Notes

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

Verification commands:

```bash
npm test
npm run build
```

---

## Key Decisions Made

| Decision | Choice | Reason |
|----------|--------|--------|
| Desktop framework | Electron + React | Mature ecosystem, best FFmpeg/Node.js integration |
| Admin framework | Next.js + Tailwind + Shadcn | Fast development, built-in SSR, great component library |
| Video processing | FFmpeg (fluent-ffmpeg) | Industry standard, full feature support |
| Desktop DB | SQLite (better-sqlite3) | Lightweight, no server needed, fast for local analytics |
| Backend DB | PostgreSQL | Reliable, relational, good for license + user data |
| Auth | JWT | Stateless, easy to implement across mobile/web |
| Encryption | AES-256-GCM | Strong, built into Node.js crypto, no extra dependency |
| Email | Nodemailer + SendGrid | Flexible, easy to swap providers |
| Update system | electron-updater | Official Electron ecosystem, handles delta updates |
