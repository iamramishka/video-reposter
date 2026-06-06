import type { AuditEntry, AuditRepository } from "../src/types.js";

export class MemoryAuditRepository implements AuditRepository {
  entries: AuditEntry[] = [];

  async record(input: {
    action: string;
    subjectType: "license" | "admin";
    subjectId?: string | null;
    licenseId?: string;
    adminUserId?: string;
    adminEmail?: string;
    metadata?: Record<string, unknown>;
  }) {
    this.entries.push({
      id: `audit_${this.entries.length + 1}`,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId ?? null,
      licenseId: input.licenseId ?? null,
      licenseKey: input.subjectId ?? null,
      adminUserId: input.adminUserId ?? null,
      adminUserEmail: input.adminEmail ?? null,
      metadata: input.metadata ?? null,
      createdAt: new Date()
    });
  }

  async listRecent(limit: number) {
    return [...this.entries].reverse().slice(0, limit);
  }
}
