# 🎬 Video Reposter

A powerful desktop application for bulk video processing, license management, and admin analytics — powered by AI agents and automated workflows.

---

## 📁 Complete Folder Structure

```
Video Reposter/
├── Designs/
│   ├── License Activation.png
│   ├── Dashboard.png
│   ├── Admin Dashboard.png
│   └── License Management.png
│
├── Claude/
│   ├── Agents/
│   │   ├── license-agent.md       ← License verification, device binding, renewal
│   │   ├── processing-agent.md    ← Batch video processing, worker management
│   │   ├── analytics-agent.md     ← Stats collection, reporting, anomaly detection
│   │   └── user-agent.md          ← User onboarding, notifications, admin actions
│   │
│   ├── Worktree/
│   │   ├── main-worktree.md       ← Master execution plan + agent interaction map
│   │   ├── initialization.md      ← App startup sequence (config → update → license → dashboard)
│   │   ├── processing-queue.md    ← Queue intake, presets, worker assignment, FFmpeg
│   │   ├── monitoring.md          ← Real-time progress, worker health, disk monitor
│   │   ├── admin-actions.md       ← All admin workflows (revoke, extend, bulk ops, reports)
│   │   └── export-logs.md         ← Output pipeline, log rotation, CSV/PDF export
│   │
│   └── Skills/
│       ├── license-validation.md    ← AES-256 encryption, device ID, state machine
│       ├── batch-processing.md      ← FFmpeg commands, GPU acceleration, retry logic
│       ├── analytics-reporting.md   ← SQL queries, PDF/CSV generation templates
│       ├── notification-system.md   ← Email templates, dispatch logic, rate limiting
│       └── auto-update-detection.md ← Semver check, download, verify, silent install
│
└── README.md
```

---

## 🗺️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    VIDEO REPOSTER SYSTEM                        │
│                                                                 │
│   [LICENSE AGENT] ──validates──► [License Server API]          │
│         │                                                       │
│         │ license:valid                                         │
│         ▼                                                       │
│   [PROCESSING AGENT] ──events──► [ANALYTICS AGENT]             │
│         │ workers                       │ reports               │
│         ▼                              ▼                       │
│   [Output Directory]           [Admin Dashboard]               │
│                                        ▲                        │
│   [USER AGENT] ──notifies/manages──────┘                       │
│         │                                                       │
│         └──► [Email / In-App / Toast Notifications]             │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✅ Feature Plans

### 1. License Activation
- Verify license key online against license server
- Bind to device via SHA-256 hardware ID (AES-256 encrypted cache)
- 72-hour offline grace period
- Show activation status with expiry countdown
- Buy / renew license CTA
- → See: `Claude/Agents/license-agent.md` · `Claude/Skills/license-validation.md`

### 2. Desktop Dashboard
- Live video processing stats (processed, failed, success rate, speed)
- Drag-drop / file picker / folder watch for video import
- Real-time progress bars per video + ETA
- Pause / Resume / Stop controls
- Quick preset selection (Instagram, YouTube, TikTok, Twitter, Custom)
- Worker count and CPU/RAM monitor
- → See: `Claude/Agents/processing-agent.md` · `Claude/Worktree/processing-queue.md` · `Claude/Worktree/monitoring.md`

### 3. Admin Dashboard
- Total users, active/expired/revoked licenses (live stats)
- Processing analytics: videos processed, success rate, data volume
- Extend, revoke, reset device on any license
- Create, suspend, delete users
- Send bulk email notifications to filtered user groups
- Generate PDF + CSV reports
- → See: `Claude/Agents/analytics-agent.md` · `Claude/Agents/user-agent.md` · `Claude/Worktree/admin-actions.md`

### 4. License Management Page
- Filter by: plan, status, device, expiry window
- Table: license key, user, plan, status, device ID, dates
- Inline actions: extend / revoke / reset device
- Distribution pie chart + activity timeline
- → See: `Claude/Worktree/admin-actions.md`

---

## 🤖 AI Agents

| Agent | File | Key Capabilities |
|-------|------|----------------|
| **License Agent** | `Claude/Agents/license-agent.md` | Validate, bind, expire, revoke, remind |
| **Processing Agent** | `Claude/Agents/processing-agent.md` | Queue, workers, FFmpeg, retry, presets |
| **Analytics Agent** | `Claude/Agents/analytics-agent.md` | Stats, SQLite DB, PDF/CSV, anomaly detection |
| **User Agent** | `Claude/Agents/user-agent.md` | Onboarding, notifications, admin CRUD |

---

## 🧠 Skills

| Skill | File | What It Does |
|-------|------|-------------|
| **License Validation** | `Claude/Skills/license-validation.md` | Full validation algorithm, encryption, state machine |
| **Batch Processing** | `Claude/Skills/batch-processing.md` | FFmpeg commands, GPU detect, worker pool, retry |
| **Analytics Reporting** | `Claude/Skills/analytics-reporting.md` | SQL queries, PDFKit, csv-stringify |
| **Notification System** | `Claude/Skills/notification-system.md` | Email templates, Nodemailer, in-app alerts |
| **Auto-Update Detection** | `Claude/Skills/auto-update-detection.md` | Semver compare, download, SHA256 verify, install |

---

## 🌳 Worktree

| File | Phase | What It Covers |
|------|-------|---------------|
| `main-worktree.md` | Overview | Master execution tree, agent map, state machine, dev phases |
| `initialization.md` | Boot | Config load → update check → DB init → license → dashboard |
| `processing-queue.md` | Processing | Queue intake, presets, FFmpeg, worker assignment |
| `monitoring.md` | Processing | Real-time progress, event bus, worker health, disk monitor |
| `admin-actions.md` | Admin | Extend/revoke/reset, user CRUD, bulk ops, audit log |
| `export-logs.md` | Output | File pipeline, directory structure, log rotation, reports |

---

## 🔄 GitHub Worktree

```bash
# Clone main repo
git clone https://github.com/your-org/video-reposter.git
cd video-reposter

# Add feature worktrees (parallel development without multiple clones)
git worktree add ../video-reposter-license   feature/license-agent
git worktree add ../video-reposter-process   feature/processing-agent
git worktree add ../video-reposter-admin     feature/admin-dashboard
git worktree add ../video-reposter-hotfix    hotfix/critical-fix

# List all worktrees
git worktree list

# Remove when done
git worktree remove ../video-reposter-license
```

### Branch Strategy

| Branch | Worktree | Purpose |
|--------|---------|---------|
| `main` | `video-reposter/` | Production releases |
| `develop` | `video-reposter-dev/` | Integration branch |
| `feature/license-agent` | `video-reposter-license/` | License system |
| `feature/processing-agent` | `video-reposter-process/` | Video processing |
| `feature/admin-dashboard` | `video-reposter-admin/` | Admin UI |
| `hotfix/*` | `video-reposter-hotfix/` | Critical fixes |

---

## 🚀 Development Phases

| Phase | Weeks | Tasks |
|-------|-------|-------|
| **Phase 1: Foundation** | 1–2 | License Agent, activation screen, license server API |
| **Phase 2: Processing** | 3–5 | Video queue, workers, presets, dashboard UI |
| **Phase 3: Admin** | 6–8 | Admin dashboard, analytics, user management |
| **Phase 4: Polish** | 9–10 | Auto-update, PDF reports, security audit, release |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron + React |
| Video Processing | FFmpeg (fluent-ffmpeg) |
| Database | SQLite (better-sqlite3) |
| License Server | Node.js + Express + PostgreSQL |
| Email | Nodemailer / SendGrid |
| PDF Reports | PDFKit |
| CSV Export | csv-stringify |
| Encryption | Node.js crypto (AES-256-GCM) |
| Auto-Update | electron-updater |
| Packaging | electron-builder |

---

## 📄 License

This project is proprietary. Unauthorized distribution or use is prohibited.
