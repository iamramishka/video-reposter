# 🔄 Skill: Auto-Update Detection

## Overview
This skill defines how Video Reposter checks for available updates, notifies users, downloads and verifies updates, and applies them safely. It runs at startup and on a periodic schedule.

---

## Update Check Flow

```
APP LAUNCHES (or 24h timer fires)
  │
  ├── Step 1: GET update info from update server
  │   URL: https://updates.videoreposter.com/api/updates/latest
  │   Headers: { app-version, os, arch }
  │
  ├── Step 2: Compare versions
  │   current = APP_VERSION (from package.json)
  │   latest  = response.latest_version
  │
  ├── same version? ──► No update needed. Continue.
  │
  ├── newer version available?
  │   ├── Is it a CRITICAL update? ──► Force update (cannot skip)
  │   └── Normal update? ──► Show "Update Available" dialog
  │
  └── older than minimum_version?
      └── FORCE update (app blocks until updated)
```

---

## Update Server API

### Endpoint: `GET /api/updates/latest`

**Request Headers:**
```
X-App-Version:  1.0.0
X-OS:           windows
X-Arch:         x64
```

**Response:**
```json
{
  "latest_version": "1.1.0",
  "minimum_version": "0.9.0",
  "is_critical": false,
  "release_date": "2026-05-30",
  "release_notes": "- Fixed worker timeout bug\n- Added GPU acceleration\n- Improved dashboard performance",
  "download_url": "https://updates.videoreposter.com/releases/1.1.0/VideoReposter-1.1.0-Setup.exe",
  "file_size_mb": 85.4,
  "sha256_checksum": "a1b2c3d4e5f6...",
  "changelog_url": "https://videoreposter.com/changelog"
}
```

---

## Version Comparison Logic

```javascript
const semver = require('semver');

function checkUpdateRequired(current, latest, minimum) {
  if (semver.lt(current, minimum)) {
    return { required: true, reason: 'below_minimum' };
  }
  if (semver.lt(current, latest)) {
    return { required: false, available: true };
  }
  return { required: false, available: false };
}

// Examples:
// current=1.0.0, latest=1.1.0, minimum=0.9.0 → { required:false, available:true }
// current=0.8.0, latest=1.1.0, minimum=0.9.0 → { required:true, reason:'below_minimum' }
// current=1.1.0, latest=1.1.0, minimum=0.9.0 → { required:false, available:false }
```

---

## User-Facing Update Dialog

### Normal Update Dialog
```
┌──────────────────────────────────────────────┐
│  🔄 Update Available                         │
│  ─────────────────────────────────────────── │
│  A new version of Video Reposter is ready.   │
│                                              │
│  Current version:  1.0.0                    │
│  New version:      1.1.0  (85.4 MB)         │
│                                              │
│  What's new:                                 │
│  • Fixed worker timeout bug                  │
│  • Added GPU acceleration                    │
│  • Improved dashboard performance            │
│                                              │
│  [  Update Now  ]     [  Later  ]            │
└──────────────────────────────────────────────┘
```

### Critical Update Dialog (cannot dismiss)
```
┌──────────────────────────────────────────────┐
│  🚨 Critical Update Required                 │
│  ─────────────────────────────────────────── │
│  This update is required to continue using   │
│  Video Reposter. Your current version has    │
│  a critical security fix.                    │
│                                              │
│  Current:  0.8.0   →   Required:  1.1.0     │
│                                              │
│  [     Update Now (Required)     ]           │
└──────────────────────────────────────────────┘
```

---

## Download & Install Flow

```
USER clicks "Update Now"
  │
  ├── Step 1: Show download progress
  │   "Downloading update... 34 MB / 85 MB (40%)"
  │   [═══════════░░░░░░░░░░░░░░░] 40%
  │
  ├── Step 2: Download file
  │   Destination: AppData/Temp/VideoReposter-1.1.0-Setup.exe
  │   Method: Streaming download with progress tracking
  │
  ├── Step 3: VERIFY checksum
  │   sha256(downloaded_file) === response.sha256_checksum
  │
  │   ├── Mismatch? ──► Delete file, show error: "Download corrupted, try again"
  │   └── Match? ──► Continue
  │
  ├── Step 4: Show "Ready to Install" dialog
  │   "Update downloaded! App will restart to install."
  │   [  Install & Restart  ]    [  Install on Exit  ]
  │
  ├── Step 5: Save current session state
  │   - Save queue state
  │   - Save window position
  │   - Flush analytics DB writes
  │
  ├── Step 6: Launch installer
  │   shell.execute(installerPath, '/S /SILENT')
  │
  └── Step 7: Close app
      app.quit()

INSTALLER runs silently
  → Overwrites old app files
  → Preserves: data/, config/, output/
  → Restarts app automatically
```

---

## Download Progress Tracking

```javascript
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

async function downloadUpdate(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const hash = crypto.createHash('sha256');

    https.get(url, (response) => {
      const total = parseInt(response.headers['content-length'], 10);
      let downloaded = 0;

      response.on('data', (chunk) => {
        file.write(chunk);
        hash.update(chunk);
        downloaded += chunk.length;
        onProgress(Math.round((downloaded / total) * 100));
      });

      response.on('end', () => {
        file.end();
        resolve(hash.digest('hex'));
      });

      response.on('error', reject);
    });
  });
}
```

---

## Update Check Schedule

```javascript
// On startup
await checkForUpdates();

// Every 24 hours while app is running
setInterval(async () => {
  const result = await checkForUpdates();
  if (result.available) {
    // Show tray notification
    showToast('🔄 Update Available', `Version ${result.latest} is ready to install.`);
    // Show banner in dashboard
    showBanner({ type: 'info', message: `v${result.latest} available. Update now?`, action: 'Update' });
  }
}, 24 * 60 * 60 * 1000);
```

---

## Rollback Plan

If a user reports the new version is broken:
```
1. Admin sets rollback flag on update server:
   PATCH /api/updates/rollback { version: "1.1.0", rollback_to: "1.0.0" }

2. App checks rollback flag on next update check

3. App downloads previous version installer (1.0.0)

4. Shows dialog: "A fix for the latest update is available. Roll back?"

5. Follows same download + install flow
```

---

## Files & Directories

```
AppData/VideoReposter/
├── Cache/
│   └── update_info.json        ← Cached update check result (TTL: 1h)
├── Temp/
│   └── VideoReposter-1.1.0-Setup.exe  ← Downloaded installer (deleted after install)
└── Logs/
    └── updater.log              ← Update check and install logs
```

---

## Used By

```
Claude/Worktree/initialization.md
Claude/Worktree/main-worktree.md
```
