import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth.js";
import type { AuditRepository } from "../types.js";

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20)
});

export function createAuditLogRouter(repository: AuditRepository, options: { requireAdminAuth?: boolean } = {}) {
  const router = Router();
  const adminOnly = options.requireAdminAuth === false ? [] : [requireAdmin];

  router.get("/audit-logs/logins", ...adminOnly, async (req, res, next) => {
    try {
      const { limit } = querySchema.parse(req.query);
      const entries = (await repository.listRecent(500))
        .filter((entry) => entry.action === "admin.login" || entry.action === "admin.login_failed")
        .slice(0, limit);
      res.json({ audit_logs: entries.map(serializeAuditEntry) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ code: "API_VALIDATION", message: "Invalid query parameters", issues: error.issues });
      }
      next(error);
    }
  });

  router.get("/audit-logs", ...adminOnly, async (req, res, next) => {
    try {
      const { limit } = querySchema.parse(req.query);
      const entries = await repository.listRecent(limit);
      res.json({ audit_logs: entries.map(serializeAuditEntry) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ code: "API_VALIDATION", message: "Invalid query parameters", issues: error.issues });
      }
      next(error);
    }
  });

  return router;
}

function serializeAuditEntry(entry: Awaited<ReturnType<AuditRepository["listRecent"]>>[number]) {
  return {
    id: entry.id,
    action: entry.action,
    subject_type: entry.subjectType,
    subject_id: entry.subjectId,
    license_id: entry.licenseId,
    license_key: entry.licenseKey,
    admin_user_id: entry.adminUserId,
    admin_user_email: entry.adminUserEmail,
    metadata: entry.metadata,
    created_at: entry.createdAt.toISOString()
  };
}
