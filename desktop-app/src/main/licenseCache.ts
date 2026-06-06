import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CachedLicense } from "../shared/license.js";

export function getCachePath(appDataPath: string) {
  return path.join(appDataPath, "license.enc");
}

function deriveKey(deviceId: string) {
  return crypto
    .createHash("sha256")
    .update(`${deviceId}:${process.env.LICENSE_CACHE_SECRET ?? "video-reposter-mvp"}`)
    .digest();
}

export function encryptLicenseCache(cache: CachedLicense, deviceId: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(deviceId), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(cache), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptLicenseCache(payload: string, deviceId: string): CachedLicense {
  const [ivHex, tagHex, ciphertextHex] = payload.split(":");
  if (!ivHex || !tagHex || !ciphertextHex) throw new Error("Invalid cache format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(deviceId), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final()
  ]).toString("utf8");
  return JSON.parse(plaintext) as CachedLicense;
}

export function readLicenseCache(appDataPath: string, deviceId: string) {
  const cachePath = getCachePath(appDataPath);
  if (!fs.existsSync(cachePath)) return null;
  try {
    return decryptLicenseCache(fs.readFileSync(cachePath, "utf8"), deviceId);
  } catch {
    // Corrupt or unreadable cache (e.g. AES-GCM auth tag failure, device ID mismatch).
    // Treat as no license rather than crashing the app.
    return null;
  }
}

export function writeLicenseCache(appDataPath: string, cache: CachedLicense) {
  fs.mkdirSync(appDataPath, { recursive: true });
  fs.writeFileSync(getCachePath(appDataPath), encryptLicenseCache(cache, cache.device_id), "utf8");
}

export function getStableDeviceId(appDataPath: string) {
  fs.mkdirSync(appDataPath, { recursive: true });
  const fallbackPath = path.join(appDataPath, "device-id.txt");
  const rawParts = [
    os.hostname(),
    os.userInfo().username,
    os.arch(),
    os.platform(),
    os.cpus()[0]?.model
  ].filter(Boolean);

  if (rawParts.length >= 3) {
    return crypto.createHash("sha256").update(rawParts.join(":")).digest("hex");
  }

  if (fs.existsSync(fallbackPath)) return fs.readFileSync(fallbackPath, "utf8");
  const generated = crypto.randomUUID();
  fs.writeFileSync(fallbackPath, generated, "utf8");
  return generated;
}
