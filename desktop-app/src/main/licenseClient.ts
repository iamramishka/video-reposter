import type { CachedLicense, DeviceInfo } from "../shared/license.js";
import { isProcessingTelemetryPayload } from "../shared/telemetry.js";
import type { ProcessingTelemetryPayload } from "../shared/telemetry.js";

export interface ActivationResult {
  ok: boolean;
  license?: CachedLicense;
  code?: string;
  message?: string;
}

export class LicenseClient {
  constructor(private readonly serverUrl: string) {}

  async activate(key: string, device: DeviceInfo): Promise<ActivationResult> {
    try {
      const response = await fetch(`${this.serverUrl}/api/license/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          device_id: device.deviceId,
          hostname: device.deviceName,
          os: device.os,
          app_version: "0.1.0"
        }),
        signal: AbortSignal.timeout(8000)
      });
      const body = await response.json();
      if (!response.ok) {
        return { ok: false, code: body.code ?? "API_ERROR", message: body.message ?? "Activation failed" };
      }
      return { ok: true, license: body as CachedLicense };
    } catch {
      return { ok: false, code: "LIC_005", message: "License server unreachable. Check your connection and try again." };
    }
  }

  async validate(key: string, device: DeviceInfo): Promise<ActivationResult> {
    try {
      const response = await fetch(`${this.serverUrl}/api/license/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, device_id: device.deviceId, app_version: "0.1.0" }),
        signal: AbortSignal.timeout(8000)
      });
      const body = await response.json();
      if (!response.ok) return { ok: false, code: body.code, message: body.message };
      return { ok: true, license: body as CachedLicense };
    } catch {
      return { ok: false, code: "LIC_005", message: "License server unreachable." };
    }
  }

  async sendProcessingTelemetry(licenseKey: string, payload: ProcessingTelemetryPayload): Promise<boolean> {
    if (!licenseKey || !isProcessingTelemetryPayload(payload)) return false;
    try {
      const response = await fetch(`${this.serverUrl}/api/telemetry/processing`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${licenseKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000)
      });
      return response.ok || response.status === 202;
    } catch {
      return false;
    }
  }
}
