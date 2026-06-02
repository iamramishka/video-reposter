# 🔔 Skill: Notification System

## Overview
This skill defines all notification logic — email templates, in-app alerts, system tray notifications, and dispatch rules. It is used by the User Agent and License Agent.

---

## Notification Channels

| Channel | Used For | Library |
|---------|---------|---------|
| **Email** | License expiry, renewal, onboarding, admin alerts | Nodemailer / SendGrid |
| **In-App Banner** | Live warnings inside the desktop app | Custom event bus |
| **Modal Dialog** | Urgent alerts requiring user action | Electron dialog API |
| **System Tray** | Background notifications when app is minimized | Electron `Notification` |
| **System Toast** | Batch complete, processing errors | Windows Notification API |

---

## Email Templates

### 1. Welcome Email — `welcome-email`
```html
Subject: Welcome to Video Reposter! Here's your license key 🎬

Hi {{name}},

Welcome aboard! Your license is ready.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
License Key:  {{license_key}}
Plan:         {{plan}}
Expires:      {{expires_at}}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

To activate:
1. Open Video Reposter
2. Click "Enter License Key"
3. Paste your key above
4. Click "Activate"

Need help? Reply to this email or visit: support.videoreposter.com

— The Video Reposter Team
```

### 2. Expiry Reminder 30 Days — `expiry-reminder-30d`
```html
Subject: ⏰ Your Video Reposter license expires in 30 days

Hi {{name}},

Your {{plan}} license expires on {{expires_at}} — that's 30 days away.

Renew now to keep your workflow uninterrupted:

[ Renew My License → {{renewal_link}} ]

If you have questions, contact support@videoreposter.com

— Video Reposter
```

### 3. Expiry Reminder 7 Days — `expiry-reminder-7d`
```html
Subject: ⚠️ URGENT: License expires in 7 days

Hi {{name}},

Your Video Reposter license expires on {{expires_at}}.

After expiry, you will lose access to all processing features.

[ Renew Now — {{renewal_link}} ]

— Video Reposter
```

### 4. Expiry Reminder 1 Day — `expiry-urgent-1d`
```html
Subject: 🚨 Last chance: License expires TOMORROW

Hi {{name}},

This is your final reminder. Your license expires tomorrow ({{expires_at}}).

After expiry, you'll enter a 24-hour grace period, then the app will lock.

[ Renew Immediately — {{renewal_link}} ]

— Video Reposter
```

### 5. Renewal Confirmed — `renewal-confirmed`
```html
Subject: ✅ License renewed successfully!

Hi {{name}},

Great news — your license has been renewed.

New expiry date: {{new_expires_at}}

You're all set. Keep creating!

— Video Reposter
```

### 6. Account Revoked — `account-revoked`
```html
Subject: Your Video Reposter access has been revoked

Hi {{name}},

Your license ({{license_key}}) has been revoked by an administrator.

If you believe this is an error, please contact:
support@videoreposter.com

— Video Reposter
```

### 7. Device Reset — `device-reset`
```html
Subject: Device binding reset for your license

Hi {{name}},

Your device binding has been reset. You can now activate Video Reposter on a new device.

License Key: {{license_key}}

If you did not request this, contact support immediately.

— Video Reposter
```

---

## In-App Notification Types

### Banner (top of dashboard)
```javascript
// Info — blue
showBanner({ type: 'info', message: 'License expires in 30 days.', action: 'Renew' });

// Warning — yellow
showBanner({ type: 'warning', message: 'License expires in 7 days!', action: 'Renew Now' });

// Danger — red
showBanner({ type: 'danger', message: 'License expires TOMORROW!', action: 'Renew Now', dismissable: false });

// Success — green
showBanner({ type: 'success', message: 'Batch processing complete! 18/20 videos done.' });
```

### Modal Dialog
```javascript
// For urgent actions requiring user decision
showModal({
  title: '⚠️ License Expiring Tomorrow',
  message: 'Your license expires on 2026-06-01. Renew now to avoid interruption.',
  buttons: [
    { label: 'Renew Now', action: () => openURL(renewal_link), primary: true },
    { label: 'Remind Later', action: 'dismiss' }
  ]
});
```

### System Toast (Windows)
```javascript
const { Notification } = require('electron');

function showToast(title, body) {
  new Notification({ title, body, icon: 'assets/icon.png' }).show();
}

// Examples:
showToast('✅ Processing Complete', '18 of 20 videos processed successfully.');
showToast('⚠️ Worker Stalled', 'video_007.mp4 is taking longer than expected.');
showToast('🔔 License Expiring', 'Your license expires in 7 days.');
```

---

## Email Dispatch Logic

```javascript
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendEmail(template, recipient, variables) {
  const html = renderTemplate(template, variables);

  const mailOptions = {
    from: `"Video Reposter" <noreply@videoreposter.com>`,
    to: recipient.email,
    subject: getSubject(template, variables),
    html
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await transporter.sendMail(mailOptions);
      logNotification(template, recipient, 'sent');
      return;
    } catch (err) {
      if (attempt < 3) {
        await sleep(5 * 60 * 1000); // wait 5 min
      } else {
        logNotification(template, recipient, 'failed', err.message);
      }
    }
  }
}
```

---

## Notification Schedule

```javascript
// Runs on app startup and daily at 08:00
async function scheduleExpiryReminders() {
  const expiringLicenses = await getLicensesExpiringWithin(30);

  for (const license of expiringLicenses) {
    const days = getDaysUntil(license.expires_at);

    if (days <= 1 && !alreadySent(license.key, 'expiry-urgent-1d')) {
      await sendEmail('expiry-urgent-1d', license.user, { ...license });
      markSent(license.key, 'expiry-urgent-1d');

    } else if (days <= 7 && !alreadySent(license.key, 'expiry-reminder-7d')) {
      await sendEmail('expiry-reminder-7d', license.user, { ...license });
      markSent(license.key, 'expiry-reminder-7d');

    } else if (days <= 30 && !alreadySent(license.key, 'expiry-reminder-30d')) {
      await sendEmail('expiry-reminder-30d', license.user, { ...license });
      markSent(license.key, 'expiry-reminder-30d');
    }
  }
}
```

---

## Notification Log Table

```sql
CREATE TABLE notification_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  template      TEXT NOT NULL,
  recipient     TEXT NOT NULL,
  license_key   TEXT,
  status        TEXT CHECK(status IN ('sent','failed','skipped')),
  error_message TEXT,
  sent_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Rate Limiting

```
Per-user per-template:     Max 1 per 24 hours
Bulk send rate:            Max 10 emails/second
Daily email cap:           1000 emails/day (configurable)
Retry delay:               5 minutes between attempts
Max retries:               3 per email
```

---

## Used By

```
Claude/Agents/license-agent.md
Claude/Agents/user-agent.md
Claude/Worktree/admin-actions.md
```
