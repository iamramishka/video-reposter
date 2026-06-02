import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decryptLicenseCache, encryptLicenseCache, readLicenseCache, writeLicenseCache } from "../src/main/licenseCache.js";
import type { CachedLicense } from "../src/shared/license.js";
import { stateFromCache } from "../src/shared/license.js";

const cache: CachedLicense = {
  license_key: "VDRP-A1B2-C3D4-E5F6-G7H8",
  plan: "pro",
  status: "active",
  device_id: "device-1234567890",
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  activated_at: new Date().toISOString(),
  last_verified: new Date().toISOString(),
  user: null
};

describe("license cache", () => {
  it("encrypts and decrypts AES-GCM cache payloads", () => {
    const encrypted = encryptLicenseCache(cache, cache.device_id);
    expect(encrypted).not.toContain(cache.license_key);
    expect(decryptLicenseCache(encrypted, cache.device_id)).toEqual(cache);
  });

  it("writes and reads the encrypted cache", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vr-cache-"));
    try {
      writeLicenseCache(dir, cache);
      expect(readLicenseCache(dir, cache.device_id)).toEqual(cache);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("maps cache dates to license state", () => {
    expect(stateFromCache(cache)).toBe("VALID_FROM_CACHE");
    expect(stateFromCache({ ...cache, status: "revoked" })).toBe("REVOKED");
    expect(stateFromCache({ ...cache, expires_at: new Date(Date.now() - 90_000).toISOString() })).toBe("EXPIRED_GRACE");
  });
});
