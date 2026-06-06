import type { AuditActor, AuditRepository, LicensePlan, PackageRepository } from "../types.js";
import { mergePackageDefaults } from "../packages.js";

export class PackageService {
  constructor(
    private readonly repository: PackageRepository,
    private readonly auditRepository?: AuditRepository
  ) {}

  async listPackages() {
    return mergePackageDefaults(await this.repository.list()).map(toResponse);
  }

  async updatePackage(
    plan: LicensePlan,
    input: { videoLimit: number; templateLimit: number; workerLimit: number },
    actor?: AuditActor
  ) {
    const previous = mergePackageDefaults(await this.repository.list()).find((definition) => definition.plan === plan);
    const updated = await this.repository.upsert({ plan, ...input });
    await this.auditRepository?.record({
      action: "package.updated",
      subjectType: "admin",
      subjectId: plan,
      adminUserId: actor?.adminUserId,
      adminEmail: actor?.adminEmail,
      metadata: {
        previous,
        package: toResponse(updated)
      }
    });
    return toResponse(updated);
  }
}

function toResponse(definition: {
  plan: LicensePlan;
  videoLimit: number;
  templateLimit: number;
  workerLimit: number;
  updatedAt: Date;
}) {
  return {
    plan: definition.plan,
    video_limit: definition.videoLimit,
    template_limit: definition.templateLimit,
    worker_limit: definition.workerLimit,
    updated_at: definition.updatedAt.toISOString()
  };
}
