# 🔑 License Agent

## Overview
The License Agent is the core security and access-control component of Video Reposter. It handles all license lifecycle operations: validation on startup, device binding, renewal tracking, and expiry enforcement.

---

## Responsibilities

| Task | Trigger | Output |
|------|---------|--------|
| Validate license key format | App launch / manual check | Pass / Fail + reason |
| Verify license online | App launch / network reconnect | Valid / Expired / Not Found |
| Bind license to device | First activation | Device ID stored + confirmed |
| Check device mismatch | Every startup | Allow / Block + reset option |
| Track expiry date | Daily background job | Days remaining |
| Send renewal reminders | 30 / 14 / 7 / 1 days before expiry | In-app notification + email |
| Revoke license (admin) | Admin action | License deactivated immediately |
| Reset device binding | Admin action | Binding cleared, user can re-activate |
| Extend license | Admin / payment flow | New expiry date written to server |

---

## Agent Workflow

```
START
  │
  ▼
[1] LOAD local license cache
  │
  ├─ Cache missing? ──► Show Activation Screen ──► Collect license key
  │
  ▼
[2] VALIDATE license key format (regex check)
  │
  ├─ Invalid format? ──► Show error: "Invalid license key"
  │
  ▼
[3] CALL License Server API (POST /validate)
  │   Payload: { key, device_id, app_version }
  │
  ├─ Network error? ──► Use cached license (grace period: 72h)
  ├─ 404 Not Found?  ──► Show error: "License not found"
  ├─ 403 Revoked?    ──► Block app, show: "License revoked. Contact support."
  ├─ 409 Device mismatch? ──► Show dialog: "Activate on this device?"
  │                          └─ Admin reset required
  ├─ 402 Expired?    ──► Show renewal CTA, allow 24h grace period
  │
  ▼
[4] BIND device (if first activation)
  │   POST /activate { key, device_id, hostname, os }
  │
  ▼
[5] STORE license data locally (encrypted)
  │   { key, plan, expiry, device_id, activated_at }
  │
  ▼
[6] START background renewal monitor (daily ping)
  │
  ▼
[7] EMIT event: license:valid → Dashboard loads
END
```

---

## API Endpoints (License Server)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/license/validate` | Validate key + device |
| `POST` | `/api/license/activate` | Bind key to device |
| `POST` | `/api/license/renew` | Extend expiry date |
| `POST` | `/api/license/revoke` | Admin: revoke license |
| `POST` | `/api/license/reset-device` | Admin: clear device binding |
| `GET`  | `/api/license/status/:key` | Get current license status |

---

## Data Schema

```json
{
  "license_key": "VDRP-XXXX-XXXX-XXXX",
  "plan": "pro | starter | enterprise",
  "status": "active | expired | revoked | pending",
  "device_id": "sha256-hash-of-hardware-id",
  "hostname": "USER-PC",
  "os": "Windows 11",
  "activated_at": "2025-01-01T00:00:00Z",
  "expires_at": "2026-01-01T00:00:00Z",
  "grace_period_ends": "2026-01-02T00:00:00Z",
  "last_verified": "2026-05-31T00:00:00Z"
}
```

---

## Renewal Reminder Schedule

```
Expiry - 30 days  →  Info banner in dashboard
Expiry - 14 days  →  Yellow warning banner + email
Expiry - 7 days   →  Orange warning popup on launch
Expiry - 1 day    →  Red urgent modal on launch
Expiry day        →  Grace period activated (24h)
Grace period end  →  App locked, show renewal screen
```

---

## Error Handling

| Error Code | Meaning | Agent Action |
|------------|---------|-------------|
| `LIC_001` | Key not found | Show "Invalid license" screen |
| `LIC_002` | Key expired | Show renewal CTA with grace period |
| `LIC_003` | Device mismatch | Show device conflict dialog |
| `LIC_004` | Key revoked | Hard block, show support contact |
| `LIC_005` | Server unreachable | Use local cache (72h grace) |
| `LIC_006` | Max activations reached | Show "limit reached" + contact admin |

---

## Security Notes

- License key stored **encrypted** using AES-256 with a machine-derived key
- Device ID is a **SHA-256 hash** of CPU serial + motherboard serial — never raw hardware data
- All API calls use **HTTPS** with certificate pinning
- Offline grace period is **72 hours** to handle temporary network issues
- Failed validation attempts are **rate limited** (5 attempts, then 1-hour lockout)

---

## Files Used by This Agent

```
Claude/Skills/license-validation.md     ← Validation logic
Claude/Skills/notification-system.md    ← Expiry reminders
Claude/Worktree/initialization.md       ← Startup sequence
```
