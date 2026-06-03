import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import type { LicenseService } from "../services/licenseService.js";

export function createUserRouter(service: LicenseService, options: { requireAdminAuth?: boolean } = {}) {
  const router = Router();
  const adminOnly = options.requireAdminAuth === false ? [] : [requireAdmin];

  router.get("/users", ...adminOnly, async (_req, res, next) => {
    try {
      res.json({ users: await service.listUsers() });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
