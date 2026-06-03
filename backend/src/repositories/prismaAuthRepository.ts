import type { PrismaClient } from "@prisma/client";
import type { AuthRepository } from "../types.js";

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findAdminByEmail(email: string) {
    return this.prisma.adminUser.findUnique({ where: { email } });
  }

  findAdminById(id: string) {
    return this.prisma.adminUser.findUnique({ where: { id } });
  }

  async updateAdminPassword(id: string, passwordHash: string) {
    await this.prisma.adminUser.update({ where: { id }, data: { passwordHash } });
  }
}
