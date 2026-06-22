import type { LicensePlan, LicenseRecord, LicenseRepository } from "../src/types.js";
import crypto from "node:crypto";

export class MemoryLicenseRepository implements LicenseRepository {
  public records = new Map<string, LicenseRecord>();

  constructor(seed: LicenseRecord[] = []) {
    seed.forEach((record) => this.records.set(record.key, record));
  }

  list() {
    return Promise.resolve([...this.records.values()].filter((record) => !record.deletedAt));
  }

  findByKey(key: string) {
    const record = this.records.get(key);
    return Promise.resolve(record && !record.deletedAt ? record : null);
  }

  create(input: {
    key: string;
    plan: LicensePlan;
    expiresAt: Date;
    user?: { name: string; email: string; company?: string };
  }) {
    const now = new Date();
    const record: LicenseRecord = {
      id: crypto.randomUUID(),
      key: input.key,
      plan: input.plan,
      status: "pending",
      deviceId: null,
      hostname: null,
      os: null,
      activatedAt: null,
      expiresAt: input.expiresAt,
      lastVerifiedAt: null,
      user: input.user ? { ...input.user, company: input.user.company ?? null } : null,
      createdAt: now,
      updatedAt: now
    };
    this.records.set(record.key, record);
    return Promise.resolve(record);
  }

  activate(key: string, input: { deviceId: string; hostname?: string; os?: string }) {
    return this.patch(key, {
      status: "active",
      deviceId: input.deviceId,
      hostname: input.hostname ?? null,
      os: input.os ?? null,
      activatedAt: new Date(),
      lastVerifiedAt: new Date()
    });
  }

  touchVerification(key: string) {
    return this.patch(key, { lastVerifiedAt: new Date() });
  }

  renew(key: string, expiresAt: Date) {
    return this.patch(key, { expiresAt, status: "active" });
  }

  revoke(key: string) {
    return this.patch(key, { status: "revoked" });
  }

  restore(key: string) {
    return this.patch(key, { status: "pending", deviceId: null, hostname: null, os: null, activatedAt: null });
  }

  softDelete(key: string, retentionUntil: Date) {
    return this.patch(key, {
      status: "revoked",
      deviceId: null,
      hostname: null,
      os: null,
      deletedAt: new Date(),
      retentionUntil
    });
  }

  resetDevice(key: string) {
    return this.patch(key, {
      status: "pending",
      deviceId: null,
      hostname: null,
      os: null,
      activatedAt: null
    });
  }

  updateDetails(
    key: string,
    input: {
      plan?: LicensePlan;
      expiresAt?: Date;
      user?: { name: string; email: string; company?: string };
    }
  ) {
    return this.patch(key, {
      plan: input.plan,
      expiresAt: input.expiresAt,
      user: input.user ? { ...input.user, company: input.user.company ?? null } : undefined
    });
  }

  private patch(key: string, patch: Partial<LicenseRecord>) {
    const existing = this.records.get(key);
    if (!existing) throw new Error("Missing test record");
    const next = { ...existing, ...patch, updatedAt: new Date() };
    this.records.set(key, next);
    return Promise.resolve(next);
  }
}
