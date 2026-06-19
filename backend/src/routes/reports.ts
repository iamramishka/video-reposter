import { Router } from "express";
import { requireAdmin } from "../middleware/auth.js";
import type { LicenseService } from "../services/licenseService.js";
import type { UserService } from "../services/userService.js";

export function createReportRouter(
  licenseService: LicenseService,
  userService: UserService,
  options: { requireAdminAuth?: boolean } = {}
) {
  const router = Router();
  const adminOnly = options.requireAdminAuth === false ? [] : [requireAdmin];

  router.get("/reports/licenses.csv", ...adminOnly, async (_req, res, next) => {
    try {
      const licenses = await licenseService.listLicenses();
      sendCsv(res, "licenses", [
        ["license_key", "customer_name", "customer_email", "company", "plan", "status", "expires_at", "device_id", "hostname", "os", "activated_at", "last_verified"],
        ...licenses.map((license) => [
          license.license_key,
          license.user?.name ?? "",
          license.user?.email ?? "",
          license.user?.company ?? "",
          license.plan,
          license.status,
          license.expires_at,
          license.device_id ?? "",
          license.hostname ?? "",
          license.os ?? "",
          license.activated_at ?? "",
          license.last_verified ?? ""
        ])
      ]);
    } catch (error) {
      next(error);
    }
  });

  router.get("/reports/users.csv", ...adminOnly, async (_req, res, next) => {
    try {
      const users = await userService.listUsers();
      sendCsv(res, "users", [
        ["id", "name", "email", "company", "disabled_at", "license_count", "active_count", "pending_count", "expired_count", "revoked_count", "latest_activation"],
        ...users.map((user) => [
          user.id,
          user.name,
          user.email,
          user.company ?? "",
          user.disabled_at ?? "",
          user.license_count,
          user.active_count,
          user.pending_count,
          user.expired_count,
          user.revoked_count,
          user.latest_activation ?? ""
        ])
      ]);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function sendCsv(res: import("express").Response, name: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}
