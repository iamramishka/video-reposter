# Project Requirements

## System Overview

**Project Name:** Video Reposter — Batch Processing & License Management System  
**Type:** Windows Desktop Application + Online Admin Dashboard + Backend API  
**Status:** Planning Phase

---

## 1. Desktop Application Requirements

### 1.1 License Activation
- [ ] Show license activation screen on first launch (no license cache found)
- [ ] Accept license key in format: `VDRP-XXXX-XXXX-XXXX-XXXX`
- [ ] Validate license online via API (POST /api/license/validate)
- [ ] Bind license to device using SHA-256 hardware fingerprint (CPU + motherboard serial)
- [ ] Store license encrypted locally (AES-256-GCM)
- [ ] Support license expiry dates (monthly / yearly plans)
- [ ] 72-hour offline grace period when server unreachable
- [ ] 24-hour grace period after license expiry before hard block
- [ ] Show renewal CTA when license expires
- [ ] Block app when license is revoked (no grace period)
- [ ] Show device conflict dialog when device ID doesn't match
- [ ] Allow device reset ONLY from admin dashboard
- [ ] Rate limit validation attempts (5 failures → 1-hour lockout)
- [ ] Send expiry reminders at 30, 14, 7, 1 days before expiry

### 1.2 Video Input
- [ ] Single video file upload (file picker)
- [ ] Bulk video upload (multi-select)
- [ ] Drag and drop files onto the app
- [ ] Import entire folder (all supported videos inside)
- [ ] Supported formats: .mp4, .mov, .avi, .mkv, .webm, .flv
- [ ] Show file count, total size, and validation status on import
- [ ] Detect and skip duplicate files (same filename + size)

### 1.3 Video Processing Features

#### Transformation
- [ ] Mirror / flip video (horizontal / vertical)
- [ ] Brightness adjustment (slider, -100 to +100)
- [ ] Contrast adjustment (slider, -100 to +100)
- [ ] Saturation adjustment (slider, -100 to +100)
- [ ] Sharpness adjustment (slider, 0 to 100)
- [ ] Resize video (preset sizes or custom width×height)
- [ ] Crop video (define crop area)
- [ ] Rotate video (90°, 180°, 270°, or custom degrees)

#### Watermark
- [ ] Add logo/image watermark (PNG with transparency support)
- [ ] Add text watermark (custom text, font, size, color)
- [ ] Watermark position: top-left, top-right, bottom-left, bottom-right, center
- [ ] Watermark opacity control (0–100%)
- [ ] Watermark padding from edge (px)

#### Audio
- [ ] Remove original audio track
- [ ] Replace audio with custom file (.mp3, .wav, .aac)
- [ ] Audio volume control (0–200%)
- [ ] Audio pitch adjustment (semitones)
- [ ] Speed adjustment (0.25x – 4.0x, affects audio + video)
- [ ] Fade in (duration in seconds)
- [ ] Fade out (duration in seconds)

### 1.4 Output Settings
- [ ] Select output save location (folder picker)
- [ ] Custom file naming template: `{original}_{preset}_{date}` etc.
- [ ] Export format: MP4 (primary), MKV (optional)
- [ ] Quality presets: Low / Medium / High / Ultra
- [ ] Resolution selection: 720p / 1080p / 1440p / 4K / Original / Custom
- [ ] Codec: H.264 (default), H.265 (optional), VP9 (optional)

### 1.5 Processing Controls
- [ ] Start batch processing
- [ ] Pause processing (suspend workers at safe checkpoint)
- [ ] Resume processing (continue from where paused)
- [ ] Stop processing (kill workers, clean temp files, reset queue)
- [ ] Per-video progress bar with percentage
- [ ] Overall batch progress bar
- [ ] ETA (estimated time remaining) per video and overall
- [ ] Processing queue view (list of all videos + status)
- [ ] Error display per video (error code + human-readable reason)
- [ ] Processing log panel (scrollable, timestamped)
- [ ] Auto-open output folder on completion (optional toggle)

### 1.6 Platform Presets
- [ ] Instagram Reel (1080×1920, 30fps, H.264, max 90s)
- [ ] YouTube Short (1080×1920, 60fps, H.264, max 60s)
- [ ] TikTok (1080×1920, 30fps, H.264, max 180s)
- [ ] Twitter / X (1280×720, 30fps, H.264, max 140s)
- [ ] Facebook Reel (1080×1920, 30fps, H.265, max 90s)
- [ ] Custom (user-defined all settings)

---

## 2. Admin Dashboard Requirements

### 2.1 Authentication
- [ ] Admin login (email + password)
- [ ] JWT-based session management
- [ ] Role-based access: Super Admin / Admin / Read-Only
- [ ] Session timeout (configurable)
- [ ] Audit log of all admin logins

### 2.2 User Management
- [ ] Create new user (name, email, company, plan, license key)
- [ ] View user list (searchable, sortable, paginated)
- [ ] View user details (profile, license, device, activity log)
- [ ] Edit user (name, email, plan)
- [ ] Disable / suspend user (retains data, blocks access)
- [ ] Delete user (soft-delete, 30-day retention)
- [ ] View assigned license per user
- [ ] View device information (hostname, OS, last seen)

### 2.3 License Management
- [ ] Generate new license keys (single or bulk)
- [ ] Assign license to user
- [ ] Set expiry date (monthly / yearly / custom)
- [ ] Extend license expiry (add N days)
- [ ] Revoke license (immediate, no grace period)
- [ ] Reset device activation (clears device binding)
- [ ] View license status (active / expired / revoked / pending)
- [ ] Filter licenses by: plan, status, device, expiry range
- [ ] License detail view: key, user, plan, status, device ID, dates
- [ ] License distribution chart (pie: active vs expired vs revoked)
- [ ] Activity timeline per license

### 2.4 Analytics
- [ ] Total registered users
- [ ] Active license count
- [ ] Expired license count
- [ ] Revoked license count
- [ ] Licenses expiring in next 30 days
- [ ] Daily activation chart (last 30 days)
- [ ] Processing statistics (total videos, success rate, data volume)
- [ ] Recent activations list
- [ ] Top error codes
- [ ] System performance metrics (CPU, RAM usage)
- [ ] Export analytics as PDF or CSV

### 2.5 Optional Payment Management
- [ ] Monthly plan management
- [ ] Yearly plan management
- [ ] Payment history per user
- [ ] Invoice generation and download
- [ ] Payment summary dashboard (MRR, ARR, churn)
- [ ] Integration: Stripe or Paddle

---

## 3. Backend API Requirements

### 3.1 License API
- [ ] POST /api/license/validate — validate key + device
- [ ] POST /api/license/activate — bind key to device
- [ ] POST /api/license/renew — extend expiry
- [ ] POST /api/license/revoke — revoke license (admin only)
- [ ] POST /api/license/reset-device — clear device binding (admin only)
- [ ] GET  /api/license/status/:key — get license info

### 3.2 Admin API
- [ ] POST /api/auth/login — admin login
- [ ] POST /api/auth/refresh — refresh JWT token
- [ ] GET/POST/PUT/DELETE /api/users — user CRUD
- [ ] GET/POST/PUT/DELETE /api/licenses — license CRUD
- [ ] GET /api/analytics — fetch analytics data
- [ ] GET /api/reports/pdf — generate PDF report
- [ ] GET /api/reports/csv — export CSV

### 3.3 Security Requirements
- [ ] All endpoints use HTTPS
- [ ] JWT authentication on all admin endpoints
- [ ] Rate limiting on license validation (per IP and per key)
- [ ] Input validation on all request bodies
- [ ] No secrets in frontend or desktop app bundles
- [ ] Audit log all license changes and admin actions
- [ ] Prevent license key enumeration (timing-safe comparisons)
- [ ] Device fingerprint stored as hash (never raw hardware data)

---

## 4. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| App startup time | < 5 seconds |
| License validation response | < 2 seconds |
| Processing throughput | ≥ 2 parallel workers default |
| GPU acceleration | Supported (NVENC / AMF / QSV) |
| Supported OS | Windows 10 / 11 (64-bit) |
| Offline operation | Full processing, limited to 72h without license check |
| Log retention | 30 days |
| Database backup | Daily automated backup |

---

## 5. Design Requirements

**Reference files (in `Designs/` folder):**
- `Designs/License Activation.png` — Activation screen
- `Designs/Dashboard.png` — Main desktop dashboard
- `Designs/Admin Dashboard.png` — Admin panel
- `Designs/License.png` — License management page

**Color palette:**

| Token | Value |
|-------|-------|
| Primary | `#3B82F6` |
| Primary Hover | `#2563EB` |
| Primary Active | `#1D4ED8` |
| Background | `#0F172A` |
| Surface | `#1E293B` |
| Text Primary | `#F8FAFC` |
| Text Secondary | `#94A3B8` |
| Success | `#22C55E` |
| Warning | `#F59E0B` |
| Error | `#EF4444` |

**Style:** Professional, trustworthy, clean, modern, dark theme
