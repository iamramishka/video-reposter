import type { AuditEntry, AuditRepository } from "../types.js";
import { dateFromSupabase, SupabaseRestClient } from "./supabaseRestClient.js";

type AuditRow = {
  id: string;
  action: string;
  subjectType: string;
  subjectId: string | null;
  metadata: unknown;
  adminUserId: string | null;
  licenseId: string | null;
  createdAt: string;
};

type AdminRow = {
  id: string;
  email: string;
};

type LicenseRow = {
  id: string;
  key: string;
};

export class SupabaseAuditRepository implements AuditRepository {
  constructor(private readonly client: SupabaseRestClient) {}

  async record(input: {
    action: string;
    subjectType: "license" | "admin";
    subjectId?: string | null;
    licenseId?: string;
    adminUserId?: string;
    adminEmail?: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.client.create<AuditRow>("AuditLog", {
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId ?? null,
      licenseId: input.licenseId ?? null,
      adminUserId: input.adminUserId ?? null,
      metadata: input.metadata ?? null,
      createdAt: new Date().toISOString()
    });
  }

  async listRecent(limit: number): Promise<AuditEntry[]> {
    const rows = await this.client.get<AuditRow[]>("AuditLog", {
      select: "*",
      order: "createdAt.desc",
      limit
    });
    const adminUsers = await this.findAdmins(rows.map((row) => row.adminUserId).filter((id): id is string => Boolean(id)));
    const licenses = await this.findLicenses(rows.map((row) => row.licenseId).filter((id): id is string => Boolean(id)));

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      licenseId: row.licenseId,
      licenseKey: licenses.get(row.licenseId ?? "")?.key ?? null,
      adminUserId: row.adminUserId,
      adminUserEmail: adminUsers.get(row.adminUserId ?? "")?.email ?? null,
      metadata: row.metadata,
      createdAt: dateFromSupabase(row.createdAt) ?? new Date(row.createdAt)
    }));
  }

  private async findAdmins(ids: string[]) {
    if (ids.length === 0) return new Map<string, AdminRow>();
    const rows = await this.client.get<AdminRow[]>("AdminUser", {
      select: "id,email",
      id: `in.(${Array.from(new Set(ids)).join(",")})`
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async findLicenses(ids: string[]) {
    if (ids.length === 0) return new Map<string, LicenseRow>();
    const rows = await this.client.get<LicenseRow[]>("License", {
      select: "id,key",
      id: `in.(${Array.from(new Set(ids)).join(",")})`
    });
    return new Map(rows.map((row) => [row.id, row]));
  }
}
