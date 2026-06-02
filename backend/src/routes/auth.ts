import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";
import type { PrismaAuthRepository } from "../repositories/prismaAuthRepository.js";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1)
});

export function createAuthRouter(repository: PrismaAuthRepository) {
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
      res.json({ token, admin: { email: admin.email, role: admin.role } });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ code: "API_VALIDATION", message: "Invalid request body", issues: error.issues });
      }
      next(error);
    }
  });

  return router;
}
