import request from "supertest";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { LicenseService } from "../src/services/licenseService.js";
import { addDays } from "../src/utils/dates.js";
import { MemoryAuditRepository } from "./memoryAuditRepository.js";
import { MemoryLicenseRepository } from "./memoryLicenseRepository.js";

describe("license API", () => {
  it("creates and activates a license", async () => {
    const service = new LicenseService(new MemoryLicenseRepository());
    const app = createApp({ licenseService: service, requireAdminAuth: false });

    const created = await request(app)
      .post("/api/licenses")
      .send({ key: "VDRP-1234-5678-9ABC-DEF0", expiresAt: addDays(new Date(), 30).toISOString() })
      .expect(201);

    expect(created.body.license.key ?? created.body.license.license_key).toBeDefined();

    const activated = await request(app)
      .post("/api/license/activate")
      .send({ key: "VDRP-1234-5678-9ABC-DEF0", device_id: "device-1234567890" })
      .expect(200);

    expect(activated.body.valid).toBe(true);
    expect(activated.body.status).toBe("active");
  });

  it("returns conflict for device mismatch", async () => {
    const repository = new MemoryLicenseRepository();
    const service = new LicenseService(repository);
    const app = createApp({ licenseService: service, requireAdminAuth: false });

    await service.createLicense({ key: "VDRP-AAAA-BBBB-CCCC-DDDD", expiresAt: addDays(new Date(), 30).toISOString() });
    await service.activate({ key: "VDRP-AAAA-BBBB-CCCC-DDDD", device_id: "device-1111111111" });

    const response = await request(app)
      .post("/api/license/validate")
      .send({ key: "VDRP-AAAA-BBBB-CCCC-DDDD", device_id: "device-2222222222" })
      .expect(409);

    expect(response.body.code).toBe("LIC_003");
  });

  it("requires admin auth for license management routes", async () => {
    const service = new LicenseService(new MemoryLicenseRepository());
    const app = createApp({ licenseService: service });

    await request(app).get("/api/licenses").expect(401).expect(({ body }) => {
      expect(body.code).toBe("AUTH_REQUIRED");
    });

    await request(app)
      .post("/api/licenses")
      .set("Authorization", "Bearer not-a-real-token")
      .send({ expiresAt: addDays(new Date(), 30).toISOString() })
      .expect(401)
      .expect(({ body }) => {
        expect(body.code).toBe("AUTH_INVALID");
      });
  });

  it("allows admin actions with a valid token while keeping device validation public", async () => {
    const service = new LicenseService(new MemoryLicenseRepository());
    const app = createApp({ licenseService: service });
    const token = jwt.sign({ sub: "admin-1", email: "admin@videoreposter.local", role: "admin" }, config.jwtSecret);

    const created = await request(app)
      .post("/api/licenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ key: "VDRP-9999-AAAA-BBBB-CCCC", expiresAt: addDays(new Date(), 30).toISOString() })
      .expect(201);

    expect(created.body.license.license_key).toBe("VDRP-9999-AAAA-BBBB-CCCC");

    const activated = await request(app)
      .post("/api/license/activate")
      .send({ key: "VDRP-9999-AAAA-BBBB-CCCC", device_id: "device-public-1234" })
      .expect(200);

    expect(activated.body.valid).toBe(true);
  });

  it("reports expired licenses as expired in admin list responses", async () => {
    const service = new LicenseService(new MemoryLicenseRepository());
    const app = createApp({ licenseService: service });
    const token = jwt.sign({ sub: "admin-1", email: "admin@videoreposter.local", role: "admin" }, config.jwtSecret);

    await service.createLicense({ key: "VDRP-EXPI-RED0-DEAD-0001", expiresAt: addDays(new Date(), -1).toISOString() });

    const response = await request(app).get("/api/licenses").set("Authorization", `Bearer ${token}`).expect(200);

    expect(response.body.licenses).toEqual([expect.objectContaining({ license_key: "VDRP-EXPI-RED0-DEAD-0001", status: "expired" })]);
  });

  it("does not renew or reset revoked licenses through admin routes", async () => {
    const service = new LicenseService(new MemoryLicenseRepository());
    const app = createApp({ licenseService: service });
    const token = jwt.sign({ sub: "admin-1", email: "admin@videoreposter.local", role: "admin" }, config.jwtSecret);

    await service.createLicense({ key: "VDRP-REVO-KED0-DEAD-0001", expiresAt: addDays(new Date(), 30).toISOString() });
    await service.revoke("VDRP-REVO-KED0-DEAD-0001");

    await request(app)
      .post("/api/license/renew")
      .set("Authorization", `Bearer ${token}`)
      .send({ key: "VDRP-REVO-KED0-DEAD-0001", days: 30 })
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe("LIC_004");
      });

    await request(app)
      .post("/api/license/reset-device")
      .set("Authorization", `Bearer ${token}`)
      .send({ key: "VDRP-REVO-KED0-DEAD-0001" })
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe("LIC_004");
      });
  });

  it("returns recent audit logs to admins", async () => {
    const repository = new MemoryLicenseRepository();
    const auditRepository = new MemoryAuditRepository();
    const service = new LicenseService(repository, auditRepository);
    const app = createApp({ licenseService: service, auditRepository });
    const token = jwt.sign({ sub: "admin-1", email: "admin@videoreposter.local", role: "admin" }, config.jwtSecret);

    await request(app).get("/api/audit-logs").expect(401).expect(({ body }) => {
      expect(body.code).toBe("AUTH_REQUIRED");
    });

    await request(app)
      .post("/api/licenses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        key: "VDRP-AUD1-AAAA-BBBB-CCCC",
        plan: "enterprise",
        expiresAt: addDays(new Date(), 30).toISOString()
      })
      .expect(201);

    const response = await request(app).get("/api/audit-logs?limit=1").set("Authorization", `Bearer ${token}`).expect(200);

    expect(response.body.audit_logs).toEqual([
      expect.objectContaining({
        action: "license.created",
        subject_type: "license",
        subject_id: "VDRP-AUD1-AAAA-BBBB-CCCC",
        license_key: "VDRP-AUD1-AAAA-BBBB-CCCC",
        admin_user_id: "admin-1",
        admin_user_email: "admin@videoreposter.local",
        metadata: expect.objectContaining({ plan: "enterprise" })
      })
    ]);
  });
});
