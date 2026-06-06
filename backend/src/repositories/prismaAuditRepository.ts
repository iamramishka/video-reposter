import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditRepository } from "../types.js";

function toJsonMetadata(metadata?: Record<string, unknown>): Prisma.InputJsonValue | undefined {
  if (!metadata) return undefined;
  return JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue;
}

export class PrismaAuditRepository implements AuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listRecent(limit: number) {
    const entries = await this.prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        adminUser: { select: { email: true } },
        license: { select: { key: true } }
      }
    });

    return entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      subjectType: entry.subjectType,
      subjectId: entry.subjectId,
      licenseId: entry.licenseId,
      licenseKey: entry.license?.key ?? null,
      adminUserId: entry.adminUserId,
      adminUserEmail: entry.adminUser?.email ?? null,
      metadata: entry.metadata,
      createdAt: entry.createdAt
    }));
  }

  async record(input: {
    action: string;
    subjectType: "license" | "admin";
    subjectId?: string | null;
    licenseId?: string;
    adminUserId?: string;
    adminEmail?: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.prisma.auditLog.create({
      data: {
        action: input.action,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        licenseId: input.licenseId,
        adminUserId: input.adminUserId,
        metadata: toJsonMetadata(input.metadata)
      }
    });
  }
}
