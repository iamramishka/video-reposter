import { Router } from "express";
import { z } from "zod";
import { getAdminActor, requireAdmin, requireWritableAdmin } from "../middleware/auth.js";
import { retentionSchema, UserError, userCreateSchema, userDisableSchema, UserService, userUpdateSchema } from "../services/userService.js";

const idParamSchema = z.object({ id: z.string().min(1) });

export function createUserRouter(service: UserService, options: { requireAdminAuth?: boolean } = {}) {
  const router = Router();
  const adminOnly = options.requireAdminAuth === false ? [] : [requireAdmin];
  const writableAdminOnly = options.requireAdminAuth === false ? [] : [requireWritableAdmin];

  router.get("/users", ...adminOnly, async (_req, res, next) => {
    try {
      res.json({ users: await service.listUsers() });
    } catch (error) {
      next(error);
    }
  });

  router.post("/users", ...writableAdminOnly, async (req, res, next) => {
    try {
      res.status(201).json({ user: await service.createUser(userCreateSchema.parse(req.body), getAdminActor(req)) });
    } catch (error) {
      const response = sendError(error, res);
      if (!response) next(error);
    }
  });

  router.patch("/users/:id", ...writableAdminOnly, async (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      res.json({ user: await service.updateUser(id, userUpdateSchema.parse(req.body), getAdminActor(req)) });
    } catch (error) {
      const response = sendError(error, res);
      if (!response) next(error);
    }
  });

  router.patch("/users/:id/disabled", ...writableAdminOnly, async (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const body = userDisableSchema.parse(req.body);
      res.json({ user: await service.setDisabled(id, body.disabled, getAdminActor(req)) });
    } catch (error) {
      const response = sendError(error, res);
      if (!response) next(error);
    }
  });

  router.delete("/users/:id", ...writableAdminOnly, async (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const body = retentionSchema.parse(req.body ?? {});
      res.json({ user: await service.softDeleteUser(id, body.retentionDays, getAdminActor(req)) });
    } catch (error) {
      const response = sendError(error, res);
      if (!response) next(error);
    }
  });

  return router;
}

function sendError(error: unknown, res: import("express").Response) {
  if (error instanceof UserError) {
    return res.status(error.statusCode).json({ code: error.code, message: error.message });
  }
  if (error instanceof z.ZodError) {
    return res.status(400).json({ code: "API_VALIDATION", message: "Invalid request body", issues: error.issues });
  }
  return null;
}
