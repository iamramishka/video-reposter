import type { PrismaClient } from "@prisma/client";
import type { LicensePlan, LicenseRecord, LicenseRepository } from "../types.js";

function includeUser() {
  return { user: { select: { id: true, name: true, email: true, company: true, disabledAt: true, deletedAt: true } } };
}

export class PrismaLicenseRepository implements LicenseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  list(): Promise<LicenseRecord[]> {
    return this.prisma.license.findMany({
      where: { deletedAt: null },
      include: includeUser(),
      orderBy: { createdAt: "desc" }
    }) as Promise<LicenseRecord[]>;
  }

  findByKey(key: string): Promise<LicenseRecord | null> {
    return this.prisma.license.findFirst({
      where: { key, deletedAt: null },
      include: includeUser()
    }) as Promise<LicenseRecord | null>;
  }

  async create(input: {
    key: string;
    plan: LicensePlan;
    expiresAt: Date;
    user?: { name: string; email: string; company?: string };
  }): Promise<LicenseRecord> {
    const userConnectOrCreate = input.user
      ? {
          connectOrCreate: {
            where: { email: input.user.email },
            create: {
              name: input.user.name,
              email: input.user.email,
              company: input.user.company
            }
          }
        }
      : undefined;

    return this.prisma.license.create({
      data: {
        key: input.key,
        plan: input.plan,
        expiresAt: input.expiresAt,
        status: "pending",
        user: userConnectOrCreate
      },
      include: includeUser()
    }) as Promise<LicenseRecord>;
  }

  activate(key: string, input: { deviceId: string; hostname?: string; os?: string }): Promise<LicenseRecord> {
    return this.prisma.license.update({
      where: { key },
      data: {
        status: "active",
        deviceId: input.deviceId,
        hostname: input.hostname,
        os: input.os,
        activatedAt: new Date(),
        lastVerifiedAt: new Date()
      },
      include: includeUser()
    }) as Promise<LicenseRecord>;
  }

  touchVerification(key: string): Promise<LicenseRecord> {
    return this.prisma.license.update({
      where: { key },
      data: { lastVerifiedAt: new Date() },
      include: includeUser()
    }) as Promise<LicenseRecord>;
  }

  renew(key: string, expiresAt: Date): Promise<LicenseRecord> {
    return this.prisma.license.update({
      where: { key },
      data: {
        expiresAt,
        status: "active"
      },
      include: includeUser()
    }) as Promise<LicenseRecord>;
  }

  revoke(key: string): Promise<LicenseRecord> {
    return this.prisma.license.update({
      where: { key },
      data: { status: "revoked" },
      include: includeUser()
    }) as Promise<LicenseRecord>;
  }

  restore(key: string): Promise<LicenseRecord> {
    return this.prisma.license.update({
      where: { key },
      data: { status: "pending", deviceId: null, hostname: null, os: null, activatedAt: null },
      include: includeUser()
    }) as Promise<LicenseRecord>;
  }

  softDelete(key: string, retentionUntil: Date): Promise<LicenseRecord> {
    const now = new Date();
    return this.prisma.license.update({
      where: { key },
      data: {
        deletedAt: now,
        retentionUntil,
        status: "revoked",
        deviceId: null,
        hostname: null,
        os: null
      },
      include: includeUser()
    }) as Promise<LicenseRecord>;
  }

  resetDevice(key: string): Promise<LicenseRecord> {
    return this.prisma.license.update({
      where: { key },
      data: {
        deviceId: null,
        hostname: null,
        os: null,
        activatedAt: null,
        status: "pending"
      },
      include: includeUser()
    }) as Promise<LicenseRecord>;
  }

  async updateDetails(
    key: string,
    input: {
      plan?: LicensePlan;
      expiresAt?: Date;
      user?: { name: string; email: string; company?: string };
    }
  ): Promise<LicenseRecord> {
    const user = input.user
      ? await this.prisma.user.upsert({
          where: { email: input.user.email },
          update: {
            name: input.user.name,
            company: input.user.company ?? null
          },
          create: {
            name: input.user.name,
            email: input.user.email,
            company: input.user.company ?? null
          }
        })
      : null;

    return this.prisma.license.update({
      where: { key },
      data: {
        plan: input.plan,
        expiresAt: input.expiresAt,
        userId: user?.id
      },
      include: includeUser()
    }) as Promise<LicenseRecord>;
  }
}
