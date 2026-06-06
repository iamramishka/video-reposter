import type { LicensePlan, PackageDefinition, PackageRepository } from "../types.js";
import { dateFromSupabase, SupabaseRestClient } from "./supabaseRestClient.js";

type PackageDefinitionRow = {
  plan: LicensePlan;
  videoLimit: number;
  templateLimit: number;
  workerLimit: number;
  updatedAt: string;
};

export class SupabasePackageRepository implements PackageRepository {
  constructor(private readonly client: SupabaseRestClient) {}

  async list(): Promise<PackageDefinition[]> {
    const rows = await this.client.get<PackageDefinitionRow[]>("PackageDefinition", {
      select: "*",
      order: "plan.asc"
    });
    return rows.map(toPackageDefinition);
  }

  async upsert(input: {
    plan: LicensePlan;
    videoLimit: number;
    templateLimit: number;
    workerLimit: number;
  }): Promise<PackageDefinition> {
    const existing = await this.client.getOne<PackageDefinitionRow>("PackageDefinition", { select: "*", plan: `eq.${input.plan}` });
    const now = new Date().toISOString();
    const row = existing
      ? await this.client.update<PackageDefinitionRow>("PackageDefinition", { plan: `eq.${input.plan}` }, input)
      : await this.client.create<PackageDefinitionRow>("PackageDefinition", { ...input, updatedAt: now });
    return toPackageDefinition(row);
  }
}

function toPackageDefinition(row: PackageDefinitionRow): PackageDefinition {
  return {
    plan: row.plan,
    videoLimit: row.videoLimit,
    templateLimit: row.templateLimit,
    workerLimit: row.workerLimit,
    updatedAt: dateFromSupabase(row.updatedAt) ?? new Date(row.updatedAt)
  };
}
