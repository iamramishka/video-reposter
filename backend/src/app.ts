import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createAuditLogRouter } from "./routes/auditLogs.js";
import { createAnalyticsRouter } from "./routes/analytics.js";
import { createAuthRouter } from "./routes/auth.js";
import { createLicenseRouter } from "./routes/licenses.js";
import { createPackageRouter } from "./routes/packages.js";
import { createUserRouter } from "./routes/users.js";
import { LicenseService } from "./services/licenseService.js";
import { PackageService } from "./services/packageService.js";
import { EmailService } from "./services/emailService.js";
import { PrismaAuditRepository } from "./repositories/prismaAuditRepository.js";
import { PrismaLicenseRepository } from "./repositories/prismaLicenseRepository.js";
import { PrismaAuthRepository } from "./repositories/prismaAuthRepository.js";
import { PrismaPackageRepository } from "./repositories/prismaPackageRepository.js";
import { SupabaseAuditRepository } from "./repositories/supabaseAuditRepository.js";
import { SupabaseAuthRepository } from "./repositories/supabaseAuthRepository.js";
import { SupabaseLicenseRepository } from "./repositories/supabaseLicenseRepository.js";
import { SupabasePackageRepository } from "./repositories/supabasePackageRepository.js";
import { SupabaseRestClient } from "./repositories/supabaseRestClient.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import type { AuditRepository, AuthRepository, PackageRepository } from "./types.js";

export function createApp(options?: {
  licenseService?: LicenseService;
  packageService?: PackageService;
  auditRepository?: AuditRepository;
  authRepository?: AuthRepository;
  packageRepository?: PackageRepository;
  requireAdminAuth?: boolean;
}) {
  const app = express();
  const repositories = createRepositories();
  const auditRepository = options?.auditRepository ?? repositories.auditRepository;
  const packageRepository = options?.packageRepository ?? repositories.packageRepository;
  const packageService = options?.packageService ?? new PackageService(packageRepository, auditRepository);
  const emailService = new EmailService();
  const licenseService = options?.licenseService ?? new LicenseService(repositories.licenseRepository, auditRepository, packageRepository, emailService);

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: resolveCorsOrigin(), credentials: false }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/auth", rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: true, legacyHeaders: false }));
  app.use("/api/license", rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "video-reposter-api" });
  });
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "video-reposter-api" });
  });

  app.use("/api/auth", createAuthRouter(options?.authRepository ?? repositories.authRepository, auditRepository));
  app.use("/api", createLicenseRouter(licenseService, { requireAdminAuth: options?.requireAdminAuth ?? true }));
  app.use("/api", createUserRouter(licenseService, { requireAdminAuth: options?.requireAdminAuth ?? true }));
  app.use("/api", createAnalyticsRouter(licenseService, { requireAdminAuth: options?.requireAdminAuth ?? true }));
  app.use("/api", createPackageRouter(packageService, { requireAdminAuth: options?.requireAdminAuth ?? true }));
  app.use("/api", createAuditLogRouter(auditRepository, { requireAdminAuth: options?.requireAdminAuth ?? true }));

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).json({ code: "API_500", message: "Unexpected server error" });
  });

  return app;
}

function createRepositories() {
  if (config.supabaseUrl && config.supabaseServiceRoleKey) {
    const client = new SupabaseRestClient(config.supabaseUrl, config.supabaseServiceRoleKey);
    return {
      auditRepository: new SupabaseAuditRepository(client),
      authRepository: new SupabaseAuthRepository(client),
      licenseRepository: new SupabaseLicenseRepository(client),
      packageRepository: new SupabasePackageRepository(client)
    };
  }

  return {
    auditRepository: new PrismaAuditRepository(prisma),
    authRepository: new PrismaAuthRepository(prisma),
    licenseRepository: new PrismaLicenseRepository(prisma),
    packageRepository: new PrismaPackageRepository(prisma)
  };
}

function resolveCorsOrigin() {
  if (config.corsOrigin === "*") return "*";
  return config.corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean);
}
