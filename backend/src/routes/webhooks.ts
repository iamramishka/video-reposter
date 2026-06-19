import express from "express";
import type Stripe from "stripe";
import type { LicenseService } from "../services/licenseService.js";
import type { StripeService } from "../services/stripeService.js";
import type { LicensePlan } from "../types.js";

export function createWebhookRouter(licenseService: LicenseService, stripeService: StripeService) {
  const router = express.Router();

  router.post(
    "/stripe",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      if (!stripeService.isConfigured()) {
        return res.status(503).json({ code: "STRIPE_503", message: "Stripe is not configured." });
      }

      const signature = req.headers["stripe-signature"];
      if (!signature || typeof signature !== "string") {
        return res.status(400).json({ code: "WH_400", message: "Missing Stripe signature." });
      }

      let event;
      try {
        event = stripeService.constructWebhookEvent(req.body as Buffer, signature);
      } catch {
        return res.status(400).json({ code: "WH_SIG", message: "Invalid webhook signature." });
      }

      try {
        await handleStripeEvent(event, licenseService);
      } catch (error) {
        console.error("[webhook] stripe event handling error:", event.type, error);
      }

      return res.json({ received: true });
    }
  );

  return router;
}

async function handleStripeEvent(event: Stripe.Event, licenseService: LicenseService) {
  const obj = event.data.object as unknown as Record<string, unknown>;

  if (event.type === "checkout.session.completed") {
    const email = stringField(obj.customer_email) ?? stringField((obj.customer_details as Record<string, unknown> | null)?.email);
    const plan = (stringField((obj.metadata as Record<string, unknown> | null)?.plan) ?? "pro") as LicensePlan;
    if (!email) return;

    await licenseService.createLicense(
      {
        plan,
        expiresAt: addYears(new Date(), 1).toISOString(),
        user: { name: email, email }
      }
    );
  }

  if (event.type === "invoice.paid") {
    const email = stringField(obj.customer_email);
    if (!email) return;

    const licenses = await licenseService.listLicenses();
    const matchingActive = licenses.filter((license) => license.user?.email === email && license.status === "active");
    for (const license of matchingActive) {
      await licenseService.renew(license.license_key, 365);
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const customerEmail = stringField(obj.customer_email);
    if (!customerEmail) return;

    const licenses = await licenseService.listLicenses();
    const active = licenses.filter((license) => license.user?.email === customerEmail && license.status === "active");
    for (const license of active) {
      await licenseService.revoke(license.license_key);
    }
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}
