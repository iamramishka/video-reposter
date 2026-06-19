import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createAuditLogRouter } from "./routes/auditLogs.js";
import { createAnalyticsRouter } from "./routes/analytics.js";
import { createAuthRouter } from "./routes/auth.js";
import { createLicenseRouter } from "./routes/licenses.js";
import { createPackageRouter } from "./routes/packages.js";
import { createPaymentRouter } from "./routes/payments.js";
import { createProcessingTelemetryRouter } from "./routes/processingTelemetry.js";
import { createReportRouter } from "./routes/reports.js";
import { createUserRouter } from "./routes/users.js";
import { createWebhookRouter } from "./routes/webhooks.js";
import { LicenseService } from "./services/licenseService.js";
import { PackageService } from "./services/packageService.js";
import { EmailService } from "./services/emailService.js";
import { StripeService } from "./services/stripeService.js";
import { PrismaAuditRepository } from "./repositories/prismaAuditRepository.js";
import { PrismaLicenseRepository } from "./repositories/prismaLicenseRepository.js";
import { PrismaAuthRepository } from "./repositories/prismaAuthRepository.js";
import { PrismaPackageRepository } from "./repositories/prismaPackageRepository.js";
import { PrismaProcessingTelemetryRepository } from "./repositories/prismaProcessingTelemetryRepository.js";
import { PrismaUserRepository } from "./repositories/prismaUserRepository.js";
import { SupabaseAuditRepository } from "./repositories/supabaseAuditRepository.js";
import { SupabaseAuthRepository } from "./repositories/supabaseAuthRepository.js";
import { SupabaseLicenseRepository } from "./repositories/supabaseLicenseRepository.js";
import { SupabasePackageRepository } from "./repositories/supabasePackageRepository.js";
import { SupabaseProcessingTelemetryRepository } from "./repositories/supabaseProcessingTelemetryRepository.js";
import { SupabaseUserRepository } from "./repositories/supabaseUserRepository.js";
import { SupabaseRestClient } from "./repositories/supabaseRestClient.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { UserService } from "./services/userService.js";
import { ProcessingTelemetryService } from "./services/processingTelemetryService.js";
import type { AuditRepository, AuthRepository, PackageRepository, ProcessingTelemetryRepository, UserRepository } from "./types.js";

export function createApp(options?: {
  licenseService?: LicenseService;
  packageService?: PackageService;
  stripeService?: StripeService;
  auditRepository?: AuditRepository;
  authRepository?: AuthRepository;
  packageRepository?: PackageRepository;
  userRepository?: UserRepository;
  userService?: UserService;
  processingTelemetryRepository?: ProcessingTelemetryRepository;
  processingTelemetryService?: ProcessingTelemetryService;
  requireAdminAuth?: boolean;
}) {
  const app = express();
  const repositories = createRepositories();
  const auditRepository = options?.auditRepository ?? repositories.auditRepository;
  const packageRepository = options?.packageRepository ?? repositories.packageRepository;
  const packageService = options?.packageService ?? new PackageService(packageRepository, auditRepository);
  const userRepository = options?.userRepository ?? repositories.userRepository;
  const processingTelemetryRepository = options?.processingTelemetryRepository ?? repositories.processingTelemetryRepository;
  const emailService = new EmailService();
  const stripeService = options?.stripeService ?? new StripeService();
  const licenseService = options?.licenseService ?? new LicenseService(repositories.licenseRepository, auditRepository, packageRepository, emailService);
  const userService = options?.userService ?? new UserService(userRepository, repositories.licenseRepository, auditRepository);
  const processingTelemetryService = options?.processingTelemetryService ?? new ProcessingTelemetryService(processingTelemetryRepository);

  app.set("trust proxy", 1);
  app.use(enforceHttps);
  app.use(helmet());
  app.use(cors({ origin: resolveCorsOrigin(), credentials: false }));

  // Stripe webhook must receive the raw body before express.json() parses it
  app.use("/webhooks", createWebhookRouter(licenseService, stripeService));
  app.use("/api/webhooks", createWebhookRouter(licenseService, stripeService));

  app.use(express.json({ limit: "1mb" }));
  app.use("/api/auth", rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: true, legacyHeaders: false }));
  app.use("/api/license", rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "video-reposter-api" });
  });
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "video-reposter-api" });
  });
  app.get("/api/health/detailed", async (_req, res, next) => {
    try {
      let database: { status: string; latencyMs?: number } = { status: "not_checked" };
      if (!config.supabaseUrl) {
        const t0 = Date.now();
        try {
          await prisma.$queryRaw`SELECT 1`;
          database = { status: "connected", latencyMs: Date.now() - t0 };
        } catch {
          database = { status: "disconnected" };
        }
      }
      res.json({
        ok: database.status !== "disconnected",
        service: "video-reposter-api",
        uptime: Math.round(process.uptime()),
        database,
        email: { configured: Boolean(process.env.SMTP_HOST) }
      });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/auth", createAuthRouter(options?.authRepository ?? repositories.authRepository, auditRepository));
  app.use("/api", createLicenseRouter(licenseService, { requireAdminAuth: options?.requireAdminAuth ?? true }));
  app.use("/api", createUserRouter(userService, { requireAdminAuth: options?.requireAdminAuth ?? true }));
  app.use("/api", createAnalyticsRouter(licenseService, { requireAdminAuth: options?.requireAdminAuth ?? true }));
  app.use("/api", createPackageRouter(packageService, { requireAdminAuth: options?.requireAdminAuth ?? true }));
  app.use("/api", createAuditLogRouter(auditRepository, { requireAdminAuth: options?.requireAdminAuth ?? true }));
  app.use("/api", createPaymentRouter(licenseService, stripeService, { requireAdminAuth: options?.requireAdminAuth ?? true }));
  app.use("/api", createProcessingTelemetryRouter(processingTelemetryService, licenseService, { requireAdminAuth: options?.requireAdminAuth ?? true }));
  app.use("/api", createReportRouter(licenseService, userService, { requireAdminAuth: options?.requireAdminAuth ?? true }));

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
      packageRepository: new SupabasePackageRepository(client),
      processingTelemetryRepository: new SupabaseProcessingTelemetryRepository(client),
      userRepository: new SupabaseUserRepository(client)
    };
  }

  return {
    auditRepository: new PrismaAuditRepository(prisma),
    authRepository: new PrismaAuthRepository(prisma),
    licenseRepository: new PrismaLicenseRepository(prisma),
    packageRepository: new PrismaPackageRepository(prisma),
    processingTelemetryRepository: new PrismaProcessingTelemetryRepository(prisma),
    userRepository: new PrismaUserRepository(prisma)
  };
}

function enforceHttps(req: express.Request, res: express.Response, next: express.NextFunction) {
  const productionLike = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  if (!productionLike || process.env.ENFORCE_HTTPS === "false") return next();
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (req.secure || forwardedProto === "https") return next();
  const host = req.get("host");
  if (!host) return res.status(400).json({ code: "HTTPS_REQUIRED", message: "HTTPS is required" });
  return res.redirect(308, `https://${host}${req.originalUrl}`);
}

function resolveCorsOrigin() {
  if (config.corsOrigin === "*") return "*";
  return config.corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean);
}
