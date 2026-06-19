import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { LicenseService } from "../src/services/licenseService.js";
import { PackageService } from "../src/services/packageService.js";
import { addDays } from "../src/utils/dates.js";
import { MemoryAuditRepository } from "./memoryAuditRepository.js";
import { MemoryAuthRepository } from "./memoryAuthRepository.js";
import { MemoryLicenseRepository } from "./memoryLicenseRepository.js";
import { MemoryPackageRepository } from "./memoryPackageRepository.js";

describe("license API", () => {
  it("creates and activates a license", async () => {
    const packageRepository = new MemoryPackageRepository();
    const service = new LicenseService(new MemoryLicenseRepository(), undefined, packageRepository);
    const app = createApp({ licenseService: service, packageRepository, requireAdminAuth: false });

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
    expect(activated.body.package_limits).toEqual({ video_limit: 50, template_limit: 5, worker_limit: 2 });
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

  it("auto-generates keys and allows admins to edit plan and expiry", async () => {
    const service = new LicenseService(new MemoryLicenseRepository());
    const app = createApp({ licenseService: service });
    const token = jwt.sign({ sub: "admin-1", email: "admin@videoreposter.local", role: "admin" }, config.jwtSecret);

    const created = await request(app)
      .post("/api/licenses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        plan: "starter",
        expiresAt: addDays(new Date(), 30).toISOString(),
        user: { name: "Auto Key", email: "auto@example.com", company: "Auto Studio" }
      })
      .expect(201);

    expect(created.body.license.license_key).toMatch(/^VDRP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const edited = await request(app)
      .patch("/api/license")
      .set("Authorization", `Bearer ${token}`)
      .send({
        key: created.body.license.license_key,
        plan: "enterprise",
        expiresAt: addDays(new Date(), 90).toISOString(),
        user: { name: "Auto Key", email: "auto@example.com", company: "Enterprise Studio" }
      })
      .expect(200);

    expect(edited.body.license).toEqual(expect.objectContaining({
      plan: "enterprise",
      user: expect.objectContaining({ company: "Enterprise Studio" })
    }));
  });

  it("bulk-generates licenses for admin operations", async () => {
    const service = new LicenseService(new MemoryLicenseRepository());
    const app = createApp({ licenseService: service });
    const token = jwt.sign({ sub: "admin-1", email: "admin@videoreposter.local", role: "admin" }, config.jwtSecret);

    const response = await request(app)
      .post("/api/licenses/bulk")
      .set("Authorization", `Bearer ${token}`)
      .send({ count: 10, plan: "starter", expiresAt: addDays(new Date(), 30).toISOString() })
      .expect(201);

    expect(response.body.licenses).toHaveLength(10);
    expect(response.body.licenses[0]).toEqual(expect.objectContaining({ plan: "starter", status: "pending" }));
  });

  it("allows read-only admins to view records but blocks writes", async () => {
    const service = new LicenseService(new MemoryLicenseRepository());
    const app = createApp({ licenseService: service });
    const token = jwt.sign({ sub: "admin-1", email: "readonly@videoreposter.local", role: "read_only" }, config.jwtSecret);

    await request(app).get("/api/licenses").set("Authorization", `Bearer ${token}`).expect(200);
    await request(app)
      .post("/api/licenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ expiresAt: addDays(new Date(), 30).toISOString() })
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe("AUTH_READ_ONLY");
      });
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

  it("returns customer summaries and analytics", async () => {
    const service = new LicenseService(new MemoryLicenseRepository());
    const app = createApp({ licenseService: service });
    const token = jwt.sign({ sub: "admin-1", email: "admin@videoreposter.local", role: "admin" }, config.jwtSecret);

    await service.createLicense({
      key: "VDRP-USER-AAAA-BBBB-0001",
      plan: "pro",
      expiresAt: addDays(new Date(), 20).toISOString(),
      user: { name: "Customer One", email: "customer@example.com", company: "One Co" }
    });
    await service.activate({ key: "VDRP-USER-AAAA-BBBB-0001", device_id: "device-customer-0001" });
    await service.createLicense({
      key: "VDRP-USER-AAAA-BBBB-0002",
      plan: "starter",
      expiresAt: addDays(new Date(), -1).toISOString(),
      user: { name: "Customer One", email: "customer@example.com", company: "One Co" }
    });

    const users = await request(app).get("/api/users").set("Authorization", `Bearer ${token}`).expect(200);
    expect(users.body.users).toEqual([
      expect.objectContaining({
        email: "customer@example.com",
        license_count: 2,
        active_count: 1,
        expired_count: 1
      })
    ]);

    const analytics = await request(app).get("/api/analytics").set("Authorization", `Bearer ${token}`).expect(200);
    expect(analytics.body.analytics).toEqual(expect.objectContaining({
      total: 2,
      active: 1,
      expired: 1,
      activations: 1,
      expiring_soon: 1,
      plans: expect.objectContaining({ starter: 1, pro: 1 })
    }));
    expect(analytics.body.analytics.daily_activations).toHaveLength(30);
    expect(analytics.body.analytics.daily_activations[0]).toEqual(
      expect.objectContaining({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), count: expect.any(Number) })
    );
  });

  it("revokes a license through the admin HTTP route", async () => {
    const service = new LicenseService(new MemoryLicenseRepository());
    const app = createApp({ licenseService: service });
    const token = jwt.sign({ sub: "admin-1", email: "admin@videoreposter.local", role: "admin" }, config.jwtSecret);

    await service.createLicense({ key: "VDRP-REVO-HTTP-TEST-0001", expiresAt: addDays(new Date(), 30).toISOString() });
    await service.activate({ key: "VDRP-REVO-HTTP-TEST-0001", device_id: "device-revoke-0001" });

    const revoked = await request(app)
      .post("/api/license/revoke")
      .set("Authorization", `Bearer ${token}`)
      .send({ key: "VDRP-REVO-HTTP-TEST-0001" })
      .expect(200);

    expect(revoked.body.license).toEqual(expect.objectContaining({ status: "revoked" }));

    await request(app)
      .post("/api/license/activate")
      .send({ key: "VDRP-REVO-HTTP-TEST-0001", device_id: "device-revoke-0002" })
      .expect(403)
      .expect(({ body }) => { expect(body.code).toBe("LIC_004"); });
  });

  it("returns a PDF from the analytics export endpoint", async () => {
    const service = new LicenseService(new MemoryLicenseRepository());
    const app = createApp({ licenseService: service });
    const token = jwt.sign({ sub: "admin-1", email: "admin@videoreposter.local", role: "admin" }, config.jwtSecret);

    const response = await request(app)
      .get("/api/analytics/export/pdf")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.headers["content-type"]).toMatch(/application\/pdf/);
    expect(response.headers["content-disposition"]).toMatch(/attachment.*\.pdf/);
    expect(response.body).toBeDefined();
  });

  it("returns and updates package limits with audit logs", async () => {
    const auditRepository = new MemoryAuditRepository();
    const packageRepository = new MemoryPackageRepository();
    const packageService = new PackageService(packageRepository, auditRepository);
    const licenseService = new LicenseService(new MemoryLicenseRepository(), auditRepository, packageRepository);
    const app = createApp({ licenseService, packageRepository, packageService, auditRepository });
    const token = jwt.sign({ sub: "admin-1", email: "admin@videoreposter.local", role: "admin" }, config.jwtSecret);

    const defaults = await request(app).get("/api/packages").set("Authorization", `Bearer ${token}`).expect(200);
    expect(defaults.body.packages).toEqual(expect.arrayContaining([
      expect.objectContaining({ plan: "starter", video_limit: 5, template_limit: 2, worker_limit: 1 }),
      expect.objectContaining({ plan: "pro", video_limit: 50, template_limit: 5, worker_limit: 2 })
    ]));

    await request(app)
      .patch("/api/packages/starter")
      .set("Authorization", `Bearer ${token}`)
      .send({ videoLimit: 7, templateLimit: 3, workerLimit: 2 })
      .expect(200)
      .expect(({ body }) => {
        expect(body.package).toEqual(expect.objectContaining({
          plan: "starter",
          video_limit: 7,
          template_limit: 3,
          worker_limit: 2
        }));
      });

    await licenseService.createLicense({ key: "VDRP-PACK-LIMI-TS00-0001", plan: "starter", expiresAt: addDays(new Date(), 30).toISOString() });
    const activated = await request(app)
      .post("/api/license/activate")
      .send({ key: "VDRP-PACK-LIMI-TS00-0001", device_id: "device-package-0001" })
      .expect(200);

    expect(activated.body.package_limits).toEqual({ video_limit: 7, template_limit: 3, worker_limit: 2 });
    expect(auditRepository.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "package.updated",
        subjectType: "admin",
        subjectId: "starter"
      })
    ]));
  });

  it("changes admin passwords after verifying the current password", async () => {
    const passwordHash = await bcrypt.hash("old-password-123", 12);
    const authRepository = new MemoryAuthRepository({
      id: "admin-1",
      email: "admin@videoreposter.local",
      passwordHash,
      role: "super_admin"
    });
    const app = createApp({
      licenseService: new LicenseService(new MemoryLicenseRepository()),
      authRepository,
      auditRepository: new MemoryAuditRepository()
    });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@videoreposter.local", password: "old-password-123" })
      .expect(200);

    await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ currentPassword: "wrong-password", newPassword: "new-password-123", confirmPassword: "new-password-123" })
      .expect(401);

    await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ currentPassword: "old-password-123", newPassword: "new-password-123", confirmPassword: "new-password-123" })
      .expect(200);

    await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@videoreposter.local", password: "old-password-123" })
      .expect(401);

    await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@videoreposter.local", password: "new-password-123" })
      .expect(200);
  }, 15_000);

  it("reassigns a license to a new device after device reset", async () => {
    const service = new LicenseService(new MemoryLicenseRepository());
    const app = createApp({ licenseService: service });
    const token = jwt.sign({ sub: "admin-1", email: "admin@videoreposter.local", role: "admin" }, config.jwtSecret);

    await service.createLicense({ key: "VDRP-REAS-SIGN-DEVI-0001", expiresAt: addDays(new Date(), 30).toISOString() });
    await request(app).post("/api/license/activate").send({ key: "VDRP-REAS-SIGN-DEVI-0001", device_id: "device-original-0001" }).expect(200);
    await request(app).post("/api/license/validate").send({ key: "VDRP-REAS-SIGN-DEVI-0001", device_id: "device-second-00002" }).expect(409);

    await request(app)
      .post("/api/license/reset-device")
      .set("Authorization", `Bearer ${token}`)
      .send({ key: "VDRP-REAS-SIGN-DEVI-0001" })
      .expect(200);

    await request(app).post("/api/license/activate").send({ key: "VDRP-REAS-SIGN-DEVI-0001", device_id: "device-second-00002" }).expect(200);
    await service.revoke("VDRP-REAS-SIGN-DEVI-0001");
    await request(app).post("/api/license/activate").send({ key: "VDRP-REAS-SIGN-DEVI-0001", device_id: "device-second-00002" }).expect(403);
  });
});
