import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { addDays } from "../src/utils/dates.js";
import { defaultPackageDefinitions, packagePlans } from "../src/packages.js";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD environment variables must be set before running the seed.");
  }

  await prisma.adminUser.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: "super_admin"
    }
  });

  for (const plan of packagePlans) {
    await prisma.packageDefinition.upsert({
      where: { plan },
      update: {},
      create: defaultPackageDefinitions[plan]
    });
  }

  const user = await prisma.user.upsert({
    where: { email: "john.doe@example.com" },
    update: {},
    create: {
      name: "John Doe",
      email: "john.doe@example.com",
      company: "Demo Studio"
    }
  });

  await prisma.license.upsert({
    where: { key: "VDRP-A1B2-C3D4-E5F6-G7H8" },
    update: {},
    create: {
      key: "VDRP-A1B2-C3D4-E5F6-G7H8",
      plan: "pro",
      status: "pending",
      expiresAt: addDays(new Date(), 365),
      userId: user.id
    }
  });

  console.log(`Seeded admin ${email} / ${password}`);
  console.log("Seeded sample license VDRP-A1B2-C3D4-E5F6-G7H8");
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    process.exit(1);
  });
