export type LicenseStatus = "pending" | "active" | "expired" | "revoked";
export type LicensePlan = "starter" | "pro" | "enterprise";

export interface LicenseRecord {
  id: string;
  key: string;
  plan: LicensePlan;
  status: LicenseStatus;
  deviceId: string | null;
  hostname: string | null;
  os: string | null;
  activatedAt: Date | null;
  expiresAt: Date;
  lastVerifiedAt: Date | null;
  user?: {
    name: string;
    email: string;
    company: string | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LicenseRepository {
  list(): Promise<LicenseRecord[]>;
  findByKey(key: string): Promise<LicenseRecord | null>;
  create(input: {
    key: string;
    plan: LicensePlan;
    expiresAt: Date;
    user?: { name: string; email: string; company?: string };
  }): Promise<LicenseRecord>;
  activate(key: string, input: { deviceId: string; hostname?: string; os?: string }): Promise<LicenseRecord>;
  touchVerification(key: string): Promise<LicenseRecord>;
  renew(key: string, expiresAt: Date): Promise<LicenseRecord>;
  revoke(key: string): Promise<LicenseRecord>;
  resetDevice(key: string): Promise<LicenseRecord>;
}

export interface AuditRepository {
  record(input: {
    action: string;
    subjectType: "license";
    subjectId?: string;
    licenseId?: string;
    adminUserId?: string;
    adminEmail?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  listRecent(limit: number): Promise<AuditEntry[]>;
}

export interface AuditActor {
  adminUserId?: string;
  adminEmail?: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  subjectType: string;
  subjectId: string | null;
  licenseId: string | null;
  licenseKey: string | null;
  adminUserId: string | null;
  adminUserEmail: string | null;
  metadata: unknown;
  createdAt: Date;
}
