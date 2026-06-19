import { prisma } from "../db.js";
import { PrismaAuditRepository } from "../repositories/prismaAuditRepository.js";
import { PrismaLicenseRepository } from "../repositories/prismaLicenseRepository.js";
import { PrismaPackageRepository } from "../repositories/prismaPackageRepository.js";
import { EmailService } from "../services/emailService.js";
import { LicenseService } from "../services/licenseService.js";

async function main() {
  const auditRepository = new PrismaAuditRepository(prisma);
  const service = new LicenseService(
    new PrismaLicenseRepository(prisma),
    auditRepository,
    new PrismaPackageRepository(prisma),
    new EmailService()
  );

  const summary = await service.sendExpiryReminders();
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error("[expiry-reminders] failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
