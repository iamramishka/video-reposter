import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";
import { getAdminActor, requireAdmin } from "../middleware/auth.js";
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

export function createAuthRouter(repository: AuthRepository, auditRepository?: AuditRepository) {
  const router = Router();

  router.post("/login", async (req, res, next) => {
    try {
      const body = loginSchema.parse(req.body);
      const admin = await repository.findAdminByEmail(body.email);
      if (!admin || !(await bcrypt.compare(body.password, admin.passwordHash))) {
        return res.status(401).json({ code: "AUTH_INVALID", message: "Invalid email or password" });
      }

      const token = jwt.sign({ sub: admin.id, email: admin.email, role: admin.role }, config.jwtSecret, {
        expiresIn: "8h"
      });
      await auditRepository?.record({
        action: "admin.login",
        subjectType: "admin",
        subjectId: admin.id,
        adminUserId: admin.id,
        adminEmail: admin.email,
        metadata: { role: admin.role }
      });
      res.json({ token, admin: { email: admin.email, role: admin.role } });
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
