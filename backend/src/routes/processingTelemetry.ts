import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth.js";
import { LicenseError, LicenseService } from "../services/licenseService.js";
import { processingTelemetrySchema, ProcessingTelemetryService } from "../services/processingTelemetryService.js";

export function createProcessingTelemetryRouter(
  service: ProcessingTelemetryService,
  licenseService: LicenseService,
  options: { requireAdminAuth?: boolean } = {}
) {
  const router = Router();
  const adminOnly = options.requireAdminAuth === false ? [] : [requireAdmin];

  router.post("/telemetry/processing", async (req, res, next) => {
    try {
      if (options.requireAdminAuth !== false) {
        const header = req.header("authorization");
        const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
        if (!token) return res.status(401).json({ code: "TELEMETRY_AUTH_REQUIRED", message: "License bearer token required" });
        const license = await licenseService.status(token);
        if (license.status !== "active") {
          return res.status(403).json({ code: "TELEMETRY_LICENSE_INACTIVE", message: "Telemetry requires an active license" });
        }
      }
      await service.record(processingTelemetrySchema.parse(req.body));
      res.status(202).json({ recorded: true });
    } catch (error) {
      if (error instanceof LicenseError) {
        return res.status(error.statusCode === 404 ? 401 : error.statusCode).json({ code: error.code, message: error.message });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({ code: "API_VALIDATION", message: "Invalid request body", issues: error.issues });
      }
      next(error);
    }
  });

  router.get("/analytics/processing", ...adminOnly, async (_req, res, next) => {
    try {
      res.json({ processing: await service.analytics() });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
