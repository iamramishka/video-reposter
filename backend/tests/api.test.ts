import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import type { LicenseEmailService } from "../src/services/emailService.js";
import { LicenseService } from "../src/services/licenseService.js";
import { UserService } from "../src/services/userService.js";
import type { LicenseRecord, UserRecord } from "../src/types.js";
import { PackageService } from "../src/services/packageService.js";
import { ProcessingTelemetryService } from "../src/services/processingTelemetryService.js";
import { addDays } from "../src/utils/dates.js";
import { MemoryAuditRepository } from "./memoryAuditRepository.js";
import { MemoryAuthRepository } from "./memoryAuthRepository.js";
import { MemoryLicenseRepository } from "./memoryLicenseRepository.js";
import { MemoryPackageRepository } from "./memoryPackageRepository.js";
import { MemoryProcessingTelemetryRepository } from "./memoryProcessingTelemetryRepository.js";
import { MemoryUserRepository } from "./memoryUserRepository.js";

class FakeEmailService implements LicenseEmailService {
  sentExpiryReminders: { key: string; daysRemaining: number }[] = [];

  isConfigured() { return true; }
  sendLicenseCreated() {}
  sendLicenseActivated() {}
  sendLicenseRevoked() {}
  sendLicenseRenewed() {}
  sendLicenseExpiryReminder(record: LicenseRecord, daysRemaining: number) {
    this.sentExpiryReminders.push({ key: record.key, daysRemaining });
  }
}

describe("license API", () => {
  it("redirects insecure production requests to HTTPS", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const app = createApp({ licenseService: new LicenseService(new MemoryLicenseRepository()) });
      await request(app)
        .get("/api/health")
        .set("host", "api.example.com")
        .set("x-forwarded-proto", "http")
        .expect(308)
        .expect("location", "https://api.example.com/api/health");

      await request(app)
        .get("/api/health")
        .set("host", "api.example.com")
        .set("x-forwarded-proto", "https")
        .expect(200);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

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

  it("runs expiry reminders through a writable admin route", async () => {
    const repository = new MemoryLicenseRepository();
    const auditRepository = new MemoryAuditRepository();
    const emailService = new FakeEmailService();
    const service = new LicenseService(repository, auditRepository, undefined, emailService);
    const app = createApp({ licenseService: service, auditRepository });
    const token = jwt.sign({ sub: "admin-1", email: "admin@videoreposter.local", role: "admin" }, config.jwtSecret);

    await service.createLicense({
      key: "VDRP-ROUT-EREM-IND0-0001",
      expiresAt: addDays(new Date(), 30).toISOString(),
      user: { name: "Route Reminder", email: "route-reminder@example.com" }
    });

    const response = await request(app)
      .post("/api/licenses/expiry-reminders/run")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.reminders).toEqual(expect.objectContaining({ sent: 1 }));
    expect(emailService.sentExpiryReminders).toEqual([{ key: "VDRP-ROUT-EREM-IND0-0001", daysRemaining: 30 }]);
    expect(auditRepository.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "license.expiry_reminder_sent" })
    ]));
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

  it("returns a dedicated login audit feed", async () => {
    const passwordHash = await bcrypt.hash("login-password-123", 12);
    const authRepository = new MemoryAuthRepository({
      id: "admin-login-1",
      email: "login-audit@videoreposter.local",
      passwordHash,
      role: "admin"
    });
    const auditRepository = new MemoryAuditRepository();
    const app = createApp({
      licenseService: new LicenseService(new MemoryLicenseRepository()),
      authRepository,
      auditRepository
    });

    await request(app)
      .post("/api/auth/login")
      .send({ email: "login-audit@videoreposter.local", password: "wrong-password" })
      .expect(401);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "login-audit@videoreposter.local", password: "login-password-123" })
      .expect(200);

    const response = await request(app)
      .get("/api/audit-logs/logins?limit=10")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);

    expect(response.body.audit_logs).toEqual([
      expect.objectContaining({
        action: "admin.login",
        admin_user_email: "login-audit@videoreposter.local",
        metadata: expect.objectContaining({ role: "admin" })
      }),
      expect.objectContaining({
        action: "admin.login_failed",
        metadata: expect.objectContaining({ email: "login-audit@videoreposter.local", reason: "invalid_credentials" })
      })
    ]);
  }, 15_000);

  it("returns customer summaries and analytics", async () => {
    const licenseRepository = new MemoryLicenseRepository();
    const userRepository = new MemoryUserRepository([
      userRecord({ id: "customer-1", name: "Customer One", email: "customer@example.com", company: "One Co" })
    ]);
    const service = new LicenseService(licenseRepository);
    const userService = new UserService(userRepository, licenseRepository);
    const app = createApp({ licenseService: service, userService });
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

  it("creates, edits, disables, and soft-deletes users with retention", async () => {
    const licenseRepository = new MemoryLicenseRepository();
    const userRepository = new MemoryUserRepository();
    const auditRepository = new MemoryAuditRepository();
    const userService = new UserService(userRepository, licenseRepository, auditRepository);
    const app = createApp({
      licenseService: new LicenseService(licenseRepository),
      userService,
      auditRepository
    });
    const token = jwt.sign({ sub: "admin-1", email: "admin@videoreposter.local", role: "admin" }, config.jwtSecret);

    const created = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Crud User", email: "crud@example.com", company: "Crud Co" })
      .expect(201);

    const userId = created.body.user.id;
    expect(created.body.user).toEqual(expect.objectContaining({
      name: "Crud User",
      email: "crud@example.com",
      disabled_at: null,
      deleted_at: null
    }));

    await request(app)
      .patch(`/api/users/${userId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Crud Edited", company: "Edited Co" })
      .expect(200)
      .expect(({ body }) => {
        expect(body.user).toEqual(expect.objectContaining({ name: "Crud Edited", company: "Edited Co" }));
      });

    await request(app)
      .patch(`/api/users/${userId}/disabled`)
      .set("Authorization", `Bearer ${token}`)
      .send({ disabled: true })
      .expect(200)
      .expect(({ body }) => {
        expect(body.user.disabled_at).toEqual(expect.any(String));
      });

    await request(app)
      .delete(`/api/users/${userId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ retentionDays: 45 })
      .expect(200)
      .expect(({ body }) => {
        expect(body.user.deleted_at).toEqual(expect.any(String));
        expect(body.user.retention_until).toEqual(expect.any(String));
      });

    const list = await request(app).get("/api/users").set("Authorization", `Bearer ${token}`).expect(200);
    expect(list.body.users).toEqual([]);
    expect(auditRepository.entries.map((entry) => entry.action)).toEqual(expect.arrayContaining([
      "user.created",
      "user.updated",
      "user.disabled",
      "user.soft_deleted"
    ]));
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

  it("soft-deletes licenses with a retention window", async () => {
    const repository = new MemoryLicenseRepository();
    const auditRepository = new MemoryAuditRepository();
    const service = new LicenseService(repository, auditRepository);
    const app = createApp({ licenseService: service, auditRepository });
    const token = jwt.sign({ sub: "admin-1", email: "admin@videoreposter.local", role: "admin" }, config.jwtSecret);

    await service.createLicense({ key: "VDRP-SOFT-DELE-TE00-0001", expiresAt: addDays(new Date(), 30).toISOString() });

    await request(app)
      .delete("/api/license/VDRP-SOFT-DELE-TE00-0001")
      .set("Authorization", `Bearer ${token}`)
      .send({ retentionDays: 30 })
      .expect(200)
      .expect(({ body }) => {
        expect(body.license.status).toBe("revoked");
      });

    await request(app)
      .get("/api/license/status/VDRP-SOFT-DELE-TE00-0001")
      .expect(404);
    expect(auditRepository.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "license.soft_deleted", metadata: expect.objectContaining({ retentionDays: 30 }) })
    ]));
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

  it("returns server-side CSV reports for licenses and users", async () => {
    const licenseRepository = new MemoryLicenseRepository();
    const userRepository = new MemoryUserRepository([
      userRecord({ id: "report-user-1", name: "Report User", email: "report@example.com", company: "Reports Co" })
    ]);
    const licenseService = new LicenseService(licenseRepository);
    const userService = new UserService(userRepository, licenseRepository);
    const app = createApp({ licenseService, userService });
    const token = jwt.sign({ sub: "admin-1", email: "admin@videoreposter.local", role: "admin" }, config.jwtSecret);

    await licenseService.createLicense({
      key: "VDRP-REPO-RT00-CSV0-0001",
      expiresAt: addDays(new Date(), 30).toISOString(),
      user: { name: "Report User", email: "report@example.com", company: "Reports Co" }
    });

    await request(app)
      .get("/api/reports/licenses.csv")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ headers, text }) => {
        expect(headers["content-type"]).toMatch(/text\/csv/);
        expect(headers["content-disposition"]).toMatch(/licenses.*\.csv/);
        expect(text).toContain("license_key");
        expect(text).toContain("VDRP-REPO-RT00-CSV0-0001");
      });

    await request(app)
      .get("/api/reports/users.csv")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ text }) => {
        expect(text).toContain("report@example.com");
        expect(text).toContain("license_count");
      });
  });

  it("records processing telemetry and returns processing analytics", async () => {
    const licenseRepository = new MemoryLicenseRepository();
    const licenseService = new LicenseService(licenseRepository);
    const telemetryRepository = new MemoryProcessingTelemetryRepository();
    const app = createApp({
      licenseService,
      processingTelemetryService: new ProcessingTelemetryService(telemetryRepository)
    });
    const token = jwt.sign({ sub: "admin-1", email: "admin@videoreposter.local", role: "admin" }, config.jwtSecret);
    const licenseKey = "VDRP-TELM-ETRY-0000-0001";

    await licenseService.createLicense({ key: licenseKey, expiresAt: addDays(new Date(), 30).toISOString() });
    await licenseService.activate({ key: licenseKey, device_id: "device-telemetry-0001" });

    await request(app)
      .post("/api/telemetry/processing")
      .send({ jobId: "job-missing-auth", status: "complete", preset: "instagram_reel", elapsedMs: 1_000 })
      .expect(401);

    await request(app)
      .post("/api/telemetry/processing")
      .set("Authorization", `Bearer ${licenseKey}`)
      .send({
        jobId: "job-1",
        status: "complete",
        preset: "instagram_reel",
        elapsedMs: 10_000,
        throughputMbPerMin: 42,
        inputSizeBytes: 60_000_000
      })
      .expect(202)
      .expect(({ body }) => {
        expect(body).toEqual({ recorded: true });
      });

    await request(app)
      .post("/api/telemetry/processing")
      .set("Authorization", `Bearer ${licenseKey}`)
      .send({
        jobId: "job-2",
        status: "failed",
        preset: "youtube_short",
        elapsedMs: 4_000,
        errorCode: "FFMPEG_EXIT"
      })
      .expect(202);

    await request(app)
      .post("/api/telemetry/processing")
      .set("Authorization", `Bearer ${licenseKey}`)
      .send({ jobId: "job-3", status: "failed", preset: "youtube_short", elapsedMs: 4_000 })
      .expect(400);

    const response = await request(app)
      .get("/api/analytics/processing")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.processing).toEqual(expect.objectContaining({
      total: 2,
      complete: 1,
      failed: 1,
      average_elapsed_ms: 7000,
      average_throughput_mb_per_min: 42,
      presets: expect.objectContaining({ instagram_reel: 1, youtube_short: 1 }),
      top_error_codes: [{ error_code: "FFMPEG_EXIT", count: 1 }]
    }));
    expect(response.body.processing.recent).toHaveLength(2);
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

  it("returns and updates configurable admin session timeout", async () => {
    const passwordHash = await bcrypt.hash("admin-password-123", 12);
    const authRepository = new MemoryAuthRepository({
      id: "admin-session-1",
      email: "session@videoreposter.local",
      passwordHash,
      role: "admin"
    });
    const auditRepository = new MemoryAuditRepository();
    const app = createApp({
      licenseService: new LicenseService(new MemoryLicenseRepository()),
      authRepository,
      auditRepository
    });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "session@videoreposter.local", password: "admin-password-123" })
      .expect(200);

    expect(login.body.session).toEqual({ timeoutMinutes: 480 });
    expect(tokenLifetimeSeconds(login.body.token)).toBe(480 * 60);

    const settings = await request(app)
      .get("/api/auth/session-settings")
      .set("Authorization", `Bearer ${login.body.token}`)
      .expect(200);
    expect(settings.body.session).toEqual({ timeoutMinutes: 480 });

    const updated = await request(app)
      .patch("/api/auth/session-settings")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ timeoutMinutes: 30 })
      .expect(200);

    expect(updated.body.session).toEqual({ timeoutMinutes: 30 });
    expect(tokenLifetimeSeconds(updated.body.token)).toBe(30 * 60);
    expect(updated.body.expires_at).toEqual(expect.any(String));
    expect(auditRepository.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "admin.session_timeout_updated",
        metadata: { timeoutMinutes: 30 }
      })
    ]));

    const readOnlyToken = jwt.sign({ sub: "admin-session-1", email: "session@videoreposter.local", role: "read_only" }, config.jwtSecret);
    await request(app)
      .patch("/api/auth/session-settings")
      .set("Authorization", `Bearer ${readOnlyToken}`)
      .send({ timeoutMinutes: 60 })
      .expect(403);
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

function tokenLifetimeSeconds(token: string) {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded !== "object" || typeof decoded.iat !== "number" || typeof decoded.exp !== "number") {
    throw new Error("Token did not include iat and exp");
  }
  return decoded.exp - decoded.iat;
}

function userRecord(overrides: Partial<UserRecord>): UserRecord {
  const now = new Date();
  return {
    id: overrides.id ?? "user-1",
    name: overrides.name ?? "Customer",
    email: overrides.email ?? "customer@example.com",
    company: overrides.company ?? null,
    disabledAt: overrides.disabledAt ?? null,
    deletedAt: overrides.deletedAt ?? null,
    retentionUntil: overrides.retentionUntil ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now
  };
}
