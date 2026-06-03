import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import type { LicenseService } from "../services/licenseService.js";

export function createAnalyticsRouter(service: LicenseService, options: { requireAdminAuth?: boolean } = {}) {
  const router = Router();
  const adminOnly = options.requireAdminAuth === false ? [] : [requireAdmin];

  router.get("/analytics", ...adminOnly, async (_req, res, next) => {
    try {
      res.json({ analytics: await service.analytics() });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
