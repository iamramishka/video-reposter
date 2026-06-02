import { Router } from "express";
import { z } from "zod";
import { getAdminActor, requireAdmin } from "../middleware/auth.js";
import { LicenseError, LicenseService } from "../services/licenseService.js";

const createSchema = z.object({
  key: z.string().optional(),
  plan: z.enum(["starter", "pro", "enterprise"]).optional(),
  expiresAt: z.string().optional(),
  user: z.object({
    name: z.string().min(1),
    email: z.email(),
    company: z.string().optional()
  }).optional()
});

function sendError(error: unknown, res: import("express").Response) {
  if (error instanceof LicenseError) {
    return res.status(error.statusCode).json({ code: error.code, message: error.message });
  }
  if (error instanceof z.ZodError) {
    return res.status(400).json({ code: "API_VALIDATION", message: "Invalid request body", issues: error.issues });
  }
  throw error;
}

export function createLicenseRouter(service: LicenseService, options: { requireAdminAuth?: boolean } = {}) {
  const router = Router();
  const adminOnly = options.requireAdminAuth === false ? [] : [requireAdmin];

  router.get("/licenses", ...adminOnly, async (_req, res, next) => {
    try {
      res.json({ licenses: await service.listLicenses() });
    } catch (error) {
      next(error);
    }
  });

  router.post("/licenses", ...adminOnly, async (req, res, next) => {
    try {
      res.status(201).json({ license: await service.createLicense(createSchema.parse(req.body), getAdminActor(req)) });
    } catch (error) {
      const response = sendError(error, res);
      if (!response) next(error);
    }
  });

  router.post("/license/validate", async (req, res, next) => {
    try {
      res.json(await service.validate(req.body));
    } catch (error) {
      const response = sendError(error, res);
      if (!response) next(error);
    }
  });

  router.post("/license/activate", async (req, res, next) => {
    try {
      res.json(await service.activate(req.body));
    } catch (error) {
      const response = sendError(error, res);
      if (!response) next(error);
    }
  });

  router.post("/license/renew", ...adminOnly, async (req, res, next) => {
    try {
      const body = z.object({ key: z.string(), days: z.number().int().positive().max(3660) }).parse(req.body);
      res.json({ license: await service.renew(body.key, body.days, getAdminActor(req)) });
    } catch (error) {
      const response = sendError(error, res);
      if (!response) next(error);
    }
  });

  router.post("/license/revoke", ...adminOnly, async (req, res, next) => {
    try {
      const body = z.object({ key: z.string() }).parse(req.body);
      res.json({ license: await service.revoke(body.key, getAdminActor(req)) });
    } catch (error) {
      const response = sendError(error, res);
      if (!response) next(error);
    }
  });

  router.post("/license/reset-device", ...adminOnly, async (req, res, next) => {
    try {
      const body = z.object({ key: z.string() }).parse(req.body);
      res.json({ license: await service.resetDevice(body.key, getAdminActor(req)) });
    } catch (error) {
      const response = sendError(error, res);
      if (!response) next(error);
    }
  });

  router.get("/license/status/:key", async (req, res, next) => {
    try {
      res.json({ license: await service.status(req.params.key) });
    } catch (error) {
      const response = sendError(error, res);
      if (!response) next(error);
    }
  });

  return router;
}
