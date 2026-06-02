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

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  os: string;
}

export function normalizeLicenseKey(value: string) {
  return value.trim().toUpperCase();
}

export function isLicenseKey(value: string) {
  return LICENSE_KEY_PATTERN.test(normalizeLicenseKey(value));
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
