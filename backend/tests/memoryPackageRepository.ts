import { mergePackageDefaults } from "../src/packages.js";
import type { LicensePlan, PackageDefinition, PackageRepository } from "../src/types.js";

export class MemoryPackageRepository implements PackageRepository {
  private definitions = new Map<LicensePlan, PackageDefinition>();

  constructor(seed: PackageDefinition[] = []) {
    for (const definition of seed) this.definitions.set(definition.plan, definition);
  }

  async list() {
    return mergePackageDefaults([...this.definitions.values()]);
  }

  async upsert(input: {
    plan: LicensePlan;
    videoLimit: number;
    templateLimit: number;
    workerLimit: number;
  }) {
    const definition = { ...input, updatedAt: new Date() };
    this.definitions.set(input.plan, definition);
    return definition;
  }
}
