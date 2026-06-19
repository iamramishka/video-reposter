import { describe, expect, it } from "vitest";
import type { LicenseEmailService } from "../src/services/emailService.js";
import { LicenseError, LicenseService } from "../src/services/licenseService.js";
import { addDays } from "../src/utils/dates.js";
import { isLicenseKey, timingSafeLicenseKeyEqual } from "../src/utils/licenseKey.js";
import type { LicenseRecord } from "../src/types.js";
import { MemoryAuditRepository } from "./memoryAuditRepository.js";
import { MemoryLicenseRepository } from "./memoryLicenseRepository.js";

function serviceWithActiveLicense(overrides = {}) {
  const repository = new MemoryLicenseRepository([
    {
      id: "lic_1",
      key: "VDRP-A1B2-C3D4-E5F6-G7H8",
      plan: "pro",
      status: "pending",
      deviceId: null,
      hostname: null,
      os: null,
      activatedAt: null,
      expiresAt: addDays(new Date(), 30),
      lastVerifiedAt: null,
      user: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    }
  ]);
  return { repository, service: new LicenseService(repository) };
}

function licenseRecord(overrides: Partial<LicenseRecord>): LicenseRecord {
  const now = new Date("2026-06-01T10:00:00.000Z");
  return {
    id: overrides.id ?? `lic_${overrides.key ?? "default"}`,
    key: overrides.key ?? "VDRP-A1B2-C3D4-E5F6-G7H8",
    plan: overrides.plan ?? "pro",
    status: overrides.status ?? "active",
    deviceId: null,
    hostname: null,
    os: null,
    activatedAt: null,
    expiresAt: overrides.expiresAt ?? addDays(now, 30),
    lastVerifiedAt: null,
    user: overrides.user ?? { name: "Reminder User", email: "reminder@example.com", company: null },
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

class FakeEmailService implements LicenseEmailService {
  sent: { key: string; daysRemaining: number }[] = [];

  constructor(private readonly configured = true) {}

  isConfigured() { return this.configured; }
  sendLicenseCreated() {}
  sendLicenseActivated() {}
  sendLicenseRevoked() {}
  sendLicenseRenewed() {}
  sendLicenseExpiryReminder(record: LicenseRecord, daysRemaining: number) {
    this.sent.push({ key: record.key, daysRemaining });
  }
}

describe("license service", () => {
  it("validates license key format", () => {
    expect(isLicenseKey("VDRP-A1B2-C3D4-E5F6-G7H8")).toBe(true);
    expect(isLicenseKey("VDRP-12-3456-7890-ABCD")).toBe(false);
    expect(timingSafeLicenseKeyEqual("vdrp-a1b2-c3d4-e5f6-g7h8", "VDRP-A1B2-C3D4-E5F6-G7H8")).toBe(true);
    expect(timingSafeLicenseKeyEqual("VDRP-A1B2-C3D4-E5F6-G7H8", "VDRP-1111-C3D4-E5F6-G7H8")).toBe(false);
  });

  it("activates and binds a pending license", async () => {
    const { service } = serviceWithActiveLicense();
    const result = await service.activate({
      key: "vdrp-a1b2-c3d4-e5f6-g7h8",
      device_id: "device-1234567890",
      hostname: "DESKTOP",
      os: "Windows"
    });
    expect(result.valid).toBe(true);
    expect(result.status).toBe("active");
    expect(result.device_id).toBe("device-1234567890");
  });

  it("rejects mismatched devices", async () => {
    const { service } = serviceWithActiveLicense({ status: "active", deviceId: "first-device-1234567890" });
    await expect(
      service.validate({ key: "VDRP-A1B2-C3D4-E5F6-G7H8", device_id: "other-device-1234567890" })
    ).rejects.toMatchObject({ code: "LIC_003", statusCode: 409 });
  });

  it("rejects expired and revoked licenses", async () => {
    const expired = serviceWithActiveLicense({ expiresAt: addDays(new Date(), -1) }).service;
    await expect(
      expired.validate({ key: "VDRP-A1B2-C3D4-E5F6-G7H8", device_id: "device-1234567890" })
    ).rejects.toBeInstanceOf(LicenseError);

    const revoked = serviceWithActiveLicense({ status: "revoked" }).service;
    await expect(
      revoked.validate({ key: "VDRP-A1B2-C3D4-E5F6-G7H8", device_id: "device-1234567890" })
    ).rejects.toMatchObject({ code: "LIC_004" });
  });

  it("reports expired status in list and status responses", async () => {
    const { service } = serviceWithActiveLicense({ status: "active", expiresAt: addDays(new Date(), -1) });

    await expect(service.validate({ key: "VDRP-A1B2-C3D4-E5F6-G7H8", device_id: "device-1234567890" })).rejects.toMatchObject({
      code: "LIC_002"
    });
    await expect(service.status("VDRP-A1B2-C3D4-E5F6-G7H8")).resolves.toMatchObject({ status: "expired" });
    await expect(service.listLicenses()).resolves.toEqual([expect.objectContaining({ status: "expired" })]);
  });

  it("renews, revokes, and resets device binding", async () => {
    const { service } = serviceWithActiveLicense({ status: "active", deviceId: "device-1234567890" });
    const renewed = await service.renew("VDRP-A1B2-C3D4-E5F6-G7H8", 15);
    expect(renewed.status).toBe("active");

    const reset = await service.resetDevice("VDRP-A1B2-C3D4-E5F6-G7H8");
    expect(reset.status).toBe("pending");
    expect(reset.device_id).toBeNull();

    const revoked = await service.revoke("VDRP-A1B2-C3D4-E5F6-G7H8");
    expect(revoked.status).toBe("revoked");
  });

  it("records audit entries for license lifecycle changes", async () => {
    const repository = new MemoryLicenseRepository();
    const audit = new MemoryAuditRepository();
    const service = new LicenseService(repository, audit);

    await service.createLicense({
      key: "VDRP-A1B2-C3D4-E5F6-G7H8",
      plan: "enterprise",
      expiresAt: addDays(new Date(), 30).toISOString()
    });
    await service.activate({
      key: "VDRP-A1B2-C3D4-E5F6-G7H8",
      device_id: "device-1234567890",
      hostname: "DESKTOP",
      os: "Windows"
    });
    await service.activate({
      key: "VDRP-A1B2-C3D4-E5F6-G7H8",
      device_id: "device-1234567890",
      hostname: "DESKTOP",
      os: "Windows"
    });
    await service.renew("VDRP-A1B2-C3D4-E5F6-G7H8", 15);
    await service.resetDevice("VDRP-A1B2-C3D4-E5F6-G7H8");
    await service.revoke("VDRP-A1B2-C3D4-E5F6-G7H8");

    expect(audit.entries.map((entry) => entry.action)).toEqual([
      "license.created",
      "license.activated",
      "license.renewed",
      "license.device_reset",
      "license.revoked"
    ]);
    expect(audit.entries[0]).toMatchObject({
      subjectType: "license",
      subjectId: "VDRP-A1B2-C3D4-E5F6-G7H8",
      metadata: { plan: "enterprise" }
    });
    expect(audit.entries[1]).toMatchObject({
      metadata: { deviceId: "device-1234567890", hostname: "DESKTOP", os: "Windows" }
    });
    expect(audit.entries[3]).toMatchObject({
      metadata: { previousDeviceId: "device-1234567890" }
    });
  });

  it("does not renew or reset revoked licenses", async () => {
    const { service } = serviceWithActiveLicense({ status: "revoked", deviceId: "device-1234567890" });

    await expect(service.renew("VDRP-A1B2-C3D4-E5F6-G7H8", 15)).rejects.toMatchObject({ code: "LIC_004", statusCode: 403 });
    await expect(service.resetDevice("VDRP-A1B2-C3D4-E5F6-G7H8")).rejects.toMatchObject({ code: "LIC_004", statusCode: 403 });
    await expect(service.status("VDRP-A1B2-C3D4-E5F6-G7H8")).resolves.toMatchObject({ status: "revoked" });
  });

  it("sends expiry reminders at 30, 14, 7, and 1 days only once", async () => {
    const now = new Date("2026-06-01T10:00:00.000Z");
    const repository = new MemoryLicenseRepository([
      licenseRecord({ id: "lic_30", key: "VDRP-REM1-AAAA-BBBB-0001", expiresAt: addDays(now, 30) }),
      licenseRecord({ id: "lic_14", key: "VDRP-REM2-AAAA-BBBB-0002", expiresAt: addDays(now, 14) }),
      licenseRecord({ id: "lic_7", key: "VDRP-REM3-AAAA-BBBB-0003", expiresAt: addDays(now, 7) }),
      licenseRecord({ id: "lic_1", key: "VDRP-REM4-AAAA-BBBB-0004", expiresAt: addDays(now, 1) }),
      licenseRecord({ id: "lic_2", key: "VDRP-SKIP-AAAA-BBBB-0005", expiresAt: addDays(now, 2) }),
      licenseRecord({ id: "lic_no_email", key: "VDRP-SKIP-AAAA-BBBB-0006", expiresAt: addDays(now, 7), user: null }),
      licenseRecord({ id: "lic_revoked", key: "VDRP-SKIP-AAAA-BBBB-0007", status: "revoked", expiresAt: addDays(now, 7) })
    ]);
    const audit = new MemoryAuditRepository();
    const email = new FakeEmailService();
    const service = new LicenseService(repository, audit, undefined, email);

    const first = await service.sendExpiryReminders(now);
    const second = await service.sendExpiryReminders(now);

    expect(first).toMatchObject({ checked: 7, sent: 4, skipped: 3, skippedUnconfigured: 0 });
    expect(first.reminders.map((reminder) => reminder.daysRemaining).sort((a, b) => a - b)).toEqual([1, 7, 14, 30]);
    expect(email.sent).toHaveLength(4);
    const reminderAudits = audit.entries.filter((entry) => entry.action === "license.expiry_reminder_sent");
    expect(reminderAudits).toHaveLength(4);
    expect(reminderAudits[0]?.metadata).toEqual(expect.objectContaining({ thresholdDays: 30 }));
    expect(second).toMatchObject({ checked: 7, sent: 0, skipped: 7, skippedUnconfigured: 0 });
    expect(email.sent).toHaveLength(4);
  });

  it("does not mark expiry reminders sent when email is not configured", async () => {
    const now = new Date("2026-06-01T10:00:00.000Z");
    const repository = new MemoryLicenseRepository([
      licenseRecord({ id: "lic_30", key: "VDRP-REM5-AAAA-BBBB-0005", expiresAt: addDays(now, 30) })
    ]);
    const audit = new MemoryAuditRepository();
    const email = new FakeEmailService(false);
    const service = new LicenseService(repository, audit, undefined, email);

    const summary = await service.sendExpiryReminders(now);

    expect(summary).toMatchObject({ checked: 1, sent: 0, skipped: 0, skippedUnconfigured: 1 });
    expect(email.sent).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });
});
