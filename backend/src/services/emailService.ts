import nodemailer from "nodemailer";
import type { LicenseRecord } from "../types.js";

export interface LicenseEmailService {
  isConfigured(): boolean;
  sendLicenseCreated(record: LicenseRecord): void;
  sendLicenseActivated(record: LicenseRecord): void;
  sendLicenseRevoked(record: LicenseRecord): void;
  sendLicenseRenewed(record: LicenseRecord): void;
  sendLicenseExpiryReminder(record: LicenseRecord, daysRemaining: number): void;
}

function smtpConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@videoreposter.app"
  };
}

function html(title: string, lines: string[]) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
<h2 style="margin:0 0 16px">${title}</h2>
${lines.map(l => `<p style="margin:8px 0">${l}</p>`).join("")}
<hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0">
<p style="font-size:12px;color:#64748b">Video Reposter — automated notification. Do not reply to this email.</p>
</body></html>`;
}

export class EmailService implements LicenseEmailService {
  private configured: boolean;
  private transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
  private from: string;

  constructor() {
    const cfg = smtpConfig();
    this.configured = Boolean(cfg.host);
    this.from = cfg.from;
    if (this.configured) {
      this.transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: cfg.auth
      });
    }
  }

  isConfigured() { return this.configured; }

  private send(to: string, subject: string, htmlBody: string) {
    if (!this.transporter) return;
    this.transporter.sendMail({ from: this.from, to, subject, html: htmlBody }).catch((err: unknown) => {
      console.error("[email] send failed:", err instanceof Error ? err.message : err);
    });
  }

  sendLicenseCreated(record: LicenseRecord) {
    if (!record.user?.email) return;
    const name = record.user.name ?? "Customer";
    const expiresAt = record.expiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    this.send(
      record.user.email,
      "Your Video Reposter license key",
      html("Welcome to Video Reposter", [
        `Hi ${name},`,
        `Your <strong>${record.plan}</strong> license is ready.`,
        `<strong>License key:</strong> <code>${record.key}</code>`,
        `<strong>Valid until:</strong> ${expiresAt}`,
        "Download and launch Video Reposter, then enter your key to activate."
      ])
    );
  }

  sendLicenseActivated(record: LicenseRecord) {
    if (!record.user?.email) return;
    const name = record.user.name ?? "Customer";
    const device = [record.hostname, record.os].filter(Boolean).join(" · ") || "your device";
    this.send(
      record.user.email,
      "Video Reposter license activated",
      html("License activated", [
        `Hi ${name},`,
        `Your license <strong>${record.key}</strong> was successfully activated on <strong>${device}</strong>.`,
        "If you did not do this, please contact support immediately."
      ])
    );
  }

  sendLicenseRevoked(record: LicenseRecord) {
    if (!record.user?.email) return;
    const name = record.user.name ?? "Customer";
    this.send(
      record.user.email,
      "Your Video Reposter license has been revoked",
      html("License revoked", [
        `Hi ${name},`,
        `Your license <strong>${record.key}</strong> has been revoked and is no longer valid.`,
        "Please contact support if you believe this is an error."
      ])
    );
  }

  sendLicenseRenewed(record: LicenseRecord) {
    if (!record.user?.email) return;
    const name = record.user.name ?? "Customer";
    const expiresAt = record.expiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    this.send(
      record.user.email,
      "Your Video Reposter license has been renewed",
      html("License renewed", [
        `Hi ${name},`,
        `Your license <strong>${record.key}</strong> has been extended.`,
        `<strong>New expiry:</strong> ${expiresAt}`
      ])
    );
  }

  sendLicenseExpiryReminder(record: LicenseRecord, daysRemaining: number) {
    if (!record.user?.email) return;
    const name = record.user.name ?? "Customer";
    const expiresAt = record.expiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const dayLabel = daysRemaining === 1 ? "1 day" : `${daysRemaining} days`;
    this.send(
      record.user.email,
      `Your Video Reposter license expires in ${dayLabel}`,
      html("License expiring soon", [
        `Hi ${name},`,
        `Your <strong>${record.plan}</strong> license <strong>${record.key}</strong> expires in <strong>${dayLabel}</strong>.`,
        `<strong>Expiry date:</strong> ${expiresAt}`,
        "Renew before the expiry date to keep Video Reposter active on your device."
      ])
    );
  }
}
