# 🌳 Main Worktree — Master Execution Plan

> **Historical reference.** This document was written during the pre-implementation planning phase.
> The execution flows and agent maps remain valid. The "Tech Stack Recommendation" table at the
> bottom reflects pre-implementation options and is now stale — the actual stack uses
> `ffmpeg-static`/`ffprobe-static` (not fluent-ffmpeg), Prisma/PostgreSQL (SQLite is not
> installed), and a plain Vite + React SPA for the admin dashboard (not Next.js or Tauri).
> For the authoritative stack, see `CLAUDE.md` and `docs/decisions/0002-claude-config-architecture.md`.

## Overview
This is the top-level workflow document for the Video Reposter system. It defines the complete execution tree from startup to shutdown, showing how every agent, skill, and component interconnects.

---

## System Execution Tree

```
VIDEO REPOSTER — MAIN WORKTREE
│
├── [BOOT] Application Launch
│   ├── Load configuration files
│   ├── Check for updates (auto-update-detection skill)
│   ├── Initialize database connection (analytics.db)
│   └── ── Worktree/initialization.md ──►
│
├── [LICENSE] License Verification Phase
│   ├── License Agent: validate license
│   │   ├── PASS ──► Load dashboard
│   │   ├── EXPIRED ──► Show renewal screen
│   │   └── FAIL ──► Show activation screen
│   └── ── Agents/license-agent.md ──►
│
├── [DASHBOARD] Desktop Dashboard
│   ├── Processing Agent: load queue state
│   ├── Analytics Agent: fetch live stats
│   ├── User: import videos / select preset / start
│   └── ── Worktree/processing-queue.md ──►
│
├── [PROCESSING] Batch Processing Pipeline
│   ├── Processing Agent: spawn workers
│   ├── Processing Agent: transform videos
│   ├── Monitor: track progress per video
│   └── ── Worktree/monitoring.md ──►
│
├── [ADMIN] Admin Dashboard & Actions
│   ├── User Agent: manage users/licenses
│   ├── Analytics Agent: generate reports
│   ├── License Agent: revoke/extend/reset
│   └── ── Worktree/admin-actions.md ──►
│
└── [EXPORT] Export, Output & Logging
    ├── Processing Agent: move output files
    ├── Analytics Agent: generate reports
    ├── All Agents: write audit logs
    └── ── Worktree/export-logs.md ──►
```

---

## Agent Interaction Map

```
┌─────────────────────────────────────────────────────────┐
│                    VIDEO REPOSTER SYSTEM                │
│                                                         │
│   ┌──────────────┐     validates     ┌───────────────┐ │
│   │ License Agent│◄─────────────────►│  License DB   │ │
│   └──────┬───────┘                   └───────────────┘ │
│          │ license:valid                                │
│          ▼                                              │
│   ┌──────────────┐     events        ┌───────────────┐ │
│   │  Processing  │──────────────────►│  Analytics    │ │
│   │    Agent     │                   │    Agent      │ │
│   └──────┬───────┘                   └───────┬───────┘ │
│          │ output files                      │ reports  │
│          ▼                                  ▼          │
│   ┌──────────────┐                   ┌───────────────┐ │
│   │  Output Dir  │                   │  Admin Panel  │ │
│   └──────────────┘                   └───────────────┘ │
│                                              ▲          │
│   ┌──────────────┐     notifies             │          │
│   │  User Agent  │──────────────────────────┘          │
│   └──────────────┘                                     │
└─────────────────────────────────────────────────────────┘
```

---

## State Machine — App States

```
[STARTUP]
    │
    ├─► [UPDATE_CHECK] ──► [UPDATING] ──► restart
    │
    ├─► [LICENSE_CHECK]
    │       │
    │       ├─► [ACTIVATION] ──► user enters key ──► [LICENSE_CHECK]
    │       ├─► [RENEWAL] ──► user pays ──► [LICENSE_CHECK]
    │       └─► [LICENSED] ──► [DASHBOARD]
    │
    └─► [DASHBOARD]
            │
            ├─► [IMPORTING] ──► [QUEUED]
            ├─► [PROCESSING] ──► [MONITORING] ──► [DONE]
            ├─► [PAUSED] ──► [PROCESSING]
            ├─► [STOPPED] ──► [DASHBOARD]
            └─► [ADMIN] ──► [DASHBOARD]
```

---

## Development Phases

### Phase 1 — Foundation (Week 1–2)
- [ ] Set up project architecture
- [ ] Implement License Agent (validation + device binding)
- [ ] Build activation screen UI
- [ ] Connect to license server API

### Phase 2 — Core Processing (Week 3–5)
- [ ] Build video queue system
- [ ] Implement Processing Agent (workers, presets)
- [ ] Build Desktop Dashboard UI
- [ ] Real-time progress monitoring

### Phase 3 — Admin & Analytics (Week 6–8)
- [ ] Build Admin Dashboard UI
- [ ] Implement Analytics Agent (DB, reports)
- [ ] Implement User Agent (onboarding, notifications)
- [ ] License Management page

### Phase 4 — Polish & Launch (Week 9–10)
- [ ] Auto-update detection
- [ ] PDF/CSV export
- [ ] Full error handling pass
- [ ] Security audit
- [ ] Beta testing
- [ ] Production release

---

## Tech Stack Recommendation

| Layer | Technology |
|-------|-----------|
| Desktop Framework | Electron (Node.js) or Tauri (Rust) |
| Frontend UI | React + CSS Modules |
| Video Processing | FFmpeg (via fluent-ffmpeg) |
| Database | SQLite (better-sqlite3) |
| License Server | Node.js + Express + PostgreSQL |
| Email | SendGrid / Nodemailer |
| Auto-Update | electron-updater |
| PDF Reports | PDFKit or Puppeteer |
| CSV Export | csv-stringify |
| Encryption | AES-256-GCM (built-in crypto) |
| Packaging | electron-builder |

---

## File Cross-Reference

| Worktree File | Agents Used | Skills Used |
|--------------|-------------|-------------|
| `initialization.md` | License Agent | license-validation, auto-update-detection |
| `processing-queue.md` | Processing Agent | batch-processing |
| `monitoring.md` | Processing Agent, Analytics Agent | batch-processing |
| `admin-actions.md` | License Agent, User Agent, Analytics Agent | license-validation, notification-system |
| `export-logs.md` | Analytics Agent, Processing Agent | analytics-reporting |
