# 🚀 Initialization Worktree

## Overview
This document defines the exact startup sequence every time Video Reposter launches. It covers configuration loading, update checking, license verification, and dashboard readiness.

---

## Startup Sequence (Step-by-Step)

```
APP LAUNCH
│
├── Step 1: LOAD CONFIGURATION
│   ├── Read config.json (app settings)
│   ├── Read paths.json (output dir, temp dir, log dir)
│   ├── Initialize logger (Winston / Pino)
│   └── Set app version from package.json
│
├── Step 2: CHECK FOR UPDATES
│   ├── Call update server: GET /api/updates/latest
│   │   Payload: { current_version, os, arch }
│   │
│   ├── No update available ──► Continue startup
│   │
│   └── Update available?
│       ├── Show "Update Available" dialog
│       ├── User clicks "Update Now" ──► Download + install + restart
│       └── User clicks "Later" ──► Continue startup with banner shown
│
├── Step 3: INITIALIZE DATABASE
│   ├── Check if analytics.db exists
│   ├── If not: run schema migrations (create all tables)
│   ├── Run pending migrations if version mismatch
│   └── Verify DB integrity (PRAGMA integrity_check)
│
├── Step 4: VERIFY LICENSE
│   ├── Read local license cache (encrypted)
│   │
│   ├── No cache found?
│   │   └── Show LICENSE ACTIVATION SCREEN
│   │       ├── User enters key ──► Call License Agent
│   │       └── User clicks Buy ──► Open purchase URL
│   │
│   ├── Cache found — verify online?
│   │   ├── Network available ──► Call License Agent (online validate)
│   │   └── Network unavailable ──► Use cache (check grace period)
│   │
│   ├── License VALID ──► Continue to Step 5
│   ├── License EXPIRED ──► Show RENEWAL SCREEN (24h grace)
│   ├── License REVOKED ──► Hard block, show support info
│   └── Device MISMATCH ──► Show conflict dialog
│
├── Step 5: LOAD USER SESSION
│   ├── Read last session data (last used preset, window size, etc.)
│   ├── Restore queue state if app was closed mid-processing
│   └── Check for any unfinished batches → offer to resume
│
├── Step 6: INITIALIZE AGENTS
│   ├── Start License Agent (background renewal monitor)
│   ├── Start Analytics Agent (event listener, DB writer)
│   ├── Initialize Processing Agent (worker pool ready)
│   └── Start User Agent (notification scheduler)
│
├── Step 7: LOAD DASHBOARD
│   ├── Fetch live stats from Analytics Agent
│   ├── Restore queue from last session (if any)
│   ├── Check disk space → warn if < 5 GB free
│   └── Show main window
│
└── STARTUP COMPLETE ✅
    └── Emit: app:ready
```

---

## Configuration Files

### `config.json`
```json
{
  "app_name": "Video Reposter",
  "version": "1.0.0",
  "update_check_url": "https://updates.videoreposter.com/api/updates/latest",
  "license_server_url": "https://api.videoreposter.com",
  "max_workers": 4,
  "auto_start_queue": false,
  "theme": "dark",
  "language": "en",
  "notifications_enabled": true,
  "analytics_enabled": true,
  "log_level": "info"
}
```

### `paths.json`
```json
{
  "output_dir": "C:/VideoReposter/Output",
  "temp_dir": "C:/VideoReposter/Temp",
  "log_dir": "C:/VideoReposter/Logs",
  "db_path": "C:/VideoReposter/Data/analytics.db",
  "cache_path": "C:/VideoReposter/Cache/license.enc",
  "presets_path": "C:/VideoReposter/Config/presets.json"
}
```

---

## Startup Error Scenarios

| Error | When | Recovery |
|-------|------|---------|
| Config file missing | Step 1 | Recreate from defaults |
| DB corrupted | Step 3 | Backup + rebuild from scratch |
| No internet | Step 4 | Use license cache (grace period) |
| License expired | Step 4 | Show renewal flow |
| Disk nearly full | Step 7 | Warning banner, allow use |
| Update server down | Step 2 | Skip update check, continue |

---

## Startup Performance Targets

| Step | Max Duration |
|------|-------------|
| Config load | < 50ms |
| Update check | < 3s (async, non-blocking) |
| DB init | < 200ms |
| License validation | < 2s |
| Dashboard render | < 1s |
| **Total startup** | **< 5s** |

---

## Startup Log Example

```
[2026-05-31 18:00:00] INFO  App starting — v1.0.0
[2026-05-31 18:00:00] INFO  Config loaded successfully
[2026-05-31 18:00:00] INFO  Checking for updates...
[2026-05-31 18:00:01] INFO  No update available (current: 1.0.0, latest: 1.0.0)
[2026-05-31 18:00:01] INFO  Database initialized (0 pending migrations)
[2026-05-31 18:00:01] INFO  Validating license...
[2026-05-31 18:00:02] INFO  License valid — expires 2027-01-01 (215 days)
[2026-05-31 18:00:02] INFO  Agents initialized
[2026-05-31 18:00:02] INFO  Dashboard loaded — startup complete (2.1s)
```
