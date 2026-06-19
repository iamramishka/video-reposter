import express from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth.js";
import type { LicenseService } from "../services/licenseService.js";
import type { StripeService } from "../services/stripeService.js";
import { StripeNotConfiguredError } from "../services/stripeService.js";
import type { LicensePlan } from "../types.js";

function sendPaymentError(error: unknown, res: express.Response, next: express.NextFunction) {
  if (error instanceof StripeNotConfiguredError) {
    return res.status(503).json({ code: "STRIPE_503", message: "Stripe is not configured on this server." });
  }
  if (error instanceof z.ZodError) {
    return res.status(400).json({ code: "API_VALIDATION", message: "Invalid request", issues: error.issues });
  }
  next(error);
}

const checkoutSchema = z.object({
  plan: z.enum(["starter", "pro", "enterprise"]),
  email: z.string().email(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional()
});

const portalSchema = z.object({
  email: z.string().email(),
  returnUrl: z.string().url().optional()
});

const invoicesSchema = z.object({
  email: z.string().email()
});

export function createPaymentRouter(
  licenseService: LicenseService,
  stripeService: StripeService,
  options: { requireAdminAuth?: boolean } = {}
) {
  const router = express.Router();
  const adminOnly = options.requireAdminAuth !== false ? [requireAdmin] : [];

  router.get("/payments/summary", ...adminOnly, async (_req, res, next) => {
    try {
      if (!stripeService.isConfigured()) {
        return res.json({ configured: false });
      }
      const summary = await stripeService.getPaymentSummary();
      return res.json({ configured: true, ...summary });
    } catch (error) {
      if (error instanceof StripeNotConfiguredError) return res.json({ configured: false });
      next(error);
    }
  });

  router.get("/payments/pricing", ...adminOnly, (_req, res) => {
    res.json({
      configured: stripeService.isConfigured(),
      plans: stripeService.getPricingConfig().map(({ plan, label, priceId }) => ({
        plan,
        label,
        configured: Boolean(priceId)
      }))
    });
  });

  router.post("/payments/checkout", ...adminOnly, async (req, res, next) => {
    try {
      const { plan, email, successUrl, cancelUrl } = checkoutSchema.parse(req.body);
      const defaultBase = `${req.protocol}://${req.get("host")}`;
      const result = await stripeService.createCheckoutSession({
        plan: plan as LicensePlan,
        email,
        successUrl: successUrl ?? `${defaultBase}/`,
        cancelUrl: cancelUrl ?? `${defaultBase}/`
      });
      res.json(result);
    } catch (error) {
      return sendPaymentError(error, res, next);
    }
  });

  router.post("/payments/portal", ...adminOnly, async (req, res, next) => {
    try {
      const { email, returnUrl } = portalSchema.parse(req.body);
      const defaultReturn = `${req.protocol}://${req.get("host")}/`;
      const result = await stripeService.createPortalSession(email, returnUrl ?? defaultReturn);
      res.json(result);
    } catch (error) {
      return sendPaymentError(error, res, next);
    }
  });

  router.get("/payments/invoices", ...adminOnly, async (req, res, next) => {
    try {
      const { email } = invoicesSchema.parse(req.query);
      const invoices = await stripeService.listInvoices(email);
      res.json({
        invoices: invoices.map((inv) => ({
          id: inv.id,
          customer_email: inv.customer_email,
          amount_paid: inv.amount_paid,
          currency: inv.currency,
          status: inv.status,
          created: inv.created,
          hosted_invoice_url: inv.hosted_invoice_url,
          invoice_pdf: inv.invoice_pdf,
          period_start: inv.period_start,
          period_end: inv.period_end
        }))
      });
    } catch (error) {
      return sendPaymentError(error, res, next);
    }
  });

  return router;
}
