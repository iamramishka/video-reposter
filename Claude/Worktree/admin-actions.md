# 🛡️ Admin Actions Worktree

## Overview
This document defines every admin-level action available in the Admin Dashboard, including license management, user management, analytics access, and bulk operations. Each action includes the exact workflow, validation steps, and audit logging.

---

## Admin Dashboard Sections

```
ADMIN DASHBOARD
│
├── 1. Overview Panel         ← Live stats: users, licenses, processing
├── 2. License Management     ← Filter, view, extend, revoke, reset
├── 3. User Management        ← Create, edit, deactivate, delete users
├── 4. Analytics & Reports    ← Generate and export reports
└── 5. System Settings        ← App config, notification settings, backup
```

---

## 1. License Actions

### Extend License
```
ADMIN: clicks "Extend" on license row
  │
  ├── Show dialog: "Extend by how many days?"
  │   [ 30 days ] [ 60 days ] [ 90 days ] [ 1 year ] [ Custom ]
  │
  ├── VALIDATE: days > 0 and days ≤ 365
  │
  ├── CALL: License Agent → extendLicense({ key, days })
  │   POST /api/license/extend { key, days }
  │
  ├── Server responds with new expiry date
  │
  ├── UPDATE local license record
  │
  ├── NOTIFY user via User Agent (renewal-confirmed email)
  │
  ├── LOG: license.extended { key, added_days, new_expiry, admin_id }
  │
  └── REFRESH license table UI
```

### Revoke License
```
ADMIN: clicks "Revoke" on license row
  │
  ├── Show confirmation modal:
  │   "⚠️ Revoke this license? The user will lose access immediately."
  │   [ Cancel ] [ Revoke License ]
  │
  ├── ADMIN confirms
  │
  ├── CALL: License Agent → revokeLicense({ key })
  │   POST /api/license/revoke { key }
  │
  ├── Server marks license as REVOKED
  │
  ├── User's app will block on next launch (or within 5 min if online)
  │
  ├── NOTIFY user: "Your license has been revoked. Contact support."
  │
  ├── LOG: license.revoked { key, user_id, admin_id, reason }
  │
  └── REFRESH license table UI (status → REVOKED, shown in red)
```

### Reset Device Binding
```
ADMIN: clicks "Reset Device" on license row
  │
  ├── Show confirmation:
  │   "Reset device binding? The user can activate on a new device."
  │   [ Cancel ] [ Reset Device ]
  │
  ├── CALL: License Agent → resetDevice({ key })
  │   POST /api/license/reset-device { key }
  │
  ├── Server clears device_id field
  │
  ├── NOTIFY user: "Your device binding has been reset. Re-activate the app."
  │
  ├── LOG: license.device_reset { key, old_device_id, admin_id }
  │
  └── REFRESH license table UI (device column → "Not Bound")
```

---

## 2. User Actions

### Create User
```
ADMIN: clicks "+ New User"
  │
  ├── Show form:
  │   Name, Email, Company (optional), Plan, License Key
  │
  ├── VALIDATE:
  │   - Email format valid
  │   - Email not already registered
  │   - License key exists and unassigned
  │
  ├── CALL: User Agent → createUser({ name, email, company, plan, license_key })
  │
  ├── User Agent:
  │   - Creates user record in DB
  │   - Assigns license to user
  │   - Sends welcome email
  │   - Schedules expiry reminders
  │
  ├── LOG: user.created { user_id, email, plan, admin_id }
  │
  └── REFRESH user table UI
```

### Suspend / Reactivate User
```
SUSPEND:
  1. Set user.status = 'suspended'
  2. Revoke associated license
  3. Notify user: "Account suspended"
  4. Log: user.suspended

REACTIVATE:
  1. Set user.status = 'active'
  2. Issue or re-link license
  3. Notify user: "Account reactivated"
  4. Log: user.reactivated
```

### Delete User
```
ADMIN: clicks "Delete" (only for deactivated users)
  │
  ├── Show confirmation with TYPE-TO-CONFIRM:
  │   "Type DELETE to permanently remove this user"
  │
  ├── VALIDATE: typed text === "DELETE"
  │
  ├── Soft delete: user.status = 'deleted', user.deleted_at = now()
  │   (Hard delete only after 30-day retention period)
  │
  ├── Associated license → REVOKED
  │
  ├── LOG: user.deleted { user_id, admin_id }
  │
  └── REMOVE from user table UI
```

---

## 3. Bulk Operations

### Bulk Extend Licenses
```
1. Admin selects multiple licenses (checkboxes)
2. Clicks "Bulk Extend"
3. Choose: 30 / 60 / 90 / 365 days
4. Confirm: "Extend {n} licenses by {x} days?"
5. Process each key via License Agent (parallel, max 5 at once)
6. Show progress: "Extended 12 / 20..."
7. Show results: success / failed list
8. Notify each affected user
9. Log bulk action with admin_id
```

### Bulk Notify Users
```
1. Admin selects filter: all / plan / expiry window / custom
2. Clicks "Send Notification"
3. Choose template or write custom message
4. Preview email
5. Confirm: "Send to {n} users?"
6. User Agent dispatches emails (rate-limited: 10/second)
7. Show dispatch progress and delivery summary
8. Log: notification.bulk_sent { count, template, admin_id }
```

---

## 4. Report Generation

### Generate PDF Report
```
ADMIN: selects date range, clicks "Generate PDF"
  │
  ├── Analytics Agent collects data for range
  ├── Renders report template (processing stats + license overview)
  ├── PDF saved to: C:/VideoReposter/Reports/{date}_report.pdf
  ├── Opens system dialog: "Open file?" [Yes] [No]
  └── LOG: report.generated { type:'PDF', range, admin_id }
```

### Export CSV
```
ADMIN: clicks "Export CSV" (license table or analytics)
  │
  ├── Analytics Agent extracts data
  ├── CSV saved to: C:/VideoReposter/Reports/{date}_export.csv
  ├── Opens Save-As dialog for custom path
  └── LOG: report.exported { type:'CSV', table, admin_id }
```

---

## 5. Audit Log

Every admin action is permanently recorded:

```sql
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    TEXT NOT NULL,
  action      TEXT NOT NULL,     -- e.g. 'license.revoked'
  target_id   TEXT,              -- license_key or user_id
  detail      TEXT,              -- JSON blob with extra info
  ip_address  TEXT,
  occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Retention:** Audit logs are never automatically deleted. They must be manually archived.

---

## Admin Permissions Matrix

| Action | Super Admin | Admin | Read-Only |
|--------|------------|-------|-----------|
| View dashboard | ✅ | ✅ | ✅ |
| View license list | ✅ | ✅ | ✅ |
| Extend license | ✅ | ✅ | ❌ |
| Revoke license | ✅ | ✅ | ❌ |
| Reset device | ✅ | ✅ | ❌ |
| Create user | ✅ | ✅ | ❌ |
| Delete user | ✅ | ❌ | ❌ |
| Generate reports | ✅ | ✅ | ✅ |
| Bulk operations | ✅ | ✅ | ❌ |
| System settings | ✅ | ❌ | ❌ |
| Manage admins | ✅ | ❌ | ❌ |
