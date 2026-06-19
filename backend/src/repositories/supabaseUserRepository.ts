import type { UserRecord, UserRepository } from "../types.js";
import { dateFromSupabase, SupabaseRestClient } from "./supabaseRestClient.js";

type UserRow = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  disabledAt: string | null;
  deletedAt: string | null;
  retentionUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

export class SupabaseUserRepository implements UserRepository {
  constructor(private readonly client: SupabaseRestClient) {}

  async listActive(): Promise<UserRecord[]> {
    const rows = await this.client.get<UserRow[]>("User", {
      select: "*",
      deletedAt: "is.null",
      order: "createdAt.desc"
    });
    return rows.map(toUserRecord);
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = await this.client.getOne<UserRow>("User", { select: "*", id: `eq.${id}`, deletedAt: "is.null" });
    return row ? toUserRecord(row) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.client.getOne<UserRow>("User", { select: "*", email: `eq.${email}`, deletedAt: "is.null" });
    return row ? toUserRecord(row) : null;
  }

  async create(input: { name: string; email: string; company?: string | null }): Promise<UserRecord> {
    const now = new Date().toISOString();
    const row = await this.client.create<UserRow>("User", {
      name: input.name,
      email: input.email,
      company: input.company ?? null,
      disabledAt: null,
      deletedAt: null,
      retentionUntil: null,
      createdAt: now,
      updatedAt: now
    });
    return toUserRecord(row);
  }

  async update(id: string, input: { name?: string; email?: string; company?: string | null }): Promise<UserRecord> {
    const row = await this.client.update<UserRow>("User", { id: `eq.${id}` }, {
      name: input.name,
      email: input.email,
      company: input.company ?? null
    });
    return toUserRecord(row);
  }

  async setDisabled(id: string, disabled: boolean): Promise<UserRecord> {
    const row = await this.client.update<UserRow>("User", { id: `eq.${id}` }, {
      disabledAt: disabled ? new Date().toISOString() : null
    });
    return toUserRecord(row);
  }

  async softDelete(id: string, retentionUntil: Date): Promise<UserRecord> {
    const now = new Date().toISOString();
    const retention = retentionUntil.toISOString();
    const row = await this.client.update<UserRow>("User", { id: `eq.${id}` }, {
      disabledAt: now,
      deletedAt: now,
      retentionUntil: retention
    });
    await this.client.updateMany("License", { userId: `eq.${id}`, deletedAt: "is.null" }, {
      status: "revoked",
      deviceId: null,
      hostname: null,
      os: null,
      deletedAt: now,
      retentionUntil: retention
    });
    return toUserRecord(row);
  }
}

function toUserRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    disabledAt: dateFromSupabase(row.disabledAt),
    deletedAt: dateFromSupabase(row.deletedAt),
    retentionUntil: dateFromSupabase(row.retentionUntil),
    createdAt: dateFromSupabase(row.createdAt) ?? new Date(row.createdAt),
    updatedAt: dateFromSupabase(row.updatedAt) ?? new Date(row.updatedAt)
  };
}
