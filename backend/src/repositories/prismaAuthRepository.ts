import type { PrismaClient } from "@prisma/client";

export class PrismaAuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findAdminByEmail(email: string) {
    return this.prisma.adminUser.findUnique({ where: { email } });
  }
}
