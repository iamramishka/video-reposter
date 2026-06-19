import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";
import { getAdminActor, requireAdmin, requireWritableAdmin } from "../middleware/auth.js";
import type { AuditRepository, AuthRepository } from "../types.js";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10),
  confirmPassword: z.string().min(10)
}).refine((value) => value.newPassword === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "New passwords do not match"
});

const sessionSettingsSchema = z.object({
  timeoutMinutes: z.number().int().min(15).max(1440)
});

export function createAuthRouter(repository: AuthRepository, auditRepository?: AuditRepository) {
  const router = Router();

  router.post("/login", async (req, res, next) => {
    try {
      const body = loginSchema.parse(req.body);
      const admin = await repository.findAdminByEmail(body.email);
      if (!admin || !(await bcrypt.compare(body.password, admin.passwordHash))) {
        await auditRepository?.record({
          action: "admin.login_failed",
          subjectType: "admin",
          subjectId: admin?.id ?? null,
          adminUserId: admin?.id,
          adminEmail: admin?.email,
          metadata: { email: body.email, reason: "invalid_credentials" }
        });
        return res.status(401).json({ code: "AUTH_INVALID", message: "Invalid email or password" });
      }

      const sessionSettings = await resolveSessionSettings(auditRepository);
      const session = issueAdminToken({
        id: admin.id,
        email: admin.email,
        role: admin.role,
        timeoutMinutes: sessionSettings.timeoutMinutes
      });
      await auditRepository?.record({
        action: "admin.login",
        subjectType: "admin",
        subjectId: admin.id,
        adminUserId: admin.id,
        adminEmail: admin.email,
        metadata: { role: admin.role }
      });
      res.json({
        token: session.token,
        expires_at: session.expiresAt,
        session: sessionSettings,
        admin: { email: admin.email, role: admin.role }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ code: "API_VALIDATION", message: "Invalid request body", issues: error.issues });
      }
      next(error);
    }
  });

  router.get("/session-settings", requireAdmin, async (_req, res, next) => {
    try {
      res.json({ session: await resolveSessionSettings(auditRepository) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/session-settings", requireWritableAdmin, async (req, res, next) => {
    try {
      const actor = getAdminActor(req);
      if (!actor?.adminUserId || !actor.adminEmail || !actor.adminRole) {
        return res.status(401).json({ code: "AUTH_REQUIRED", message: "Admin token required" });
      }
      const body = sessionSettingsSchema.parse(req.body);
      const settings = { timeoutMinutes: body.timeoutMinutes };
      await auditRepository?.record({
        action: "admin.session_timeout_updated",
        subjectType: "admin",
        subjectId: actor.adminUserId,
        adminUserId: actor.adminUserId,
        adminEmail: actor.adminEmail,
        metadata: settings
      });
      const session = issueAdminToken({
        id: actor.adminUserId,
        email: actor.adminEmail,
        role: actor.adminRole,
        timeoutMinutes: settings.timeoutMinutes
      });
      res.json({ session: settings, token: session.token, expires_at: session.expiresAt });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ code: "API_VALIDATION", message: "Invalid request body", issues: error.issues });
      }
      next(error);
    }
  });

  router.post("/change-password", requireAdmin, async (req, res, next) => {
    try {
      const actor = getAdminActor(req);
      if (!actor?.adminUserId) {
        return res.status(401).json({ code: "AUTH_REQUIRED", message: "Admin token required" });
      }
      const body = changePasswordSchema.parse(req.body);
      const admin = await repository.findAdminById(actor.adminUserId);
      if (!admin || !(await bcrypt.compare(body.currentPassword, admin.passwordHash))) {
        return res.status(401).json({ code: "AUTH_INVALID", message: "Current password is incorrect" });
      }
      await repository.updateAdminPassword(admin.id, await bcrypt.hash(body.newPassword, 12));
      await auditRepository?.record({
        action: "admin.password_changed",
        subjectType: "admin",
        subjectId: admin.id,
        adminUserId: admin.id,
        adminEmail: admin.email,
        metadata: { role: admin.role }
      });
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ code: "API_VALIDATION", message: "Invalid request body", issues: error.issues });
      }
      next(error);
    }
  });

  return router;
}

async function resolveSessionSettings(auditRepository?: AuditRepository) {
  if (!auditRepository) return { timeoutMinutes: config.adminSessionTimeoutMinutes };
  const entries = await auditRepository.listRecent(500);
  const latest = entries.find((entry) => entry.action === "admin.session_timeout_updated");
  const timeoutMinutes = timeoutFromMetadata(latest?.metadata);
  return { timeoutMinutes: timeoutMinutes ?? config.adminSessionTimeoutMinutes };
}

function timeoutFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || !("timeoutMinutes" in metadata)) return null;
  const value = (metadata as { timeoutMinutes?: unknown }).timeoutMinutes;
  return typeof value === "number" && Number.isInteger(value) && value >= 15 && value <= 1440 ? value : null;
}

function issueAdminToken(input: {
  id: string;
  email: string;
  role: string;
  timeoutMinutes: number;
}) {
  const token = jwt.sign({ sub: input.id, email: input.email, role: input.role }, config.jwtSecret, {
    expiresIn: input.timeoutMinutes * 60
  });
  const decoded = jwt.decode(token);
  const exp = decoded && typeof decoded === "object" && typeof decoded.exp === "number" ? decoded.exp : null;
  return {
    token,
    expiresAt: exp ? new Date(exp * 1000).toISOString() : null
  };
}
