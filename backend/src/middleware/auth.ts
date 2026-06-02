import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import type { AuditActor } from "../types.js";

const adminSymbol = Symbol("admin");

interface AdminPayload extends jwt.JwtPayload {
  sub: string;
  email?: string;
  role?: string;
}

export interface AdminRequest extends Request {
  [adminSymbol]?: AuditActor;
}

export function getAdminActor(req: Request): AuditActor | undefined {
  return (req as AdminRequest)[adminSymbol];
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) return res.status(401).json({ code: "AUTH_REQUIRED", message: "Admin token required" });

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (typeof payload !== "object" || typeof payload.sub !== "string") {
      return res.status(401).json({ code: "AUTH_INVALID", message: "Invalid or expired admin token" });
    }
    (req as AdminRequest)[adminSymbol] = {
      adminUserId: (payload as AdminPayload).sub,
      adminEmail: typeof (payload as AdminPayload).email === "string" ? (payload as AdminPayload).email : undefined
    };
    next();
  } catch {
    res.status(401).json({ code: "AUTH_INVALID", message: "Invalid or expired admin token" });
  }
}
