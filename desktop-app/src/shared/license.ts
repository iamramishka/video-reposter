export const LICENSE_KEY_PATTERN = /^VDRP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
export const OFFLINE_GRACE_MS = 72 * 60 * 60 * 1000;
export const EXPIRED_GRACE_MS = 24 * 60 * 60 * 1000;

export type LicenseState =
  | "NO_LICENSE"
  | "VALID"
  | "VALID_FROM_CACHE"
  | "EXPIRED_GRACE"
  | "EXPIRED"
  | "REVOKED"
  | "DEVICE_MISMATCH"
  | "NETWORK_ERROR"
  | "ERROR";

export interface CachedLicense {
  license_key: string;
  plan: "starter" | "pro" | "enterprise";
  package_limits?: PackageLimits;
  status: "pending" | "active" | "expired" | "revoked";
  device_id: string;
  expires_at: string;
  activated_at: string | null;
  last_verified: string;
  user?: {
    name: string;
    email: string;
    company: string | null;
  } | null;
}

export interface PackageLimits {
  video_limit: number;
  template_limit: number;
  worker_limit: number;
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  os: string;
}

export const defaultPackageLimits: Record<CachedLicense["plan"], PackageLimits> = {
  starter: { video_limit: 5, template_limit: 2, worker_limit: 1 },
  pro: { video_limit: 50, template_limit: 5, worker_limit: 2 },
  enterprise: { video_limit: 500, template_limit: 5, worker_limit: 4 }
};

export function packageLimitsForLicense(license: CachedLicense | null): PackageLimits {
  const fallback = defaultPackageLimits[license?.plan ?? "pro"];
  return {
    video_limit: normalizeLimit(license?.package_limits?.video_limit, fallback.video_limit),
    template_limit: normalizeLimit(license?.package_limits?.template_limit, fallback.template_limit),
    worker_limit: normalizeLimit(license?.package_limits?.worker_limit, fallback.worker_limit)
  };
}

export function licenseStateLabel(state: LicenseState) {
  if (state === "VALID") return "Active";
  if (state === "VALID_FROM_CACHE") return "Offline access";
  if (state === "EXPIRED_GRACE") return "Expiry grace";
  if (state === "EXPIRED") return "Expired";
  if (state === "REVOKED") return "Revoked";
  if (state === "DEVICE_MISMATCH") return "Different device";
  if (state === "NETWORK_ERROR") return "Verification needed";
  if (state === "NO_LICENSE") return "Not activated";
  return "Needs attention";
}

export function licenseRefreshDescription(state: LicenseState) {
  if (state === "VALID") return "Verified online. Package limits are current.";
  if (state === "VALID_FROM_CACHE") return "Using encrypted offline cache. Cached package limits remain active until online validation succeeds.";
  if (state === "EXPIRED_GRACE") return "Using the encrypted cache during the short expiry grace period. Renew the license to keep access.";
  return "Online license verification is required.";
}

export function normalizeLicenseKey(value: string) {
  return value.trim().toUpperCase();
}

export function isLicenseKey(value: string) {
  return LICENSE_KEY_PATTERN.test(normalizeLicenseKey(value));
}

function normalizeLimit(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) && next >= 1 ? Math.round(next) : fallback;
}

export function stateFromCache(cache: CachedLicense | null, now = Date.now()): LicenseState {
  if (!cache) return "NO_LICENSE";
  if (cache.status === "revoked") return "REVOKED";

  const expiresAt = new Date(cache.expires_at).getTime();
  if (Number.isNaN(expiresAt)) return "ERROR";

  if (expiresAt <= now) {
    return now - expiresAt <= EXPIRED_GRACE_MS ? "EXPIRED_GRACE" : "EXPIRED";
  }

  const lastVerified = new Date(cache.last_verified).getTime();
  if (Number.isNaN(lastVerified)) return "ERROR";
  return now - lastVerified <= OFFLINE_GRACE_MS ? "VALID_FROM_CACHE" : "NETWORK_ERROR";
}
