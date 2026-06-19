import request from "supertest";
import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { LicenseService } from "../src/services/licenseService.js";
import { StripeService, StripeNotConfiguredError } from "../src/services/stripeService.js";
import { MemoryLicenseRepository } from "./memoryLicenseRepository.js";

function adminToken() {
  return jwt.sign({ sub: "admin-1", email: "admin@videoreposter.local", role: "admin" }, config.jwtSecret);
}

function mockStripe(overrides: Partial<StripeService> = {}): StripeService {
  const base = {
    isConfigured: () => true,
    getPricingConfig: () => [
      { plan: "starter" as const, priceId: "price_starter", label: "Starter" },
      { plan: "pro" as const, priceId: "price_pro", label: "Pro" },
      { plan: "enterprise" as const, priceId: undefined, label: "Enterprise" }
    ],
    createCheckoutSession: vi.fn(async () => ({ url: "https://checkout.stripe.com/test" })),
    createPortalSession: vi.fn(async () => ({ url: "https://billing.stripe.com/test" })),
    listInvoices: vi.fn(async () => []),
    getPaymentSummary: vi.fn(async () => ({ mrr: 299, arr: 3588, activeSubscriptions: 3, churnRate: 25, churnedSubscriptions: 1, currency: "usd" })),
    constructWebhookEvent: vi.fn()
  };
  return Object.assign(Object.create(StripeService.prototype) as StripeService, base, overrides);
}

describe("payments API", () => {
  it("returns configured:false when Stripe is not set up", async () => {
    const stripe = mockStripe({ isConfigured: () => false });
    const app = createApp({ licenseService: new LicenseService(new MemoryLicenseRepository()), stripeService: stripe });
    const token = adminToken();

    await request(app).get("/api/payments/summary").set("Authorization", `Bearer ${token}`).expect(200)
      .expect(({ body }) => { expect(body.configured).toBe(false); });

    await request(app).get("/api/payments/pricing").set("Authorization", `Bearer ${token}`).expect(200)
      .expect(({ body }) => { expect(body.configured).toBe(false); });
  });

  it("returns payment summary when Stripe is configured", async () => {
    const stripe = mockStripe();
    const app = createApp({ licenseService: new LicenseService(new MemoryLicenseRepository()), stripeService: stripe });
    const token = adminToken();

    await request(app).get("/api/payments/summary").set("Authorization", `Bearer ${token}`).expect(200)
      .expect(({ body }) => {
        expect(body.configured).toBe(true);
        expect(body.mrr).toBe(299);
        expect(body.arr).toBe(3588);
        expect(body.activeSubscriptions).toBe(3);
        expect(body.churnRate).toBe(25);
        expect(body.churnedSubscriptions).toBe(1);
      });
  });

  it("creates a Stripe checkout session for a given plan and email", async () => {
    const stripe = mockStripe();
    const app = createApp({ licenseService: new LicenseService(new MemoryLicenseRepository()), stripeService: stripe });
    const token = adminToken();

    await request(app)
      .post("/api/payments/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ plan: "pro", email: "customer@example.com", successUrl: "https://example.com/success", cancelUrl: "https://example.com/cancel" })
      .expect(200)
      .expect(({ body }) => { expect(body.url).toBe("https://checkout.stripe.com/test"); });

    expect(stripe.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
      plan: "pro",
      email: "customer@example.com"
    }));
  });

  it("rejects checkout with invalid email", async () => {
    const stripe = mockStripe();
    const app = createApp({ licenseService: new LicenseService(new MemoryLicenseRepository()), stripeService: stripe });
    const token = adminToken();

    await request(app)
      .post("/api/payments/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ plan: "pro", email: "not-an-email" })
      .expect(400);
  });

  it("returns 503 when Stripe is not configured and checkout is requested", async () => {
    const stripe = mockStripe({
      isConfigured: () => true,
      createCheckoutSession: vi.fn(async () => { throw new StripeNotConfiguredError(); })
    });
    const app = createApp({ licenseService: new LicenseService(new MemoryLicenseRepository()), stripeService: stripe });
    const token = adminToken();

    await request(app)
      .post("/api/payments/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ plan: "pro", email: "customer@example.com", successUrl: "https://example.com/s", cancelUrl: "https://example.com/c" })
      .expect(503)
      .expect(({ body }) => { expect(body.code).toBe("STRIPE_503"); });
  });

  it("returns invoices for a customer email", async () => {
    const stripe = mockStripe();
    const app = createApp({ licenseService: new LicenseService(new MemoryLicenseRepository()), stripeService: stripe });
    const token = adminToken();

    await request(app)
      .get("/api/payments/invoices?email=customer@example.com")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => { expect(Array.isArray(body.invoices)).toBe(true); });
  });

  it("rejects payment routes without admin token", async () => {
    const stripe = mockStripe();
    const app = createApp({ licenseService: new LicenseService(new MemoryLicenseRepository()), stripeService: stripe });

    await request(app).get("/api/payments/summary").expect(401);
    await request(app).post("/api/payments/checkout").send({}).expect(401);
  });

  it("handles checkout.session.completed webhook by creating a license", async () => {
    const licenseService = new LicenseService(new MemoryLicenseRepository());
    const stripe = mockStripe({
      constructWebhookEvent: vi.fn(() => ({
        type: "checkout.session.completed",
        data: {
          object: {
            customer_email: "buyer@example.com",
            metadata: { plan: "pro" },
            customer_details: null
          }
        }
      } as unknown as Stripe.Event))
    });
    const app = createApp({ licenseService, stripeService: stripe });

    await request(app)
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "t=123,v1=abc")
      .send(JSON.stringify({ type: "checkout.session.completed" }))
      .expect(200)
      .expect(({ body }) => { expect(body.received).toBe(true); });

    const licenses = await licenseService.listLicenses();
    const created = licenses.find((l) => l.user?.email === "buyer@example.com");
    expect(created).toBeDefined();
    expect(created?.plan).toBe("pro");
  });

  it("returns 400 for an invalid webhook signature", async () => {
    const stripe = mockStripe({
      constructWebhookEvent: vi.fn(() => { throw new Error("Invalid signature"); })
    });
    const app = createApp({ licenseService: new LicenseService(new MemoryLicenseRepository()), stripeService: stripe });

    await request(app)
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("stripe-signature", "bad-sig")
      .send("{}")
      .expect(400);
  });
});
