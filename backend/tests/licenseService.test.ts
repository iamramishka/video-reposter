import { describe, expect, it } from "vitest";
import { LicenseError, LicenseService } from "../src/services/licenseService.js";
import { addDays } from "../src/utils/dates.js";
import { isLicenseKey } from "../src/utils/licenseKey.js";
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

describe("license service", () => {
  it("validates license key format", () => {
    expect(isLicenseKey("VDRP-A1B2-C3D4-E5F6-G7H8")).toBe(true);
    expect(isLicenseKey("VDRP-12-3456-7890-ABCD")).toBe(false);
  });

  it("activates and binds a pending license", async () => {
    const { service } = serviceWithActiveLicense();
    const result = await service.activate({
      key: "VDRP-A1B2-C3D4-E5F6-G7H8",
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
});
