# 👤 User Agent

## Overview
The User Agent manages everything related to users: onboarding new users, assigning licenses, sending notifications, handling support escalations, and maintaining user profiles within the admin system.

---

## Responsibilities

| Task | Trigger | Output |
|------|---------|--------|
| Onboard new user | Admin creates user | Welcome email sent, license assigned |
| Assign license to user | Admin action | License linked to user account |
| Send expiry notifications | Scheduled / event-driven | Email + in-app alert |
| Handle user deactivation | Admin revokes access | License revoked, account locked |
| Track user activity | Login / processing events | Activity log updated |
| Generate user report | Admin request | Per-user summary PDF/CSV |
| Send bulk notifications | Admin broadcast | Email to all/filtered users |
| Manage user profile | User or admin edits | Profile data updated |

---

## Agent Workflow

### New User Onboarding Flow

```
ADMIN creates new user
  │
  ▼
[1] COLLECT user details
  │   { name, email, company, assigned_plan, license_key }
  │
  ▼
[2] VALIDATE email format + check for duplicates
  │
  ├─ Duplicate? ──► Show error: "Email already registered"
  │
  ▼
[3] CREATE user record in database
  │
  ▼
[4] ASSIGN license key to user
  │   Call License Agent: assign({ user_id, license_key })
  │
  ├─ License already assigned? ──► Alert admin
  │
  ▼
[5] SEND welcome email
  │   Template: welcome-email.html
  │   Contains: license key, activation guide link, support contact
  │
  ▼
[6] SCHEDULE expiry reminders
  │   Register reminders at: -30d, -14d, -7d, -1d of expiry
  │
  ▼
[7] LOG onboarding event to analytics
  │
  ▼
[8] DISPLAY success in admin dashboard
END
```

### Notification Dispatch Flow

```
TRIGGER: scheduled job OR license event
  │
  ▼
[1] IDENTIFY target users
  │   Filter by: plan, status, days-to-expiry, activity
  │
  ▼
[2] SELECT notification template
  │   - expiry-reminder-30d.html
  │   - expiry-reminder-7d.html
  │   - expiry-urgent-1d.html
  │   - renewal-confirmed.html
  │   - account-revoked.html
  │   - admin-broadcast.html
  │
  ▼
[3] PERSONALIZE template
  │   Inject: { name, license_key, plan, expiry_date, renewal_link }
  │
  ▼
[4] SEND via email provider (SMTP / SendGrid)
  │
  ├─ Send failed? ──► Retry after 5 min (up to 3 retries)
  │                   Log failed delivery
  │
  ▼
[5] RECORD notification in user_notifications table
  │
  ▼
[6] UPDATE in-app notification badge count
END
```

---

## User Data Schema

```json
{
  "user_id": "uuid-v4",
  "name": "John Doe",
  "email": "john@example.com",
  "company": "Acme Corp",
  "role": "user | admin",
  "status": "active | suspended | deleted",
  "license_key": "VDRP-XXXX-XXXX-XXXX",
  "plan": "starter | pro | enterprise",
  "license_expires_at": "2026-12-31T00:00:00Z",
  "created_at": "2025-01-01T00:00:00Z",
  "last_login_at": "2026-05-30T10:00:00Z",
  "notifications_enabled": true,
  "email_verified": true
}
```

---

## Notification Templates

| Template | When Sent | Channel |
|----------|-----------|---------|
| `welcome-email` | On user creation | Email |
| `expiry-reminder-30d` | 30 days before expiry | Email + In-app |
| `expiry-reminder-14d` | 14 days before expiry | Email + In-app |
| `expiry-reminder-7d` | 7 days before expiry | Email + In-app |
| `expiry-urgent-1d` | 1 day before expiry | Email + In-app + System notification |
| `renewal-confirmed` | On successful renewal | Email |
| `account-revoked` | On admin revocation | Email |
| `device-reset` | On device binding reset | Email |
| `admin-broadcast` | On admin bulk send | Email |

---

## Admin Actions Available

| Action | Description | Confirmation Required |
|--------|-------------|----------------------|
| Create User | Add new user with license | No |
| Edit User | Update name, email, plan | No |
| Assign License | Link license key to user | No |
| Revoke Access | Suspend user + revoke license | Yes |
| Delete User | Permanently remove user | Yes (type "DELETE") |
| Send Notification | Send email to user | No |
| Broadcast | Email all users or filtered group | Yes |
| Export User List | Download CSV of all users | No |
| Reset Device | Clear device binding for user | Yes |
| Extend License | Add days to user's license | No |

---

## User Activity Log

Every significant user event is logged:
```
[YYYY-MM-DD HH:MM:SS] USER_ID | EVENT_TYPE | DETAIL | IP_ADDRESS

Events tracked:
  - user.created
  - user.login
  - user.license.assigned
  - user.license.expired
  - user.license.renewed
  - user.license.revoked
  - user.notification.sent
  - user.device.reset
  - user.deleted
```

---

## Bulk Notification Filters

When sending admin broadcasts, filter targets by:

```
Plan type:        [ ] Starter  [ ] Pro  [ ] Enterprise
Status:           [ ] Active   [ ] Expired  [ ] All
Expiry window:    Expiring within [ ] 7 days  [ ] 30 days  [ ] 90 days
Last active:      Not seen in [ ] 7 days  [ ] 30 days
Custom email:     [ ] Specific list (paste emails)
```

---

## Email Configuration

```
SMTP_HOST:    smtp.sendgrid.net (or custom)
SMTP_PORT:    587
FROM_NAME:    Video Reposter Support
FROM_EMAIL:   noreply@videoreposter.com
REPLY_TO:     support@videoreposter.com
RETRY_COUNT:  3
RETRY_DELAY:  300s (5 minutes)
```

---

## Files Used by This Agent

```
Claude/Skills/notification-system.md    ← Email templates and dispatch logic
Claude/Worktree/admin-actions.md        ← Admin action workflows
Claude/Agents/license-agent.md          ← License assignment integration
```
