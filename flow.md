# Video Reposter System Flow

This document explains how the current Video Reposter system works from the admin side and the customer desktop side. It is written for practical testing and day-to-day operation.

## System Overview

Video Reposter has four main parts:

- **Admin Dashboard**: Web dashboard for managing licenses, customers, package limits, analytics, and admin password changes.
- **Backend API**: Express API that handles admin login, license creation, activation, validation, renewal, revocation, device reassignment, users, analytics, packages, and audit logs.
- **Database**: PostgreSQL/Supabase stores users, licenses, admin users, package definitions, and audit logs.
- **Desktop App**: Electron/React customer app that activates a license, stores an encrypted local license cache, imports videos, applies processing settings, and runs FFmpeg.

Local development URLs:

- Admin dashboard: `http://127.0.0.1:3000/`
- Backend API: `http://127.0.0.1:4000/api/health`

Default local admin:

- Email: `admin@videoreposter.local`
- Password: `admin12345`

## Latest Checklist Run

Date: `2026-06-06`

Automated checks completed:

- [x] Admin dashboard opens at `http://127.0.0.1:3001/` during this run because port `3000` was occupied by another local app.
- [x] Admin browser smoke clicked Dashboard, Licenses, Users, Packages, Analytics, and Account at desktop and mobile widths.
- [x] Admin browser smoke found zero horizontal page overflow on all checked pages.
- [x] Backend health works at `http://127.0.0.1:4000/api/health`.
- [x] Admin dashboard proxy reaches backend through `http://127.0.0.1:3001/api/health` during this run.
- [x] Local admin login works with `admin@videoreposter.local` / `admin12345`.
- [x] `/api/packages` returns 3 package definitions.
- [x] `/api/license/status/VDRP-A1B2-C3D4-E5F6-G7H8` includes `package_limits`.
- [x] `/api/licenses`, `/api/users`, `/api/analytics`, and `/api/audit-logs` return real data.
- [x] `npm test -w backend` passed.
- [x] `npm run build -w backend` passed.
- [x] `npm run build -w admin-dashboard` passed.
- [x] `npm test -w desktop-app` passed.
- [x] `npm run build -w desktop-app` passed.
- [x] Desktop local worker routes are covered by `desktop-app/tests/localWorkerApp.test.ts`.
- [x] Desktop local worker activation succeeded against the local backend and cached returned package limits.
- [x] Real FFmpeg smoke test passed using a generated sample video and the app's scale filter.
- [x] Scale filter produced fixed-frame output with `scalePercent: 150`.
- [x] `npm run dist -w desktop-app` completed successfully.
- [x] Installer artifact generated: `desktop-app/release/Video Reposter-Setup-0.1.0-x64.exe`.
- [x] Portable artifact generated: `desktop-app/release/Video Reposter-Portable-0.1.0-x64.exe`.
- [x] Packaged Electron runtime activated a fresh license and rendered Processing, History, Presets, and Settings.
- [x] Portable EXE launched locally as a running Windows process.
- [x] Setup installer silently installed to a temporary folder, created the installed EXE/uninstaller, and uninstalled successfully.

Manual visual checks still recommended:

- [x] Click through every admin page in the browser after login. Automated browser smoke covered this on `http://127.0.0.1:3001/` because port `3000` was occupied by another local app.
- [x] Activate a license in the packaged/desktop runtime UI. Automated packaged-runtime smoke activated `VDRP-55E1-0EB4-8DC1-6A29`.
- [x] Run a real FFmpeg job with sample video files. A generated sample video was processed successfully through the built processing command.
- [x] Confirm installer/portable build behavior on this Windows PC.
- [ ] Confirm installer/portable build behavior on a separate clean Windows PC.
- [x] Run the repeatable local release check with `npm run verify:windows-release`.
- [~] Run `.github/workflows/windows-release-verification.yml` on a fresh GitHub-hosted Windows runner.

### Task 17 Final Workflow Run

- [x] Activated isolated Starter, Pro, and Enterprise test sessions.
- [x] Completed successful and failed processing workflows for all three packages.
- [x] Verified Starter `5 / 2 / 1`, Pro `50 / 5 / 2`, and Enterprise `500 / 5 / 4` package limits.
- [x] Verified over-limit imports show package-specific messages and link to package details.
- [x] Verified changing the saved default preset does not change the current batch preset.
- [x] Verified failed jobs appear in History with retry only when retryable.
- [x] Verified Reset Adjustments preserves saved output, preset, and worker defaults.
- [x] Verified Clear Queue and Clear History cancel/confirm behavior and file-preservation messages.
- [x] Verified all tested desktop pages have no horizontal overflow at `800px`.
- [x] Verified no customer page displayed npm commands, FFmpeg exit codes, or stderr details.
- [x] Backend: `22` tests passed and build passed.
- [x] Desktop: `61` tests passed and build passed.
- [x] Admin dashboard build passed.
- [x] Found and fixed a real scale-filter failure for landscape video scaled inside portrait output.
- [x] Bundled FFmpeg produced fixed `1080x1920` and `1280x720` outputs at `150%` scale.
- [x] Found and fixed the built backend start path; `npm run start -w backend` now launches `dist/src/server.js`.
- [x] Fresh-location silent installer created and launched the installed app.
- [x] Portable EXE extracted and launched the Electron app.
- [ ] Release executables are not code-signed; add a signing certificate before public distribution to reduce SmartScreen warnings.
- Release verification and clean-PC instructions: `docs/windows-release-checklist.md`.

## Admin Side Flow

### 1. Login

1. Admin opens `http://127.0.0.1:3000/`.
2. Admin signs in with email and password.
3. Backend verifies the admin password.
4. Backend returns a JWT token.
5. Dashboard stores the token in browser local storage and loads admin data.

If login fails, check:

- Backend server is running on port `4000`.
- Admin dashboard proxy is working.
- Local seeded admin email/password are correct.

### 2. Dashboard Page

The Dashboard page is the admin home screen.

It shows:

- Total licenses
- Active licenses
- Pending licenses
- Licenses expiring in 30 days
- Create License form
- Bulk License Generation form
- Expiring Soon panel
- Recent Activity audit log

Admin can:

- Create one license for a named customer.
- Bulk-generate multiple licenses.
- Export expiring licenses as CSV.
- Review recent admin/license/package activity.

### 3. Licenses Page

The Licenses page is for full license management.

Admin can:

- Search licenses.
- Filter by status, plan, expiry, device, and company.
- Edit plan/package label.
- Edit expiry date.
- Edit customer details.
- Extend expiry by a selected number of days.
- Reassign device, which clears the old PC binding.
- Revoke a license, which blocks customer access.
- Open a license detail panel.
- Export filtered licenses as CSV.

Important behavior:

- A revoked license cannot be activated by the customer.
- A device-bound license cannot activate on another PC until admin uses Reassign Device.
- Expired licenses report as expired even if the stored database status is still pending or active.

### 4. Users Page

The Users page lists customers grouped from license records.

It shows:

- Customer name
- Email
- Company
- License count
- Active, pending, expired, and revoked counts
- Latest activation

Admin can:

- Search customers.
- Export customer list as CSV.

In this version, “Users” means customers, not admin accounts.

### 5. Packages Page

The Packages page has two practical jobs:

1. Edit package limits.
2. Assign packages to licenses.

Packages are fixed:

- Starter
- Pro
- Enterprise

Admin can edit these limits for each package:

- Video limit
- Template/preset limit
- Worker limit

Default local limits:

| Package | Video Limit | Template Limit | Worker Limit |
|---|---:|---:|---:|
| Starter | 5 | 2 | 1 |
| Pro | 50 | 5 | 2 |
| Enterprise | 500 | 5 | 4 |

Admin can also:

- Search package allocation rows.
- Filter by package.
- Change a license from Starter to Pro or Enterprise.
- Save package allocation per license.

Package limit changes are stored in the backend and recorded in audit logs.

### 6. Analytics Page

The Analytics page shows practical license metrics from current data.

It includes:

- Total licenses
- Active licenses
- Pending licenses
- Expiring in 30 days
- Activations
- Revoked count
- Expired count
- Plan/package split

### 7. Account Page

The Account page lets the signed-in admin change their password.

Admin must enter:

- Current password
- New password
- Confirm new password

The backend verifies the current password and stores the new password hash.

## User/Desktop Side Flow

### 1. App Launch

When the customer opens the desktop app:

1. App gets the local device ID.
2. App checks the encrypted local license cache.
3. If the cache is valid and recently verified, the user enters the desktop dashboard.
4. If the cache is missing, expired, revoked, or stale, the app shows the activation screen or refreshes validation online.

Local license cache includes:

- License key
- Plan/package
- Status
- Device ID
- Expiry date
- Last verified time
- Customer data
- Package limits

### 2. License Activation

If no valid license exists:

1. User enters a license key in this format: `VDRP-XXXX-XXXX-XXXX-XXXX`.
2. Desktop sends the key and device info to `POST /api/license/activate`.
3. Backend checks:
   - Key exists.
   - License is not revoked.
   - License is not expired.
   - License is not already bound to another device.
4. Backend binds the license to the current device.
5. Backend returns license data and package limits.
6. Desktop stores the encrypted cache.
7. User enters the app.

### 3. License Validation

When the desktop needs to refresh license status:

1. Desktop sends key and device ID to `POST /api/license/validate`.
2. Backend checks expiry, revocation, and device binding.
3. Backend returns current license data and package limits.
4. Desktop updates local cache.

If the server is unreachable, the desktop uses cached license data during the offline grace period.

### 4. Desktop Pages

The desktop app has these user pages:

- **Activation**: Enter license key and activate the software.
- **Dashboard**: Overview of queue, processing progress, and recent work.
- **Videos**: Review imported videos and remove files from the queue.
- **Processing**: Start/pause/stop batch work, choose preset, choose output folder, and adjust video settings.
- **History**: Review completed or failed jobs.
- **Presets**: Choose platform templates such as Instagram Reel, YouTube Short, TikTok, Twitter/X, and Facebook Reel.
- **Settings**: Manage output folder, selected preset, worker count, license status, logs, and defaults.

### 5. Video Processing Flow

1. User imports videos by file picker, folder picker, or drag-and-drop.
2. Desktop skips duplicate or unsupported files.
3. User selects a preset/template.
4. User adjusts processing settings:
   - Mirror
   - Flip
   - Mute
   - Rotate
   - Scale from `100%` to `200%`
   - Brightness
   - Contrast
   - Saturation
   - Sharpness
   - Volume
5. User starts the batch.
6. Desktop starts FFmpeg jobs up to the allowed worker count.
7. Progress updates appear in the queue.
8. Completed jobs are recorded in history.
9. Logs are written for review.

Scale behavior:

- `100%` keeps the original fitted output behavior.
- Above `100%`, the video scales larger inside the selected output frame.
- The final output frame size stays fixed to the selected preset.
- Edges may crop when scale is above `100%`.

## License Lifecycle

### Create License

Admin creates a license.

Result:

- License status starts as `pending`.
- No device is bound yet.
- Customer data may be attached.
- Plan/package is assigned.

### Activate License

Customer activates the license on a desktop device.

Result:

- License becomes `active`.
- Device ID is stored.
- Activation time is recorded.
- Desktop stores encrypted license cache.

### Validate License

Desktop validates an already activated license.

Result:

- License status is refreshed.
- Package limits are refreshed.
- Last verified time is updated.

### Reassign Device

Admin uses Reassign Device.

Result:

- Existing device binding is cleared.
- License returns to pending device state.
- Customer can activate the same license on another PC.

### Renew or Extend

Admin extends the license expiry date.

Result:

- Expiry date moves forward.
- Revoked licenses cannot be renewed through normal admin actions.

### Revoke License

Admin revokes a license.

Result:

- License status becomes `revoked`.
- Customer activation and validation fail.
- Desktop blocks access after validation sees revoked status.

## Package Limits Flow

1. Admin opens Packages page.
2. Admin edits Starter, Pro, or Enterprise limits.
3. Backend stores limits in `PackageDefinition`.
4. Admin assigns a package to a license.
5. Desktop activates or validates the license.
6. License API returns `package_limits`.
7. Desktop stores the limits in encrypted cache.
8. Desktop enforces limits locally.

Current enforced limits:

- **Video limit**: Maximum videos in one batch/queue.
- **Template limit**: Number of available presets/templates.
- **Worker limit**: Maximum concurrent processing jobs.

If offline, the desktop uses the cached package limits until validation can refresh.

## Backend API Flow

### Public License Endpoints

- `POST /api/license/activate`
  - Activates and binds a license to a device.
- `POST /api/license/validate`
  - Validates an existing license and device.
- `GET /api/license/status/:key`
  - Returns license status and package limits.

### Admin Auth Endpoints

- `POST /api/auth/login`
  - Returns admin JWT token.
- `POST /api/auth/change-password`
  - Changes admin password after checking current password.

### Admin Management Endpoints

- `GET /api/licenses`
  - Lists licenses.
- `POST /api/licenses`
  - Creates one license.
- `POST /api/licenses/bulk`
  - Creates many licenses.
- `PATCH /api/license`
  - Updates license details.
- `POST /api/license/renew`
  - Extends expiry.
- `POST /api/license/revoke`
  - Revokes license.
- `POST /api/license/reset-device`
  - Clears device binding.
- `GET /api/users`
  - Lists customer summaries.
- `GET /api/packages`
  - Lists package limits.
- `PATCH /api/packages/:plan`
  - Updates package limits.
- `GET /api/analytics`
  - Returns dashboard metrics.
- `GET /api/audit-logs`
  - Returns recent audit logs.

## Page Verification Checklist

> **Verification run `2026-06-05` (code review + typecheck + tests + build).**
> All three workspaces typecheck clean; 53 automated tests pass (22 backend + 31 desktop);
> desktop production build succeeds. Each functional item below was traced to its
> implementation in source and confirmed wired correctly. The single visual-layout item
> is marked as still needing a live rendered check. Source references are noted per item.

### Admin Dashboard

- [x] Login page opens. — `App.tsx` renders `login-shell` when `!token`.
- [x] Admin can log in with local seed admin. — `login()` → `POST /api/auth/login`; backend `auth.ts` verifies via bcrypt (requires seeded DB).
- [x] Dashboard page loads stats. — `Stats` + `loadDashboard()` fetches `/api/analytics`.
- [x] Create License works without typing a key. — `createLicense()` sends no key (backend auto-generates); name/email/expiry required by the form.
- [x] Bulk License Generation creates multiple licenses. — `createBulkLicenses()` → `POST /api/licenses/bulk`.
- [x] Expiring Soon panel renders. — `ExpiringSoonPanel` with 1/7/14/30-day buckets.
- [x] Recent Activity renders package/license/admin actions. — `ActivityPanel` + `/api/audit-logs`.
- [x] Licenses page search/filter works. — `filteredLicenses` (status/plan/expiry/device/company/text).
- [x] License detail panel opens. — `onSelect` → `selectedLicense` → `LicenseDetailPanel`.
- [x] License can be renewed. — renew action → `POST /api/license/renew`.
- [x] Device can be reassigned. — reset action → `POST /api/license/reset-device` (clears selection on success).
- [x] License can be revoked. — revoke action → `POST /api/license/revoke` (clears selection on success).
- [x] Users page renders customer rows. — `UsersPage` + `CustomerRow` from `/api/users`.
- [x] Users CSV export works. — `exportUsersCsv` → `downloadCsv` (Blob download).
- [x] Packages page renders package limit editor. — `PackageLimitCard` per plan.
- [x] Package limit save works. — `updatePackage()` → `PATCH /api/packages/:plan` (now `requireWritableAdmin`).
- [x] Package allocation save works. — `PackageAllocationRow` → `updateLicense()` → `PATCH /api/license`.
- [x] Analytics page renders totals and plan split. — `Stats` + `AnalyticsPage` plan bars.
- [x] Account password change rejects wrong current password. — backend `auth.ts` returns 401 "Current password is incorrect".
- [x] Account password change accepts correct current password. — verifies + `updateAdminPassword` with fresh bcrypt hash.
- [x] No page has horizontal overlap or broken table layout. — **live-render verified** (admin served against seeded Postgres, all 6 pages + license detail panel measured at 1440/1280/768 px; zero elements past the viewport, all tables fit their container). A real overflow was found and fixed: `.license-table` and `.package-table` used fixed-pixel grid columns (1130px / 1170px) that exceeded the ~1099px container and were clipped by `overflow:hidden` (cutting off action buttons); converted to flexible `minmax()` columns with `min-width:0` cells, ellipsis truncation for long emails/device IDs, and a tablet stacking fix for `.service-grid`.

### Desktop App

- [x] Activation page opens when no valid license exists. — non-VALID states render `ActivationScreen`.
- [x] Valid license activates successfully. — `activate()` → `license:activate` IPC → `licenseClient.activate`.
- [x] Invalid license shows a clear error. — format check + server `result.message` surfaced in the error box.
- [x] Revoked license blocks access. — `stateFromCache` → `REVOKED` → activation screen with revoked message.
- [x] Device mismatch blocks access. — server returns `LIC_003`; activation fails with "bound to another device" (corrupt/mismatched cache also falls back to activation screen).
- [x] Dashboard page renders after activation. — `onActivated` sets `VALID` → `Dashboard`.
- [x] Videos can be imported. — picker, folder, and drag-drop/file-input (drag-drop path bug fixed this session via Electron `File.path`).
- [x] Package video limit blocks too many queued videos. — `queueImportedVideos`/`importFiles` enforce `video_limit`.
- [x] Processing page can start/pause/stop batch work. — `startBatch`/`pauseBatch`/`stopBatch`.
- [x] Preset list respects package template limit. — `visiblePresets = presets.slice(0, template_limit)`.
- [x] Worker input respects package worker limit. — `updateMaxWorkers` clamps to `worker_limit`; input `max={workerLimit}`.
- [x] Scale slider appears from `100%` to `200%`. — `Slider label="Scale" min={100} max={200}`.
- [x] Reset returns scale to `100%`. — Reset applies `defaultTransforms` (`scalePercent: 100`).
- [x] History records completed/failed jobs. — `recordHistoryItem` on terminal `complete`/`failed` updates.
- [x] Settings page opens logs and shows license status. — `SettingsPanel` Open Log + license status line.

### API Checks

Health:

```bash
curl http://127.0.0.1:4000/api/health
```

Admin login:

```bash
curl -X POST http://127.0.0.1:4000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@videoreposter.local\",\"password\":\"admin12345\"}"
```

Package limits:

```bash
curl http://127.0.0.1:4000/api/packages ^
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

License status includes `package_limits`:

```bash
curl http://127.0.0.1:4000/api/license/status/VDRP-A1B2-C3D4-E5F6-G7H8
```

## Common Commands

Install dependencies:

```bash
npm install
```

Start local database:

```bash
docker compose up -d postgres
```

Apply database migrations:

```bash
npm run db:deploy -w backend
```

Seed local admin and sample license:

```bash
npm run db:seed -w backend
```

Start all local apps:

```bash
npm run dev
```

Start backend only:

```bash
npm run dev -w backend
```

Start admin dashboard only:

```bash
npm run dev -w admin-dashboard
```

Run backend tests:

```bash
npm test -w backend
```

Build backend:

```bash
npm run build -w backend
```

Run desktop tests:

```bash
npm test -w desktop-app
```

Build desktop app:

```bash
npm run build -w desktop-app
```

Build admin dashboard:

```bash
npm run build -w admin-dashboard
```

Run all builds:

```bash
npm run build
```

## Production Notes

- Production must apply all committed Prisma migrations before package limits work.
- Supabase must contain the `PackageDefinition` table.
- Admin dashboard production route must expose `/api/packages`.
- Secrets must stay on the backend/Vercel/Supabase side, not in frontend or desktop bundles.
- Customer desktop apps should use the production license server URL after release.
