import type { LicensePlan, PackageDefinition } from "./types.js";

export const packagePlans: LicensePlan[] = ["starter", "pro", "enterprise"];

export const defaultPackageDefinitions: Record<LicensePlan, Omit<PackageDefinition, "updatedAt">> = {
  starter: { plan: "starter", videoLimit: 5, templateLimit: 2, workerLimit: 1 },
  pro: { plan: "pro", videoLimit: 50, templateLimit: 5, workerLimit: 2 },
  enterprise: { plan: "enterprise", videoLimit: 500, templateLimit: 5, workerLimit: 4 }
};

export function mergePackageDefaults(definitions: PackageDefinition[]) {
  const byPlan = new Map(definitions.map((definition) => [definition.plan, definition]));
  const now = new Date(0);
  return packagePlans.map((plan) => byPlan.get(plan) ?? { ...defaultPackageDefinitions[plan], updatedAt: now });
}

export function packageForPlan(definitions: PackageDefinition[], plan: LicensePlan) {
  return mergePackageDefaults(definitions).find((definition) => definition.plan === plan) ?? { ...defaultPackageDefinitions[plan], updatedAt: new Date(0) };
}
