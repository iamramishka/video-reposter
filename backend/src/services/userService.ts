import { z } from "zod";
import { addDays, isExpired } from "../utils/dates.js";
import type { AuditActor, AuditRepository, LicenseRepository, LicenseStatus, UserRecord, UserRepository } from "../types.js";

export class UserError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export const userCreateSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  company: z.string().optional()
});

export const userUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.email().optional(),
  company: z.string().nullable().optional()
});

export const userDisableSchema = z.object({
  disabled: z.boolean()
});

export const retentionSchema = z.object({
  retentionDays: z.number().int().min(1).max(3650).default(30)
});

type UserSummary = ReturnType<typeof toUserResponse> & {
  license_count: number;
  active_count: number;
  pending_count: number;
  expired_count: number;
  revoked_count: number;
  latest_activation: string | null;
};

export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly licenseRepository: LicenseRepository,
    private readonly auditRepository?: AuditRepository
  ) {}

  async listUsers(): Promise<UserSummary[]> {
    const [users, licenses] = await Promise.all([
      this.userRepository.listActive(),
      this.licenseRepository.list()
    ]);

    return users.map((user) => {
      const userLicenses = licenses.filter((license) => license.user?.id === user.id || license.user?.email === user.email);
      const initial = {
        ...toUserResponse(user),
        license_count: userLicenses.length,
        active_count: 0,
        pending_count: 0,
        expired_count: 0,
        revoked_count: 0,
        latest_activation: null as string | null
      };

      return userLicenses.reduce((summary, license) => {
        const status: LicenseStatus = license.status === "revoked" ? "revoked" : isExpired(license.expiresAt) ? "expired" : license.status;
        if (status === "active") summary.active_count += 1;
        if (status === "pending") summary.pending_count += 1;
        if (status === "expired") summary.expired_count += 1;
        if (status === "revoked") summary.revoked_count += 1;
        if (license.activatedAt && (!summary.latest_activation || license.activatedAt > new Date(summary.latest_activation))) {
          summary.latest_activation = license.activatedAt.toISOString();
        }
        return summary;
      }, initial);
    }).sort((a, b) => b.license_count - a.license_count || a.email.localeCompare(b.email));
  }

  async createUser(input: z.infer<typeof userCreateSchema>, actor?: AuditActor) {
    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) throw new UserError("USER_EMAIL_EXISTS", 409, "A user with this email already exists");
    const user = await this.userRepository.create(input);
    await this.audit("user.created", user, { email: user.email }, actor);
    return toUserResponse(user);
  }

  async updateUser(id: string, input: z.infer<typeof userUpdateSchema>, actor?: AuditActor) {
    const existing = await this.requireUser(id);
    if (input.email && input.email !== existing.email) {
      const duplicate = await this.userRepository.findByEmail(input.email);
      if (duplicate && duplicate.id !== id) throw new UserError("USER_EMAIL_EXISTS", 409, "A user with this email already exists");
    }
    const user = await this.userRepository.update(id, input);
    await this.audit("user.updated", user, { previousEmail: existing.email, email: user.email }, actor);
    return toUserResponse(user);
  }

  async setDisabled(id: string, disabled: boolean, actor?: AuditActor) {
    await this.requireUser(id);
    const user = await this.userRepository.setDisabled(id, disabled);
    await this.audit(disabled ? "user.disabled" : "user.enabled", user, { disabled }, actor);
    return toUserResponse(user);
  }

  async softDeleteUser(id: string, retentionDays = 30, actor?: AuditActor) {
    await this.requireUser(id);
    const retentionUntil = addDays(new Date(), retentionDays);
    const user = await this.userRepository.softDelete(id, retentionUntil);
    await this.audit("user.soft_deleted", user, { retentionDays, retentionUntil: retentionUntil.toISOString() }, actor);
    return toUserResponse(user);
  }

  private async requireUser(id: string) {
    const user = await this.userRepository.findById(id);
    if (!user) throw new UserError("USER_NOT_FOUND", 404, "User not found");
    return user;
  }

  private async audit(action: string, user: UserRecord, metadata?: Record<string, unknown>, actor?: AuditActor) {
    await this.auditRepository?.record({
      action,
      subjectType: "admin",
      subjectId: user.id,
      adminUserId: actor?.adminUserId,
      adminEmail: actor?.adminEmail,
      metadata
    });
  }
}

function toUserResponse(user: UserRecord) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    company: user.company,
    disabled_at: user.disabledAt?.toISOString() ?? null,
    deleted_at: user.deletedAt?.toISOString() ?? null,
    retention_until: user.retentionUntil?.toISOString() ?? null,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString()
  };
}
