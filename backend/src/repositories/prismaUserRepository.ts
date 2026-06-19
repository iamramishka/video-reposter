import type { PrismaClient } from "@prisma/client";
import type { UserRecord, UserRepository } from "../types.js";

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listActive(): Promise<UserRecord[]> {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" }
    }) as Promise<UserRecord[]>;
  }

  findById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } }) as Promise<UserRecord | null>;
  }

  findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findFirst({ where: { email, deletedAt: null } }) as Promise<UserRecord | null>;
  }

  create(input: { name: string; email: string; company?: string | null }): Promise<UserRecord> {
    return this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        company: input.company ?? null
      }
    }) as Promise<UserRecord>;
  }

  update(id: string, input: { name?: string; email?: string; company?: string | null }): Promise<UserRecord> {
    const data = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.company !== undefined ? { company: input.company } : {})
    };
    return this.prisma.user.update({
      where: { id },
      data
    }) as Promise<UserRecord>;
  }

  setDisabled(id: string, disabled: boolean): Promise<UserRecord> {
    return this.prisma.user.update({
      where: { id },
      data: { disabledAt: disabled ? new Date() : null }
    }) as Promise<UserRecord>;
  }

  async softDelete(id: string, retentionUntil: Date): Promise<UserRecord> {
    const now = new Date();
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        disabledAt: now,
        deletedAt: now,
        retentionUntil
      }
    });
    await this.prisma.license.updateMany({
      where: { userId: id, deletedAt: null },
      data: {
        status: "revoked",
        deviceId: null,
        hostname: null,
        os: null,
        deletedAt: now,
        retentionUntil
      }
    });
    return user as UserRecord;
  }
}
