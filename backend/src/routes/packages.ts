import { Router } from "express";
import { z } from "zod";
import { getAdminActor, requireAdmin, requireWritableAdmin } from "../middleware/auth.js";
import { packagePlans } from "../packages.js";
import { PackageService } from "../services/packageService.js";
import type { LicensePlan } from "../types.js";

const updateSchema = z.object({
  videoLimit: z.number().int().min(1).max(100_000),
  templateLimit: z.number().int().min(1).max(100_000),
  workerLimit: z.number().int().min(1).max(64)
});

export function createPackageRouter(service: PackageService, options: { requireAdminAuth?: boolean } = {}) {
  const router = Router();
  const adminOnly = options.requireAdminAuth === false ? [] : [requireAdmin];
  const writableAdminOnly = options.requireAdminAuth === false ? [] : [requireWritableAdmin];

  router.get("/packages", ...adminOnly, async (_req, res, next) => {
    try {
      res.json({ packages: await service.listPackages() });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/packages/:plan", ...writableAdminOnly, async (req, res, next) => {
    try {
      const plan = req.params.plan as LicensePlan;
      if (!packagePlans.includes(plan)) {
        return res.status(404).json({ code: "PKG_001", message: "Package not found" });
      }
      res.json({ package: await service.updatePackage(plan, updateSchema.parse(req.body), getAdminActor(req)) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ code: "API_VALIDATION", message: "Invalid request body", issues: error.issues });
      }
      next(error);
    }
  });

  return router;
}
