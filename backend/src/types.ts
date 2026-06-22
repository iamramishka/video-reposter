export type LicenseStatus = "pending" | "active" | "expired" | "revoked";
export type LicensePlan = "starter" | "pro" | "enterprise";
export type AdminRole = "super_admin" | "admin" | "read_only";
export type ProcessingTelemetryStatus = "complete" | "failed";

export interface PackageDefinition {
  plan: LicensePlan;
  videoLimit: number;
  templateLimit: number;
  workerLimit: number;
  updatedAt: Date;
}

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
    id?: string;
    name: string;
    email: string;
    company: string | null;
    disabledAt?: Date | null;
    deletedAt?: Date | null;
  } | null;
  deletedAt?: Date | null;
  retentionUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  company: string | null;
  disabledAt: Date | null;
  deletedAt: Date | null;
  retentionUntil: Date | null;
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
  restore(key: string): Promise<LicenseRecord>;
  softDelete(key: string, retentionUntil: Date): Promise<LicenseRecord>;
  resetDevice(key: string): Promise<LicenseRecord>;
  updateDetails(
    key: string,
    input: {
      plan?: LicensePlan;
      expiresAt?: Date;
      user?: { name: string; email: string; company?: string };
    }
  ): Promise<LicenseRecord>;
}

export interface UserRepository {
  listActive(): Promise<UserRecord[]>;
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  create(input: { name: string; email: string; company?: string | null }): Promise<UserRecord>;
  update(id: string, input: { name?: string; email?: string; company?: string | null }): Promise<UserRecord>;
  setDisabled(id: string, disabled: boolean): Promise<UserRecord>;
  softDelete(id: string, retentionUntil: Date): Promise<UserRecord>;
}

export interface ProcessingTelemetryRecord {
  id: string;
  jobId: string;
  status: ProcessingTelemetryStatus;
  preset: string;
  elapsedMs: number;
  throughputMbPerMin: number | null;
  inputSizeBytes: number | null;
  errorCode: string | null;
  createdAt: Date;
}

export interface ProcessingTelemetryRepository {
  create(input: {
    jobId: string;
    status: ProcessingTelemetryStatus;
    preset: string;
    elapsedMs: number;
    throughputMbPerMin?: number | null;
    inputSizeBytes?: number | null;
    errorCode?: string | null;
  }): Promise<ProcessingTelemetryRecord>;
  listRecent(limit: number): Promise<ProcessingTelemetryRecord[]>;
}

export interface PackageRepository {
  list(): Promise<PackageDefinition[]>;
  upsert(input: {
    plan: LicensePlan;
    videoLimit: number;
    templateLimit: number;
    workerLimit: number;
  }): Promise<PackageDefinition>;
}

export interface AdminAuthRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: AdminRole;
}

export interface AuthRepository {
  findAdminByEmail(email: string): Promise<AdminAuthRecord | null>;
  findAdminById(id: string): Promise<AdminAuthRecord | null>;
  updateAdminPassword(id: string, passwordHash: string): Promise<void>;
}

export interface AuditRepository {
  record(input: {
    action: string;
    subjectType: "license" | "admin";
    subjectId?: string | null;
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
  adminRole?: string;
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
