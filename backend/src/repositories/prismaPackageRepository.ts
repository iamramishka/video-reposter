import type { PrismaClient } from "@prisma/client";
import type { PackageDefinition, PackageRepository } from "../types.js";

export class PrismaPackageRepository implements PackageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  list(): Promise<PackageDefinition[]> {
    return this.prisma.packageDefinition.findMany({ orderBy: { plan: "asc" } }) as Promise<PackageDefinition[]>;
  }

  upsert(input: {
    plan: PackageDefinition["plan"];
    videoLimit: number;
    templateLimit: number;
    workerLimit: number;
  }): Promise<PackageDefinition> {
    return this.prisma.packageDefinition.upsert({
      where: { plan: input.plan },
      create: input,
      update: {
        videoLimit: input.videoLimit,
        templateLimit: input.templateLimit,
        workerLimit: input.workerLimit
      }
    }) as Promise<PackageDefinition>;
  }
}
