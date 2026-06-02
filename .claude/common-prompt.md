# Common Project Prompt — Video Reposter

> **Save this file as `.claude/common-prompt.md`**
> Paste this at the start of every new Claude / Claude Code task for this project.

---

## Project Identity

**Project Name:** Video Reposter — Batch Processing & License Management System  
**Type:** Windows Desktop Application + Online Admin Dashboard + Backend API  
**Version:** 1.0.0  
**Root Directory:** `Video Reposter/`

You are working on a professional Windows desktop application that allows users to batch process videos automatically with platform-specific presets. The system also includes an online admin dashboard for user management, license management, analytics, and optional payment management.

---

## Main Goal

Build a professional, secure, scalable, and cleanly structured system with:

1. **Windows desktop app** — video batch processing with FFmpeg, platform presets, full video/audio transformation suite.
2. **Online license activation** — validate, bind to device, enforce expiry, 72-hour offline grace.
3. **Admin dashboard** — manage users, licenses, activations, analytics, and optional payments.
4. **Clean UI** — match the design screenshots exactly using the defined color palette.
5. **Maintainable code** — modular, commented where needed, suitable for future upgrades.

---

## ⚠️ Before Starting ANY Task

Always do this **first**:

1. Read `docs/plan.md` — check current phase and open tasks.
2. Read `docs/requirements.md` — check feature requirements for the area you're working on.
3. If the task is UI-related → check the relevant design screenshot in `Designs/`.
4. Check the relevant agent file in `Claude/Agents/`.
5. Check the relevant skill file in `Claude/Skills/`.
6. Check the relevant worktree file in `Claude/Worktree/`.
7. Give a short implementation plan (3–5 bullet points).
8. Implement the task step by step.
9. Explain what was changed and what the next recommended step is.

---

## Project Folder Structure

```
Video Reposter/
│
├── .claude/
│   ├── common-prompt.md        ← THIS FILE — paste at start of every task
│   ├── agents/                 ← Claude agent sub-definitions (optional)
│   ├── skills/                 ← Claude skill sub-definitions (optional)
│   └── settings.json           ← Claude Code project settings + cross-references
│
├── claude/
│   ├── commands/               ← Custom Claude slash commands for this project
│   └── templates/              ← Prompt templates for common dev tasks
│
├── Claude/
│   ├── Agents/
│   │   ├── license-agent.md    ← License validation, binding, renewal, expiry
│   │   ├── processing-agent.md ← Batch queue, workers, FFmpeg, presets
│   │   ├── analytics-agent.md  ← Stats, SQLite DB, PDF/CSV reports, anomaly detection
│   │   └── user-agent.md       ← Onboarding, notifications, admin user CRUD
│   │
│   ├── Worktree/
│   │   ├── main-worktree.md    ← Master execution tree, agent map, dev phases
│   │   ├── initialization.md   ← App startup: config → update → license → dashboard
│   │   ├── processing-queue.md ← Queue intake, presets, FFmpeg, worker assignment
│   │   ├── monitoring.md       ← Real-time progress, event bus, disk monitor
│   │   ├── admin-actions.md    ← Extend/revoke/reset, user CRUD, audit log
│   │   └── export-logs.md      ← File output pipeline, log rotation, CSV/PDF export
│   │
│   └── Skills/
│       ├── license-validation.md    ← AES-256, device ID, state machine, rate limiting
│       ├── batch-processing.md      ← FFmpeg commands, GPU accel, worker pool, retry
│       ├── analytics-reporting.md   ← SQL queries, PDFKit, csv-stringify
│       ├── notification-system.md   ← Email templates, dispatch logic, in-app alerts
│       └── auto-update-detection.md ← Semver check, download, SHA256 verify, install
│
├── Designs/
│   ├── License Activation.png  ← Activation screen UI reference
│   ├── Dashboard.png           ← Desktop dashboard UI reference
│   ├── Admin Dashboard.png     ← Admin panel UI reference
│   └── License.png             ← License management page UI reference
│
├── docs/
│   ├── plan.md                 ← Phased development plan + task checklists (READ FIRST)
│   └── requirements.md         ← Full feature requirements (READ FOR FEATURE DETAILS)
│
├── scripts/                    ← Helper scripts (DB migrations, key generation, deploy)
│
├── desktop-app/                ← Electron + React Windows desktop app
├── admin-dashboard/            ← Next.js admin web dashboard
├── backend/                    ← Node.js + Express/NestJS API server
│
├── README.md
├── .gitignore
└── .claude/settings.json
```

---

## Design References

**Always check the relevant screenshot before building any UI.**

| Screen | File | What It Shows |
|--------|------|--------------|
| License Activation | `Designs/License Activation.png` | Key entry, activate button, buy/support links |
| Desktop Dashboard | `Designs/Dashboard.png` | Queue, progress bars, presets, stats |
| Admin Dashboard | `Designs/Admin Dashboard.png` | Overview stats, charts, recent activations |
| License Management | `Designs/License.png` | Filterable table, actions, charts |

### Color Palette (use exactly these values)

```css
--color-primary:        #3B82F6;   /* Main buttons, links, accents */
--color-primary-hover:  #2563EB;   /* Hover state */
--color-primary-active: #1D4ED8;   /* Active/pressed state */
--color-bg:             #0F172A;   /* App background (dark) */
--color-surface:        #1E293B;   /* Cards, panels, modals */
--color-border:         #334155;   /* Borders, dividers */
--color-text-primary:   #F8FAFC;   /* Headings, primary text */
--color-text-secondary: #94A3B8;   /* Labels, secondary text */
--color-success:        #22C55E;   /* Done, valid, active */
--color-warning:        #F59E0B;   /* Expiring soon, caution */
--color-error:          #EF4444;   /* Failed, revoked, error */
```

**Style:** Professional · Trustworthy · Clean · Modern · Dark Theme  
**Typography:** Inter or Geist Sans — no browser defaults

---

## System Feature Requirements Summary

### Desktop App

#### License
- First-launch activation screen
- Online validation (POST /api/license/validate)
- Device binding (SHA-256 hardware fingerprint)
- AES-256-GCM encrypted local cache
- Monthly / yearly plan support
- 72-hour offline grace, 24-hour expiry grace
- Hard block on revocation
- Expiry reminders: 30 / 14 / 7 / 1 days

#### Video Input
- Single file, bulk multi-select, drag-and-drop, full folder import
- Formats: .mp4 .mov .avi .mkv .webm .flv
- Duplicate detection (filename + file size)

#### Video Transformations (ALL required)
| Feature | Control |
|---------|---------|
| Mirror / Flip | Horizontal / Vertical toggle |
| Brightness | Slider -100 to +100 |
| Contrast | Slider -100 to +100 |
| Saturation | Slider -100 to +100 |
| Sharpness | Slider 0 to 100 |
| Resize | Preset or custom width×height |
| Crop | Define crop region |
| Rotate | 90° / 180° / 270° / custom |
| Logo Watermark | PNG upload, position, opacity |
| Text Watermark | Text, font, size, color, position, opacity |
| Remove Audio | Toggle |
| Replace Audio | Custom .mp3 / .wav / .aac file |
| Volume | 0–200% |
| Pitch | Semitones adjustment |
| Speed | 0.25× – 4.0× (affects audio + video) |
| Fade In | Duration in seconds |
| Fade Out | Duration in seconds |

#### Output
- Output folder selection
- Custom file naming template
- MP4 (primary), MKV (optional)
- Quality: Low / Medium / High / Ultra
- Resolution: 720p / 1080p / 1440p / 4K / Original / Custom
- Codec: H.264 (default), H.265, VP9

#### Processing Controls
- Start, Pause, Resume, Stop
- Per-video progress % + ETA
- Overall batch progress
- Queue view (all videos + status icons)
- Error display per video
- Processing log panel (scrollable, timestamped)

#### Platform Presets
- Instagram Reel, YouTube Short, TikTok, Twitter/X, Facebook Reel, Custom

### Admin Dashboard

- **Auth:** JWT login, role-based (Super Admin / Admin / Read-Only)
- **Users:** Create, view, edit, disable, delete users + device info
- **Licenses:** Generate, assign, extend, revoke, reset-device, filter table
- **Analytics:** User counts, license status charts, daily activations, processing stats, export PDF/CSV
- **Payments (optional):** Monthly/yearly plans, invoice history, Stripe/Paddle integration

---

## Tech Stack

### Desktop App
| Layer | Technology |
|-------|-----------|
| Framework | Electron (electron-builder for packaging) |
| UI | React + Tailwind CSS + Shadcn/ui components |
| Video Processing | FFmpeg via fluent-ffmpeg |
| Database | SQLite via better-sqlite3 |
| Encryption | Node.js crypto (AES-256-GCM) |
| Auto-Update | electron-updater |
| State Management | Zustand or React Context |

### Admin Dashboard
| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) |
| Styling | Tailwind CSS |
| Components | Shadcn/ui |
| Charts | Recharts or Chart.js |
| Auth | NextAuth.js or custom JWT |
| HTTP Client | Axios |

### Backend API
| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Framework | Express.js or NestJS |
| Database | PostgreSQL (Prisma ORM) |
| Auth | JWT (jsonwebtoken) |
| Email | Nodemailer + SendGrid |
| PDF | PDFKit |
| CSV | csv-stringify |
| Rate Limiting | express-rate-limit |
| Validation | Zod |

---

## AI Agents Reference

When working, think using these agent roles:

| Agent | File | When to Use |
|-------|------|------------|
| **Planner Agent** | `Claude/Worktree/main-worktree.md` | Breaking down tasks before implementation |
| **UI Designer Agent** | `Designs/*.png` | Any UI work — match screenshots + color palette |
| **License Agent** | `Claude/Agents/license-agent.md` | License validation, binding, expiry, renewal |
| **Desktop App Agent** | `Claude/Agents/processing-agent.md` | Video queue, FFmpeg, workers, presets, save/export |
| **Backend Agent** | — | API design, DB models, auth, license server |
| **Analytics Agent** | `Claude/Agents/analytics-agent.md` | Stats, DB queries, PDF/CSV reports |
| **User Agent** | `Claude/Agents/user-agent.md` | User onboarding, emails, admin user actions |
| **Security Agent** | `Claude/Skills/license-validation.md` | License security, device binding, API validation |
| **Tester Agent** | — | Bugs, missing flows, broken UI, edge cases |
| **Docs Agent** | `docs/plan.md`, `docs/requirements.md` | Update plan/requirements after implementation |

---

## Skills Reference

| Skill | File | What It Covers |
|-------|------|---------------|
| License Validation | `Claude/Skills/license-validation.md` | Full algorithm, AES-256, state machine, rate limiting |
| Batch Processing | `Claude/Skills/batch-processing.md` | FFmpeg commands (with all transformations), GPU detect, retry |
| Analytics Reporting | `Claude/Skills/analytics-reporting.md` | SQL queries, PDFKit, csv-stringify, report templates |
| Notification System | `Claude/Skills/notification-system.md` | 7 email templates, Nodemailer, in-app alerts, toast |
| Auto-Update | `Claude/Skills/auto-update-detection.md` | Semver, download, SHA256 verify, silent install |

---

## Git Worktree Strategy

```bash
# Initial setup
git init
git checkout -b main

# Create integration branch
git checkout -b develop

# Create feature worktrees (parallel development)
git worktree add ../video-reposter-desktop    feature/desktop-app
git worktree add ../video-reposter-license    feature/license-system
git worktree add ../video-reposter-admin      feature/admin-dashboard
git worktree add ../video-reposter-backend    feature/backend-api
git worktree add ../video-reposter-payments   feature/payments
git worktree add ../video-reposter-testing    feature/testing
```

| Branch | Worktree | Purpose |
|--------|---------|---------|
| `main` | `Video Reposter/` | Stable production-ready |
| `develop` | `video-reposter-dev/` | Integration branch |
| `feature/desktop-app` | `video-reposter-desktop/` | Desktop UI + video processing |
| `feature/license-system` | `video-reposter-license/` | License validation, device binding |
| `feature/admin-dashboard` | `video-reposter-admin/` | Admin UI + dashboard features |
| `feature/backend-api` | `video-reposter-backend/` | API, DB, auth, license server |
| `feature/payments` | `video-reposter-payments/` | Stripe/Paddle integration |
| `feature/testing` | `video-reposter-testing/` | Unit + integration tests, bug fixes |

---

## Coding Rules (Enforce These Always)

### ✅ Always Do
- Read `docs/plan.md` before starting any task
- Check design screenshots for any UI task
- Use environment variables for ALL secrets and API keys
- Write modular, reusable components
- Keep FFmpeg command logic in `Claude/Skills/batch-processing.md` as the source of truth
- Add clear comments only where logic is non-obvious
- Test changes after implementation (run the relevant part of the app)
- Update `docs/plan.md` checklist after completing a task
- Log all admin actions to the audit log table

### ❌ Never Do
- Never hardcode API keys, secrets, or license server URLs in source code
- Never store license keys or passwords as plain text
- Never commit `.env` files (they are in `.gitignore`)
- Never expose backend secrets in the frontend or desktop app bundle
- Never skip input validation on the backend
- Never break existing working functionality
- Never use raw hardware data for device fingerprinting (always hash it)
- Never delete audit log entries

---

## Security Checklist (Review Before Each Release)

- [ ] License keys stored encrypted (AES-256-GCM) — never plain text
- [ ] Device ID is SHA-256 hash of hardware serial — never raw data
- [ ] All API calls use HTTPS with valid TLS certificate
- [ ] Admin endpoints protected by JWT authentication
- [ ] Role-based access enforced on every admin endpoint
- [ ] Rate limiting active on license validation endpoints
- [ ] All request bodies validated with Zod schema
- [ ] No secrets in Electron main process renderer or Next.js client bundles
- [ ] All license changes logged to audit_log table
- [ ] No timing attacks on license key comparison (use timing-safe compare)

---

## First Task Checklist

When I give you a task, follow this order every time:

```
1. IDENTIFY → Which part of the system? (desktop / admin / backend / license / analytics)
2. READ     → docs/plan.md (current status) + docs/requirements.md (feature spec)
3. CHECK    → Relevant agent file in Claude/Agents/
4. CHECK    → Relevant skill file in Claude/Skills/
5. CHECK    → Relevant worktree file in Claude/Worktree/
6. DESIGN   → If UI: open the relevant Designs/*.png and match it exactly
7. PLAN     → Write a short 3–5 bullet implementation plan
8. IMPLEMENT→ Build it step by step, clean and modular
9. EXPLAIN  → What changed, which files were modified
10. NEXT    → Recommend the next logical step
```

---

## Environment Variables Template

Each sub-project needs its own `.env` file. Never commit these.

### `backend/.env`
```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/videoreposter
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=7d
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
FROM_EMAIL=noreply@videoreposter.com
LICENSE_SERVER_SECRET=internal-server-secret
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### `desktop-app/.env`
```env
VITE_LICENSE_SERVER_URL=https://api.videoreposter.com
VITE_UPDATE_SERVER_URL=https://updates.videoreposter.com
VITE_APP_VERSION=1.0.0
APP_SECRET=used-for-license-cache-encryption-never-expose
```

### `admin-dashboard/.env.local`
```env
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000
API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_APP_NAME=Video Reposter Admin
```
