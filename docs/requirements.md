# Project Requirements

## System Overview

Video Reposter is a Windows desktop batch video processor with online license activation, a backend API, and an admin dashboard.

**Current status:** MVP scaffold implemented. Requirements below track target behavior and current gaps.

## 1. Desktop Application

### 1.1 License Activation

- [x] Show license activation screen on first launch when no license cache is available
- [x] Accept license key in format `VDRP-XXXX-XXXX-XXXX-XXXX`
- [x] Validate license online through backend API
- [x] Bind license to device identifier
- [x] Store license cache encrypted locally
- [x] Support expiry dates and revoked status
- [x] Provide offline grace handling in license cache logic
- [x] Send expiry reminder emails at 30, 14, 7, and 1 days before expiry
- [x] Add richer device conflict recovery UX

### 1.2 Video Input

- [x] Supported extensions: `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm`, `.flv`
- [x] Duplicate detection by filename and size in renderer state helpers
- [x] FFprobe metadata validation
- [x] Full folder import UI with recursive native/local-worker folder scanning
- [x] Drag-and-drop polish across all supported views
- [x] Import summary with total size and validation status

### 1.3 Video Processing

- [x] Deterministic FFmpeg argument generation
- [x] Horizontal and vertical flip
- [x] Brightness, contrast, saturation, and sharpness filters
- [x] Resize/pad for platform presets
- [x] Rotate 90, 180, and 270 degrees
- [x] Remove audio
- [x] Volume control
- [x] Duration cap per preset
- [x] Crop region UI and command support
- [x] Logo/image watermark
- [x] Text watermark
- [x] Replace audio
- [x] Pitch adjustment
- [x] Speed adjustment
- [x] Fade in and fade out

### 1.4 Output

- [x] Output path support in processing jobs
- [x] Codec, bitrate, resolution, FPS, and audio bitrate settings in shared types
- [x] Output folder picker polish
- [x] Custom file naming template
- [x] Optional MKV and MOV output
- [x] Quality presets
- [x] Custom resolution UI

### 1.5 Controls And Logs

- [x] Start and stop processing jobs
- [x] Per-video progress parsing from FFmpeg stderr
- [x] Structured customer-safe failure messages
- [x] Timestamped processing logs
- [x] Queue/history state helpers
- [x] Pause/resume safe checkpoints
- [x] Overall ETA
- [x] Auto-open output folder option

### 1.6 Platform Presets

- [x] Instagram Reel
- [x] YouTube Short
- [x] TikTok
- [x] Twitter/X
- [x] Facebook Reel
- [x] Fully custom preset editor

## 2. Admin Dashboard

### 2.1 Authentication

- [x] Admin login with JWT
- [x] Role-aware UI write restrictions
- [x] Account password change UI
- [x] Configurable session timeout UX
- [x] Dedicated login audit view

### 2.2 Users

- [x] Customer list grouped from license records
- [x] Search and CSV export
- [x] Full create/edit/disable/delete user CRUD separate from license creation
- [x] Soft-delete and retention policy

### 2.3 Licenses

- [x] Generate single and bulk license keys
- [x] Assign license data to customer fields
- [x] Extend expiry
- [x] Revoke license
- [x] Reset device activation
- [x] Filter by plan, status, device, expiry, company, and search text
- [x] License detail view and activity timeline
- [x] License distribution chart

### 2.4 Analytics

- [x] Total, active, pending, expired, revoked, activations, expiring soon, and plan split
- [x] CSV exports for licenses and users
- [x] Daily activation chart
- [x] Processing statistics from desktop history
- [x] Top error codes
- [x] PDF export

### 2.5 Optional Payments

- [x] Select Stripe or Paddle
- [x] Payment history
- [x] Invoice downloads
- [x] MRR/ARR/churn dashboard
- [x] Webhook-driven license renewal

## 3. Backend API

### 3.1 License API

- [x] Validate and activate license keys
- [x] Renew licenses
- [x] Revoke licenses
- [x] Reset device binding
- [x] Get license status

### 3.2 Admin API

- [x] Login and password change
- [x] Users list
- [x] Licenses CRUD-style workflows
- [x] Package limit management
- [x] Analytics summary
- [x] Audit logs
- [x] PDF report endpoint
- [x] CSV report endpoint separate from admin client-side export

### 3.3 Security

- [x] JWT authentication on admin endpoints
- [x] Role-aware admin mutations
- [x] Rate limiting on API app
- [x] Request validation with Zod
- [x] Audit logging for license/admin actions
- [x] Production guard against default JWT secret
- [x] HTTPS enforcement at deployment edge
- [x] Timing-safe license key comparison review

## 4. Non-Functional Targets

| Requirement | Target |
| --- | --- |
| App startup time | Under 5 seconds |
| License validation response | Under 2 seconds |
| Processing throughput | At least 2 workers by default with live queue worker controls |
| GPU acceleration | Detect NVENC, AMF, and QSV where available; report CPU fallback when unavailable |
| Supported OS | Windows 10/11 64-bit |
| Offline operation | Processing allowed within license grace rules |
| Log retention | 30 days |
| Database backup | Daily automated backup in production |

## 5. Design Requirements

Reference files:

- `Designs/License Activation.png`
- `Designs/Dashboard.png`
- `Designs/Admin Dashboard.png`
- `Designs/License.png`

Palette:

| Token | Value |
| --- | --- |
| Primary | `#3B82F6` |
| Primary Hover | `#2563EB` |
| Primary Active | `#1D4ED8` |
| Background | `#0F172A` |
| Surface | `#1E293B` |
| Border | `#334155` |
| Text Primary | `#F8FAFC` |
| Text Secondary | `#94A3B8` |
| Success | `#22C55E` |
| Warning | `#F59E0B` |
| Error | `#EF4444` |
