import { z } from "zod";
import { addDays, isExpired } from "../utils/dates.js";
import { generateLicenseKey, isLicenseKey, normalizeLicenseKey, timingSafeLicenseKeyEqual } from "../utils/licenseKey.js";
import { packageForPlan } from "../packages.js";
import type { AuditActor, AuditRepository, LicensePlan, LicenseRecord, LicenseRepository, LicenseStatus, PackageRepository } from "../types.js";
import type { LicenseEmailService } from "./emailService.js";

const EXPIRY_REMINDER_DAYS = [30, 14, 7, 1] as const;

export interface ExpiryReminderRunSummary {
  checked: number;
  sent: number;
  skipped: number;
  skippedUnconfigured: number;
  reminders: {
    key: string;
    email: string;
    daysRemaining: number;
    expiresAt: string;
  }[];
}

export const devicePayloadSchema = z.object({
  key: z.string(),
  device_id: z.string().min(16),
  hostname: z.string().optional(),
  os: z.string().optional(),
  app_version: z.string().optional()
});

export class LicenseError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

function buildResponse(record: LicenseRecord, packageDefinitions: Awaited<ReturnType<PackageRepository["list"]>>) {
  const packageLimits = packageForPlan(packageDefinitions, record.plan);
  return {
    license_key: record.key,
    plan: record.plan,
    package_limits: {
      video_limit: packageLimits.videoLimit,
      template_limit: packageLimits.templateLimit,
      worker_limit: packageLimits.workerLimit
    },
    status: responseStatus(record),
    device_id: record.deviceId,
    hostname: record.hostname,
    os: record.os,
    activated_at: record.activatedAt?.toISOString() ?? null,
    expires_at: record.expiresAt.toISOString(),
    last_verified: record.lastVerifiedAt?.toISOString() ?? null,
    user: record.user ?? null
  };
}

async function toResponse(record: LicenseRecord, packageRepository?: PackageRepository) {
  const packageDefinitions = packageRepository ? await packageRepository.list() : [];
  return buildResponse(record, packageDefinitions);
}

function responseStatus(record: LicenseRecord): LicenseStatus {
  if (record.status === "revoked") return "revoked";
  if (isExpired(record.expiresAt)) return "expired";
  return record.status;
}

export class LicenseService {
  constructor(
    private readonly repository: LicenseRepository,
    private readonly auditRepository?: AuditRepository,
    private readonly packageRepository?: PackageRepository,
    private readonly emailService?: LicenseEmailService
  ) {}

  async listLicenses() {
    const licenses = await this.repository.list();
    const packages = this.packageRepository ? await this.packageRepository.list() : [];
    return licenses.map((license) => buildResponse(license, packages));
  }

  async listUsers() {
    const licenses = await this.repository.list();
    const users = new Map<string, {
      name: string;
      email: string;
      company: string | null;
      license_count: number;
      active_count: number;
      pending_count: number;
      expired_count: number;
      revoked_count: number;
      latest_activation: string | null;
    }>();

    for (const license of licenses) {
      if (!license.user?.email) continue;
      const email = license.user.email;
      const current = users.get(email) ?? {
        name: license.user.name,
        email,
        company: license.user.company,
        license_count: 0,
        active_count: 0,
        pending_count: 0,
        expired_count: 0,
        revoked_count: 0,
        latest_activation: null
      };
      current.name = license.user.name;
      current.company = license.user.company;
      current.license_count += 1;
      const status = responseStatus(license);
      if (status === "active") current.active_count += 1;
      if (status === "pending") current.pending_count += 1;
      if (status === "expired") current.expired_count += 1;
      if (status === "revoked") current.revoked_count += 1;
      if (license.activatedAt && (!current.latest_activation || license.activatedAt > new Date(current.latest_activation))) {
        current.latest_activation = license.activatedAt.toISOString();
      }
      users.set(email, current);
    }

    return Array.from(users.values()).sort((a, b) => b.license_count - a.license_count || a.email.localeCompare(b.email));
  }

  async analytics() {
    const licenses = await this.repository.list();
    const initial = {
      total: licenses.length,
      active: 0,
      pending: 0,
      expired: 0,
      revoked: 0,
      activations: 0,
      expiring_soon: 0,
      plans: { starter: 0, pro: 0, enterprise: 0 } as Record<LicensePlan, number>
    };

    const summary = licenses.reduce((s, license) => {
      const status = responseStatus(license);
      s[status] += 1;
      if (license.activatedAt) s.activations += 1;
      const daysUntilExpiry = (license.expiresAt.getTime() - Date.now()) / 86_400_000;
      if (status !== "revoked" && daysUntilExpiry >= 0 && daysUntilExpiry <= 30) s.expiring_soon += 1;
      s.plans[license.plan] += 1;
      return s;
    }, initial);

    const dailyMap = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dailyMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const license of licenses) {
      if (license.activatedAt) {
        const key = license.activatedAt.toISOString().slice(0, 10);
        if (dailyMap.has(key)) dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1);
      }
    }
    const daily_activations = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count }));

    return { ...summary, daily_activations };
  }

  async sendExpiryReminders(now = new Date()): Promise<ExpiryReminderRunSummary> {
    const licenses = await this.repository.list();
    const sentKeys = await this.expiryReminderAuditKeys();
    const emailConfigured = this.emailService?.isConfigured() ?? false;
    const summary: ExpiryReminderRunSummary = {
      checked: licenses.length,
      sent: 0,
      skipped: 0,
      skippedUnconfigured: 0,
      reminders: []
    };

    for (const license of licenses) {
      const daysRemaining = daysUntilExpiry(license.expiresAt, now);
      if (
        !isReminderDay(daysRemaining) ||
        license.status === "revoked" ||
        isExpired(license.expiresAt, now) ||
        !license.user?.email
      ) {
        summary.skipped += 1;
        continue;
      }

      const auditKey = expiryReminderAuditKey(license.key, daysRemaining);
      if (sentKeys.has(auditKey)) {
        summary.skipped += 1;
        continue;
      }

      if (!emailConfigured) {
        summary.skippedUnconfigured += 1;
        continue;
      }

      this.emailService?.sendLicenseExpiryReminder(license, daysRemaining);
      await this.auditRepository?.record({
        action: "license.expiry_reminder_sent",
        subjectType: "license",
        subjectId: license.key,
        licenseId: license.id,
        metadata: {
          thresholdDays: daysRemaining,
          expiresAt: license.expiresAt.toISOString(),
          customerEmail: license.user.email
        }
      });

      sentKeys.add(auditKey);
      summary.sent += 1;
      summary.reminders.push({
        key: license.key,
        email: license.user.email,
        daysRemaining,
        expiresAt: license.expiresAt.toISOString()
      });
    }

    return summary;
  }

  async createLicense(input: {
    key?: string;
    plan?: LicensePlan;
    expiresAt?: string;
    user?: { name: string; email: string; company?: string };
  }, actor?: AuditActor) {
    const key = normalizeLicenseKey(input.key ?? generateLicenseKey());
    if (!isLicenseKey(key)) {
      throw new LicenseError("LIC_FORMAT", 400, "License key must match VDRP-XXXX-XXXX-XXXX-XXXX");
    }

    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : addDays(new Date(), 365);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new LicenseError("LIC_DATE", 400, "expiresAt must be a valid date");
    }

    const record = await this.repository.create({
      key,
      plan: input.plan ?? "pro",
      expiresAt,
      user: input.user
    });

    await this.audit("license.created", record, { plan: record.plan, expiresAt: record.expiresAt.toISOString() }, actor);
    this.emailService?.sendLicenseCreated(record);
    return toResponse(record, this.packageRepository);
  }

  async createBulkLicenses(input: {
    count: number;
    plan?: LicensePlan;
    expiresAt?: string;
    user?: { name: string; email: string; company?: string };
  }, actor?: AuditActor) {
    const created = [];
    for (let index = 0; index < input.count; index += 1) {
      created.push(await this.createLicense({
        plan: input.plan,
        expiresAt: input.expiresAt,
        user: input.count === 1 ? input.user : undefined
      }, actor));
    }
    await this.auditRepository?.record({
      action: "license.bulk_created",
      subjectType: "license",
      subjectId: null,
      adminUserId: actor?.adminUserId,
      adminEmail: actor?.adminEmail,
      metadata: {
        count: created.length,
        plan: input.plan ?? "pro",
        expiresAt: input.expiresAt ?? null
      }
    });
    return created;
  }

  async updateLicense(input: {
    key: string;
    plan?: LicensePlan;
    expiresAt?: string;
    user?: { name: string; email: string; company?: string };
  }, actor?: AuditActor) {
    const key = normalizeLicenseKey(input.key);
    const license = await this.findByKeyTimingSafe(key);
    if (!license) throw new LicenseError("LIC_001", 404, "License not found");

    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;
    if (input.expiresAt && (!expiresAt || Number.isNaN(expiresAt.getTime()))) {
      throw new LicenseError("LIC_DATE", 400, "expiresAt must be a valid date");
    }

    const updated = await this.repository.updateDetails(license.key, {
      plan: input.plan,
      expiresAt,
      user: input.user
    });
    await this.audit(
      "license.updated",
      updated,
      {
        previousPlan: license.plan,
        plan: updated.plan,
        previousExpiresAt: license.expiresAt.toISOString(),
        expiresAt: updated.expiresAt.toISOString(),
        customerEmail: updated.user?.email ?? null
      },
      actor
    );
    return toResponse(updated, this.packageRepository);
  }

  async validate(input: z.infer<typeof devicePayloadSchema>) {
    const payload = devicePayloadSchema.parse({ ...input, key: normalizeLicenseKey(input.key) });
    if (!isLicenseKey(payload.key)) {
      throw new LicenseError("LIC_FORMAT", 400, "Invalid license key format");
    }

    const license = await this.findByKeyTimingSafe(payload.key);
    if (!license) throw new LicenseError("LIC_001", 404, "License not found");
    if (license.status === "revoked") throw new LicenseError("LIC_004", 403, "License revoked");
    if (license.deviceId && license.deviceId !== payload.device_id) {
      throw new LicenseError("LIC_003", 409, "License is bound to another device");
    }
    if (isExpired(license.expiresAt)) {
      throw new LicenseError("LIC_002", 402, "License expired");
    }

    const verified = await this.repository.touchVerification(license.key);
    return { valid: true, ...(await toResponse(verified, this.packageRepository)) };
  }

  async activate(input: z.infer<typeof devicePayloadSchema>) {
    const payload = devicePayloadSchema.parse({ ...input, key: normalizeLicenseKey(input.key) });
    if (!isLicenseKey(payload.key)) {
      throw new LicenseError("LIC_FORMAT", 400, "Invalid license key format");
    }

    const license = await this.findByKeyTimingSafe(payload.key);
    if (!license) throw new LicenseError("LIC_001", 404, "License not found");
    if (license.status === "revoked") throw new LicenseError("LIC_004", 403, "License revoked");
    if (license.deviceId && license.deviceId !== payload.device_id) {
      throw new LicenseError("LIC_003", 409, "License is bound to another device");
    }
    if (isExpired(license.expiresAt)) {
      throw new LicenseError("LIC_002", 402, "License expired");
    }

    const activated = license.deviceId
      ? await this.repository.touchVerification(license.key)
      : await this.repository.activate(license.key, {
          deviceId: payload.device_id,
          hostname: payload.hostname,
          os: payload.os
        });

    if (!license.deviceId) {
      await this.audit("license.activated", activated, { deviceId: payload.device_id, hostname: payload.hostname, os: payload.os });
      this.emailService?.sendLicenseActivated(activated);
    }
    return { valid: true, ...(await toResponse(activated, this.packageRepository)) };
  }

  async renew(keyInput: string, days: number, actor?: AuditActor) {
    const key = normalizeLicenseKey(keyInput);
    const license = await this.findByKeyTimingSafe(key);
    if (!license) throw new LicenseError("LIC_001", 404, "License not found");
    if (license.status === "revoked") throw new LicenseError("LIC_004", 403, "License revoked");
    const baseDate = license.expiresAt.getTime() > Date.now() ? license.expiresAt : new Date();
    const renewed = await this.repository.renew(license.key, addDays(baseDate, days));
    await this.audit("license.renewed", renewed, { days, expiresAt: renewed.expiresAt.toISOString() }, actor);
    this.emailService?.sendLicenseRenewed(renewed);
    return toResponse(renewed, this.packageRepository);
  }

  async revoke(keyInput: string, actor?: AuditActor) {
    const key = normalizeLicenseKey(keyInput);
    const license = await this.findByKeyTimingSafe(key);
    if (!license) throw new LicenseError("LIC_001", 404, "License not found");
    const revoked = await this.repository.revoke(license.key);
    await this.audit("license.revoked", revoked, undefined, actor);
    this.emailService?.sendLicenseRevoked(revoked);
    return toResponse(revoked, this.packageRepository);
  }

  async softDelete(keyInput: string, retentionDays = 30, actor?: AuditActor) {
    const key = normalizeLicenseKey(keyInput);
    const license = await this.findByKeyTimingSafe(key);
    if (!license) throw new LicenseError("LIC_001", 404, "License not found");
    const retentionUntil = addDays(new Date(), retentionDays);
    const deleted = await this.repository.softDelete(license.key, retentionUntil);
    await this.audit("license.soft_deleted", deleted, { retentionDays, retentionUntil: retentionUntil.toISOString() }, actor);
    return toResponse(deleted, this.packageRepository);
  }

  async resetDevice(keyInput: string, actor?: AuditActor) {
    const key = normalizeLicenseKey(keyInput);
    const license = await this.findByKeyTimingSafe(key);
    if (!license) throw new LicenseError("LIC_001", 404, "License not found");
    if (license.status === "revoked") throw new LicenseError("LIC_004", 403, "License revoked");
    const reset = await this.repository.resetDevice(license.key);
    await this.audit("license.device_reset", reset, { previousDeviceId: license.deviceId }, actor);
    return toResponse(reset, this.packageRepository);
  }

  async status(keyInput: string) {
    const key = normalizeLicenseKey(keyInput);
    const license = await this.findByKeyTimingSafe(key);
    if (!license) throw new LicenseError("LIC_001", 404, "License not found");
    return toResponse(license, this.packageRepository);
  }

  private async audit(action: string, record: LicenseRecord, metadata?: Record<string, unknown>, actor?: AuditActor) {
    await this.auditRepository?.record({
      action,
      subjectType: "license",
      subjectId: record.key,
      licenseId: record.id,
      adminUserId: actor?.adminUserId,
      adminEmail: actor?.adminEmail,
      metadata
    });
  }

  private async expiryReminderAuditKeys() {
    if (!this.auditRepository) return new Set<string>();
    const entries = await this.auditRepository.listRecent(50_000);
    const sent = new Set<string>();
    for (const entry of entries) {
      if (entry.action !== "license.expiry_reminder_sent" || !entry.subjectId) continue;
      const thresholdDays = reminderThresholdFromMetadata(entry.metadata);
      if (!thresholdDays) continue;
      sent.add(expiryReminderAuditKey(entry.subjectId, thresholdDays));
    }
    return sent;
  }

  private async findByKeyTimingSafe(key: string) {
    const licenses = await this.repository.list();
    return licenses.find((license) => timingSafeLicenseKeyEqual(license.key, key)) ?? null;
  }
}

function daysUntilExpiry(expiresAt: Date, now: Date) {
  const expiresDay = Date.UTC(expiresAt.getUTCFullYear(), expiresAt.getUTCMonth(), expiresAt.getUTCDate());
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((expiresDay - nowDay) / 86_400_000);
}

function isReminderDay(daysRemaining: number): daysRemaining is typeof EXPIRY_REMINDER_DAYS[number] {
  return (EXPIRY_REMINDER_DAYS as readonly number[]).includes(daysRemaining);
}

function expiryReminderAuditKey(licenseKey: string, daysRemaining: number) {
  return `${licenseKey}:${daysRemaining}`;
}

function reminderThresholdFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || !("thresholdDays" in metadata)) return null;
  const value = (metadata as { thresholdDays?: unknown }).thresholdDays;
  return typeof value === "number" ? value : null;
}
