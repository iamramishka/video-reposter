import Stripe from "stripe";
import type { LicensePlan } from "../types.js";

export type StripePricingConfig = {
  plan: LicensePlan;
  priceId: string | undefined;
  label: string;
};

const PLAN_ENV_KEYS: Record<LicensePlan, string> = {
  starter: "STRIPE_PRICE_ID_STARTER",
  pro: "STRIPE_PRICE_ID_PRO",
  enterprise: "STRIPE_PRICE_ID_ENTERPRISE"
};

export class StripeService {
  private readonly client: Stripe | null;

  constructor() {
    const key = process.env.STRIPE_SECRET_KEY;
    this.client = key ? new Stripe(key) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  getPricingConfig(): StripePricingConfig[] {
    return (["starter", "pro", "enterprise"] as LicensePlan[]).map((plan) => ({
      plan,
      priceId: process.env[PLAN_ENV_KEYS[plan]],
      label: plan.charAt(0).toUpperCase() + plan.slice(1)
    }));
  }

  async createCheckoutSession({
    plan,
    email,
    successUrl,
    cancelUrl
  }: {
    plan: LicensePlan;
    email: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }> {
    if (!this.client) throw new StripeNotConfiguredError();
    const priceId = process.env[PLAN_ENV_KEYS[plan]];
    if (!priceId) throw new Error(`No Stripe price configured for plan "${plan}". Set ${PLAN_ENV_KEYS[plan]} in your environment.`);

    const session = await this.client.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { plan }
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return { url: session.url };
  }

  async createPortalSession(email: string, returnUrl: string): Promise<{ url: string }> {
    if (!this.client) throw new StripeNotConfiguredError();
    const customers = await this.client.customers.search({ query: `email:"${email}"`, limit: 1 });
    const customerId = customers.data[0]?.id;
    if (!customerId) throw new Error(`No Stripe customer found for email: ${email}`);
    const session = await this.client.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
    return { url: session.url };
  }

  async listInvoices(email: string): Promise<Stripe.Invoice[]> {
    if (!this.client) throw new StripeNotConfiguredError();
    const customers = await this.client.customers.search({ query: `email:"${email}"`, limit: 1 });
    const customerId = customers.data[0]?.id;
    if (!customerId) return [];
    const invoices = await this.client.invoices.list({ customer: customerId, limit: 50 });
    return invoices.data;
  }

  async getPaymentSummary(): Promise<{ mrr: number; arr: number; activeSubscriptions: number; churnRate: number; churnedSubscriptions: number; currency: string }> {
    if (!this.client) throw new StripeNotConfiguredError();
    const subscriptions = await this.client.subscriptions.list({ status: "active", limit: 100, expand: ["data.items.data.price"] });
    const since = Math.floor((Date.now() - 30 * 86_400_000) / 1000);
    const canceled = await this.client.subscriptions.list({ status: "canceled", created: { gte: since }, limit: 100 });
    let mrrCents = 0;
    const currency = "usd";
    for (const sub of subscriptions.data) {
      for (const item of sub.items.data) {
        const price = item.price;
        const amount = (price.unit_amount ?? 0) * (item.quantity ?? 1);
        if (price.recurring?.interval === "month") mrrCents += amount;
        else if (price.recurring?.interval === "year") mrrCents += Math.round(amount / 12);
      }
    }
    const mrr = Math.round(mrrCents) / 100;
    const denominator = subscriptions.data.length + canceled.data.length;
    const churnRate = denominator > 0 ? Math.round((canceled.data.length / denominator) * 10_000) / 100 : 0;
    return {
      mrr,
      arr: Math.round(mrr * 12 * 100) / 100,
      activeSubscriptions: subscriptions.data.length,
      churnRate,
      churnedSubscriptions: canceled.data.length,
      currency
    };
  }

  constructWebhookEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
    if (!this.client) throw new StripeNotConfiguredError();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
    return this.client.webhooks.constructEvent(rawBody, signature, secret);
  }
}

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe is not configured. Set STRIPE_SECRET_KEY in your environment.");
  }
}
