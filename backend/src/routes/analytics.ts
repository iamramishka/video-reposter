import { Router } from "express";
import PDFDocument from "pdfkit";
import { requireAdmin } from "../middleware/auth.js";
import type { LicenseService } from "../services/licenseService.js";

const planLabels: Record<string, string> = { starter: "Starter", pro: "Pro", enterprise: "Enterprise" };

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

  router.get("/analytics/export/pdf", ...adminOnly, async (_req, res, next) => {
    try {
      const analytics = await service.analytics();
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      const filename = `analytics-${new Date().toISOString().slice(0, 10)}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      doc.pipe(res);

      doc.fontSize(22).font("Helvetica-Bold").text("License Analytics Report", { align: "center" });
      doc.fontSize(11).font("Helvetica").fillColor("#555555").text(dateStr, { align: "center" });
      doc.moveDown(1.5).fillColor("#000000");

      doc.fontSize(14).font("Helvetica-Bold").text("Summary");
      doc.moveDown(0.4);
      const stats: [string, number][] = [
        ["Total Licenses", analytics.total],
        ["Active", analytics.active],
        ["Pending", analytics.pending],
        ["Expired", analytics.expired],
        ["Revoked", analytics.revoked],
        ["Expiring within 30 days", analytics.expiring_soon],
        ["Total Activations", analytics.activations]
      ];
      for (const [label, value] of stats) {
        doc.fontSize(11).font("Helvetica").text(`${label}:  `, { continued: true }).font("Helvetica-Bold").text(String(value));
      }
      doc.moveDown(1);

      doc.fontSize(14).font("Helvetica-Bold").text("Plan Distribution");
      doc.moveDown(0.4);
      const safeTotal = analytics.total || 1;
      for (const plan of ["starter", "pro", "enterprise"] as const) {
        const count = analytics.plans[plan] ?? 0;
        const pct = Math.round((count / safeTotal) * 100);
        doc.fontSize(11).font("Helvetica").text(`${planLabels[plan]}:  `, { continued: true }).font("Helvetica-Bold").text(`${count}  (${pct}%)`);
      }
      doc.moveDown(1);

      const activeDays = analytics.daily_activations.filter(d => d.count > 0);
      doc.fontSize(14).font("Helvetica-Bold").text("Activations — Last 30 Days");
      doc.moveDown(0.4);
      if (activeDays.length === 0) {
        doc.fontSize(11).font("Helvetica").text("No activations recorded in the last 30 days.");
      } else {
        for (const { date, count } of activeDays) {
          doc.fontSize(11).font("Helvetica").text(`${date}:  `, { continued: true }).font("Helvetica-Bold").text(`${count} activation${count !== 1 ? "s" : ""}`);
        }
      }

      doc.end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
