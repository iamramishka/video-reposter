import { z } from "zod";
import { addDays, isExpired } from "../utils/dates.js";
import { generateLicenseKey, isLicenseKey, normalizeLicenseKey } from "../utils/licenseKey.js";
import type { AuditActor, AuditRepository, LicensePlan, LicenseRecord, LicenseRepository, LicenseStatus } from "../types.js";

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

function toResponse(record: LicenseRecord) {
  return {
    license_key: record.key,
    plan: record.plan,
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

function responseStatus(record: LicenseRecord): LicenseStatus {
  if (record.status === "revoked") return "revoked";
  if (isExpired(record.expiresAt)) return "expired";
  return record.status;
}

export class LicenseService {
  constructor(
    private readonly repository: LicenseRepository,
    private readonly auditRepository?: AuditRepository
  ) {}

  async listLicenses() {
    return (await this.repository.list()).map(toResponse);
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
    return toResponse(record);
  }

  async validate(input: z.infer<typeof devicePayloadSchema>) {
    const payload = devicePayloadSchema.parse({ ...input, key: normalizeLicenseKey(input.key) });
    if (!isLicenseKey(payload.key)) {
      throw new LicenseError("LIC_FORMAT", 400, "Invalid license key format");
    }

    const license = await this.repository.findByKey(payload.key);
    if (!license) throw new LicenseError("LIC_001", 404, "License not found");
    if (license.status === "revoked") throw new LicenseError("LIC_004", 403, "License revoked");
    if (license.deviceId && license.deviceId !== payload.device_id) {
      throw new LicenseError("LIC_003", 409, "License is bound to another device");
    }
    if (isExpired(license.expiresAt)) {
      throw new LicenseError("LIC_002", 402, "License expired");
    }

    const verified = await this.repository.touchVerification(payload.key);
    return { valid: true, ...toResponse(verified) };
  }

  async activate(input: z.infer<typeof devicePayloadSchema>) {
    const payload = devicePayloadSchema.parse({ ...input, key: normalizeLicenseKey(input.key) });
    if (!isLicenseKey(payload.key)) {
      throw new LicenseError("LIC_FORMAT", 400, "Invalid license key format");
    }

    const license = await this.repository.findByKey(payload.key);
    if (!license) throw new LicenseError("LIC_001", 404, "License not found");
    if (license.status === "revoked") throw new LicenseError("LIC_004", 403, "License revoked");
    if (license.deviceId && license.deviceId !== payload.device_id) {
      throw new LicenseError("LIC_003", 409, "License is bound to another device");
    }
    if (isExpired(license.expiresAt)) {
      throw new LicenseError("LIC_002", 402, "License expired");
    }

    const activated = license.deviceId
      ? await this.repository.touchVerification(payload.key)
      : await this.repository.activate(payload.key, {
          deviceId: payload.device_id,
          hostname: payload.hostname,
          os: payload.os
        });

    if (!license.deviceId) {
      await this.audit("license.activated", activated, { deviceId: payload.device_id, hostname: payload.hostname, os: payload.os });
    }
    return { valid: true, ...toResponse(activated) };
  }

  async renew(keyInput: string, days: number, actor?: AuditActor) {
    const key = normalizeLicenseKey(keyInput);
    const license = await this.repository.findByKey(key);
    if (!license) throw new LicenseError("LIC_001", 404, "License not found");
    if (license.status === "revoked") throw new LicenseError("LIC_004", 403, "License revoked");
    const baseDate = license.expiresAt.getTime() > Date.now() ? license.expiresAt : new Date();
    const renewed = await this.repository.renew(key, addDays(baseDate, days));
    await this.audit("license.renewed", renewed, { days, expiresAt: renewed.expiresAt.toISOString() }, actor);
    return toResponse(renewed);
  }

  async revoke(keyInput: string, actor?: AuditActor) {
    const key = normalizeLicenseKey(keyInput);
    if (!(await this.repository.findByKey(key))) throw new LicenseError("LIC_001", 404, "License not found");
    const revoked = await this.repository.revoke(key);
    await this.audit("license.revoked", revoked, undefined, actor);
    return toResponse(revoked);
  }

  async resetDevice(keyInput: string, actor?: AuditActor) {
    const key = normalizeLicenseKey(keyInput);
    const license = await this.repository.findByKey(key);
    if (!license) throw new LicenseError("LIC_001", 404, "License not found");
    if (license.status === "revoked") throw new LicenseError("LIC_004", 403, "License revoked");
    const reset = await this.repository.resetDevice(key);
    await this.audit("license.device_reset", reset, { previousDeviceId: license.deviceId }, actor);
    return toResponse(reset);
  }

  async status(keyInput: string) {
    const key = normalizeLicenseKey(keyInput);
    const license = await this.repository.findByKey(key);
    if (!license) throw new LicenseError("LIC_001", 404, "License not found");
    return toResponse(license);
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
}
