import type { LicensePlan, LicenseRecord, LicenseRepository } from "../types.js";
import { dateFromSupabase, SupabaseRestClient } from "./supabaseRestClient.js";

type UserRow = {
  id: string;
  name: string;
  email: string;
  company: string | null;
};

type LicenseRow = {
  id: string;
  key: string;
  plan: LicensePlan;
  status: LicenseRecord["status"];
  deviceId: string | null;
  hostname: string | null;
  os: string | null;
  activatedAt: string | null;
  expiresAt: string;
  lastVerifiedAt: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
};

export class SupabaseLicenseRepository implements LicenseRepository {
  constructor(private readonly client: SupabaseRestClient) {}

  async list(): Promise<LicenseRecord[]> {
    const rows = await this.client.get<LicenseRow[]>("License", {
      select: "*",
      order: "createdAt.desc"
    });
    const users = await this.findUsers(rows.map((row) => row.userId).filter((id): id is string => Boolean(id)));
    return rows.map((row) => toLicenseRecord(row, users.get(row.userId ?? "")));
  }

  async findByKey(key: string): Promise<LicenseRecord | null> {
    const row = await this.client.getOne<LicenseRow>("License", { select: "*", key: `eq.${key}` });
    if (!row) return null;
    const user = row.userId ? await this.client.getOne<UserRow>("User", { select: "*", id: `eq.${row.userId}` }) : null;
    return toLicenseRecord(row, user ?? undefined);
  }

  async create(input: {
    key: string;
    plan: LicensePlan;
    expiresAt: Date;
    user?: { name: string; email: string; company?: string };
  }): Promise<LicenseRecord> {
    const user = input.user ? await this.upsertUser(input.user) : null;
    const now = new Date().toISOString();
    const row = await this.client.create<LicenseRow>("License", {
      key: input.key,
      plan: input.plan,
      status: "pending",
      expiresAt: input.expiresAt.toISOString(),
      userId: user?.id ?? null,
      createdAt: now,
      updatedAt: now
    });
    return toLicenseRecord(row, user ?? undefined);
  }

  async activate(key: string, input: { deviceId: string; hostname?: string; os?: string }): Promise<LicenseRecord> {
    const now = new Date().toISOString();
    return this.updateByKey(key, {
      status: "active",
      deviceId: input.deviceId,
      hostname: input.hostname ?? null,
      os: input.os ?? null,
      activatedAt: now,
      lastVerifiedAt: now
    });
  }

  touchVerification(key: string): Promise<LicenseRecord> {
    return this.updateByKey(key, { lastVerifiedAt: new Date().toISOString() });
  }

  renew(key: string, expiresAt: Date): Promise<LicenseRecord> {
    return this.updateByKey(key, { expiresAt: expiresAt.toISOString(), status: "active" });
  }

  revoke(key: string): Promise<LicenseRecord> {
    return this.updateByKey(key, { status: "revoked" });
  }

  resetDevice(key: string): Promise<LicenseRecord> {
    return this.updateByKey(key, {
      deviceId: null,
      hostname: null,
      os: null,
      activatedAt: null,
      status: "pending"
    });
  }

  private async updateByKey(key: string, body: Record<string, unknown>) {
    const row = await this.client.update<LicenseRow>("License", { key: `eq.${key}` }, body);
    const user = row.userId ? await this.client.getOne<UserRow>("User", { select: "*", id: `eq.${row.userId}` }) : null;
    return toLicenseRecord(row, user ?? undefined);
  }

  private async upsertUser(input: { name: string; email: string; company?: string }) {
    const existing = await this.client.getOne<UserRow>("User", { select: "*", email: `eq.${input.email}` });
    if (existing) {
      return this.client.update<UserRow>("User", { email: `eq.${input.email}` }, {
        name: input.name,
        company: input.company ?? null
      });
    }
    const now = new Date().toISOString();
    return this.client.create<UserRow>("User", {
      name: input.name,
      email: input.email,
      company: input.company ?? null,
      createdAt: now,
      updatedAt: now
    });
  }

  private async findUsers(userIds: string[]) {
    if (userIds.length === 0) return new Map<string, UserRow>();
    const uniqueIds = Array.from(new Set(userIds));
    const rows = await this.client.get<UserRow[]>("User", {
      select: "*",
      id: `in.(${uniqueIds.join(",")})`
    });
    return new Map(rows.map((row) => [row.id, row]));
  }
}

function toLicenseRecord(row: LicenseRow, user?: UserRow): LicenseRecord {
  return {
    id: row.id,
    key: row.key,
    plan: row.plan,
    status: row.status,
    deviceId: row.deviceId,
    hostname: row.hostname,
    os: row.os,
    activatedAt: dateFromSupabase(row.activatedAt),
    expiresAt: dateFromSupabase(row.expiresAt) ?? new Date(row.expiresAt),
    lastVerifiedAt: dateFromSupabase(row.lastVerifiedAt),
    user: user ? { name: user.name, email: user.email, company: user.company } : null,
    createdAt: dateFromSupabase(row.createdAt) ?? new Date(row.createdAt),
    updatedAt: dateFromSupabase(row.updatedAt) ?? new Date(row.updatedAt)
  };
}
