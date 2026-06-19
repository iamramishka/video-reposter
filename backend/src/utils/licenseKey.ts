import crypto from "node:crypto";

export const LICENSE_KEY_PATTERN = /^VDRP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export function isLicenseKey(value: string) {
  return LICENSE_KEY_PATTERN.test(value.trim().toUpperCase());
}

export function normalizeLicenseKey(value: string) {
  return value.trim().toUpperCase();
}

export function timingSafeLicenseKeyEqual(left: string, right: string) {
  const leftHash = crypto.createHash("sha256").update(normalizeLicenseKey(left)).digest();
  const rightHash = crypto.createHash("sha256").update(normalizeLicenseKey(right)).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

export function generateLicenseKey() {
  const parts = Array.from({ length: 4 }, () =>
    crypto.randomBytes(2).toString("hex").toUpperCase()
  );
  return `VDRP-${parts.join("-")}`;
}
