# 🔐 Skill: License Validation

## Overview
This skill defines the complete logic for validating, caching, monitoring, and enforcing license status throughout the application lifecycle. It is used directly by the License Agent.

---

## Validation Algorithm

### Step 1 — Generate Device ID
```javascript
// Pseudo-code: collect hardware identifiers
const cpuSerial    = getCPUSerialNumber();  // via WMI: Win32_Processor.ProcessorId
const boardSerial  = getMotherboardSerial(); // via WMI: Win32_BaseBoard.SerialNumber
const combinedRaw  = `${cpuSerial}:${boardSerial}`;
const device_id    = sha256(combinedRaw); // deterministic, non-reversible
```

### Step 2 — Load Local Cache
```javascript
// Path: AppData/VideoReposter/license.enc
// Encrypted with AES-256-GCM using machine key

const machineKey = sha256(device_id + APP_SECRET);
const cache = decryptAES256(readFile('license.enc'), machineKey);

if (!cache) return STATE.NO_LICENSE;
if (cache.device_id !== device_id) return STATE.DEVICE_MISMATCH;
```

### Step 3 — Check Cache Grace Period
```javascript
const now = Date.now();
const lastVerified = new Date(cache.last_verified).getTime();
const GRACE_PERIOD_MS = 72 * 60 * 60 * 1000; // 72 hours

if (now - lastVerified < GRACE_PERIOD_MS) {
  // Within grace period — trust cache
  if (cache.expires_at > now) return STATE.VALID_FROM_CACHE;
  else return STATE.EXPIRED;
}
// Beyond grace period — must verify online
```

### Step 4 — Online Verification
```javascript
const response = await fetch(`${LICENSE_SERVER}/api/license/validate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key: cache.license_key,
    device_id: device_id,
    app_version: APP_VERSION
  }),
  signal: AbortSignal.timeout(8000) // 8 second timeout
});

const result = await response.json();
// result: { valid, status, plan, expires_at, message }
```

### Step 5 — Handle Server Response
```javascript
switch (result.status) {
  case 'active':   return STATE.VALID;
  case 'expired':  return STATE.EXPIRED;
  case 'revoked':  return STATE.REVOKED;
  case 'mismatch': return STATE.DEVICE_MISMATCH;
  case 'notfound': return STATE.NOT_FOUND;
  default:         return STATE.ERROR;
}
```

### Step 6 — Update Local Cache
```javascript
// On successful online validation
const newCache = {
  license_key:    result.license_key,
  plan:           result.plan,
  status:         result.status,
  device_id:      device_id,
  expires_at:     result.expires_at,
  last_verified:  new Date().toISOString()
};
const encrypted = encryptAES256(JSON.stringify(newCache), machineKey);
writeFile('license.enc', encrypted);
```

---

## State Definitions

| State | Code | Description | App Behavior |
|-------|------|-------------|-------------|
| `VALID` | 0 | License active and verified | Load app normally |
| `VALID_FROM_CACHE` | 1 | Verified from cache (within 72h) | Load app, show offline badge |
| `EXPIRED` | 2 | License expired | Show renewal screen, 24h grace |
| `REVOKED` | 3 | License revoked by admin | Hard block, show support info |
| `DEVICE_MISMATCH` | 4 | Different device detected | Show conflict dialog |
| `NOT_FOUND` | 5 | Key not in system | Show "invalid key" error |
| `NO_LICENSE` | 6 | No cache file | Show activation screen |
| `NETWORK_ERROR` | 7 | Cannot reach server | Use cache grace period |
| `ERROR` | 8 | Unknown error | Show error, retry option |

---

## License Key Format

```
Format:  VDRP-XXXX-XXXX-XXXX-XXXX
Regex:   /^VDRP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/

Examples:
  VDRP-A1B2-C3D4-E5F6-G7H8   ← Valid
  VDRP-1234-5678-9ABC-DEF0    ← Valid
  1234-5678-9ABC-DEF0-XXXX    ← Invalid (wrong prefix)
  VDRP-12-3456-7890-ABCD      ← Invalid (wrong segment length)
```

---

## Rate Limiting & Security

```
Validation attempts:
  Max 5 failed attempts → 1-hour lockout
  Lockout stored in: AppData/VideoReposter/lockout.json
  { locked_until: "ISO timestamp", attempts: 5 }

After lockout expires:
  Reset attempt counter
  Allow new validation

Brute force protection (server-side):
  IP rate limit: 10 requests/minute
  Key rate limit: 20 validations/day
  Suspicious activity: flag in admin dashboard
```

---

## Encryption Details

```
Algorithm:    AES-256-GCM
Key source:   SHA-256(device_id + APP_SECRET)
APP_SECRET:   Hardcoded in app binary (obfuscated)
IV:           Random 12 bytes, stored with ciphertext
Auth tag:     16 bytes, verifies integrity on decrypt
File format:  {iv_hex}:{auth_tag_hex}:{ciphertext_hex}
```

---

## Background Renewal Monitor

```javascript
// Runs as background job, checks every 24 hours
setInterval(async () => {
  const cache = loadCache();
  const daysUntilExpiry = getDaysUntil(cache.expires_at);

  if (daysUntilExpiry <= 30) {
    await notificationSystem.sendExpiryReminder(daysUntilExpiry);
  }

  if (daysUntilExpiry <= 0) {
    app.setState(STATE.EXPIRED);
    showRenewalScreen();
  }

  // Re-verify online every 24h
  await licenseAgent.verifyOnline();

}, 24 * 60 * 60 * 1000);
```

---

## Activation UI Flow

```
Screen: License Activation

┌──────────────────────────────────────────────┐
│  🎬 Video Reposter                           │
│  ─────────────────────────────────────────── │
│  Activate Your License                       │
│                                              │
│  License Key:                                │
│  [VDRP- ____-____-____-____        ]         │
│                                              │
│  [    Activate License    ]                  │
│                                              │
│  Don't have a license?                       │
│  [  Buy Now  ]  [  Contact Support  ]        │
└──────────────────────────────────────────────┘

States:
  Idle:         Input field + Activate button enabled
  Validating:   Spinner shown, button disabled
  Success:      Green checkmark, transition to dashboard
  Error:        Red error message below input
```

---

## Used By

```
Claude/Agents/license-agent.md
Claude/Worktree/initialization.md
Claude/Worktree/admin-actions.md
```
