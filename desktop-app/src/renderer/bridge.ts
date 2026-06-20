import { platformPresets } from "../shared/processing";
import type { CachedLicense, DeviceInfo, LicenseState } from "../shared/license";
import type { FfmpegJob, ImportedVideoFile, OutputNamingOptions, OutputOverrides, PlatformPreset, TransformSettings } from "../shared/processing";
import type { ProbeResult, ProcessingJobRequest, ProcessingUpdate } from "../main/processingService";
import { componentUnavailableFailure, invalidVideoFailure } from "../shared/processingFailure";
import type { ProcessingAvailability, ProcessingFailureResult } from "../shared/processingFailure";
import type { ProcessingTelemetryPayload } from "../shared/telemetry";

export type VideoReposterBridge = {
  getDeviceInfo(): Promise<DeviceInfo>;
  getLicenseStatus(): Promise<{ state: LicenseState; license: CachedLicense | null }>;
  activateLicense(key: string): Promise<{ ok: boolean; code?: string; message?: string; license?: unknown }>;
  openExternal(url: string): Promise<void>;
  showItemInFolder(path: string): Promise<void>;
  getVideoPreviewUrl(path: string): Promise<string | null>;
  getProcessingPresets(): Promise<PlatformPreset[]>;
  appendProcessingLog(message: string): Promise<string>;
  getProcessingLogPath(): Promise<string>;
  openProcessingLog(): Promise<string>;
  checkFfmpeg(): Promise<ProcessingAvailability>;
  probeVideoFile(path: string): Promise<ProbeResult>;
  buildProcessingCommand(job: FfmpegJob): Promise<string>;
  startProcessingJob(job: ProcessingJobRequest): Promise<{ id: string; args: string[] }>;
  startProcessingFile(
    path: string,
    presetId: string,
    outputDir?: string,
    transforms?: TransformSettings,
    outputNaming?: OutputNamingOptions,
    outputOverrides?: OutputOverrides
  ): Promise<{ ok: true; id: string; args: string[]; outputPath: string; probe: ProbeResult; preset: PlatformPreset } | ProcessingFailureResult>;
  stopProcessingJob(id: string): Promise<boolean>;
  selectVideoFiles(): Promise<ImportedVideoFile[]>;
  selectVideoFolder(): Promise<ImportedVideoFile[]>;
  selectOutputFolder(): Promise<string | null>;
  sendProcessingTelemetry(licenseKey: string, payload: ProcessingTelemetryPayload): Promise<boolean>;
  onProcessingUpdate(callback: (update: ProcessingUpdate) => void): () => void;
};

const localApiBase = "/api/local";
export type BridgeMode = "electron" | "local-worker" | "preview";

export function createVideoReposterBridge(): VideoReposterBridge {
  const mode = getBridgeMode();
  if (mode === "electron") return window.videoReposter!;
  if (mode === "local-worker") return createLocalWorkerBridge();
  return createPreviewBridge();
}

export function hasElectronBridge(windowLike: Pick<Window, "videoReposter"> = window) {
  return Boolean(windowLike.videoReposter);
}

export function getBridgeMode(
  locationLike: Pick<Location, "hostname" | "protocol"> = window.location,
  windowLike: Pick<Window, "videoReposter"> = window
): BridgeMode {
  if (hasElectronBridge(windowLike)) return "electron";
  return isLocalWorkerAvailable(locationLike) ? "local-worker" : "preview";
}

export function usesNativeFileDialogs(mode: BridgeMode = getBridgeMode()) {
  return mode === "electron" || mode === "local-worker";
}

export function isLocalWorkerAvailable(locationLike: Pick<Location, "hostname" | "protocol"> = window.location) {
  return locationLike.protocol === "http:" && (locationLike.hostname === "127.0.0.1" || locationLike.hostname === "localhost");
}

function createLocalWorkerBridge(): VideoReposterBridge {
  return {
    getDeviceInfo: () => requestJson<DeviceInfo>("/device-info"),
    getLicenseStatus: () => requestJson<{ state: LicenseState; license: CachedLicense | null }>("/license/status"),
    activateLicense: (key) => requestJson("/license/activate", { key }),
    openExternal: (url) => requestJson<void>("/open-external", { url }),
    showItemInFolder: (path) => requestJson<void>("/show-item-in-folder", { path }),
    getVideoPreviewUrl: async (path) => `${localApiBase}/files/preview?path=${encodeURIComponent(path)}`,
    getProcessingPresets: () => requestJson<PlatformPreset[]>("/processing/presets"),
    appendProcessingLog: (message) => requestJson<string>("/processing/log", { message }),
    getProcessingLogPath: () => requestJson<string>("/processing/log-path"),
    openProcessingLog: () => requestJson<string>("/processing/open-log"),
    checkFfmpeg: () => requestJson<ProcessingAvailability>("/processing/ffmpeg"),
    probeVideoFile: (inputPath) => requestJson<ProbeResult>("/processing/probe-file", { inputPath }),
    buildProcessingCommand: (job) => requestJson<string>("/processing/build-command", { job }),
    startProcessingJob: (job) => requestJson<{ id: string; args: string[] }>("/processing/start-job", { job }),
    startProcessingFile: (inputPath, presetId = "instagram-reel", outputDir, transforms, outputNaming, outputOverrides) =>
      requestJson("/processing/start-file", { inputPath, presetId, outputDir, transforms, outputNaming, outputOverrides }),
    stopProcessingJob: (id) => requestJson<boolean>("/processing/stop-job", { id }),
    selectVideoFiles: () => requestJson<ImportedVideoFile[]>("/files/select-videos"),
    selectVideoFolder: () => requestJson<ImportedVideoFile[]>("/files/select-video-folder"),
    selectOutputFolder: () => requestJson<string | null>("/files/select-output-folder"),
    sendProcessingTelemetry: (licenseKey, payload) => requestJson<boolean>("/telemetry/processing", { payload }, { Authorization: `Bearer ${licenseKey}` }),
    onProcessingUpdate: (callback) => {
      const events = new EventSource(`${localApiBase}/processing/events`);
      events.addEventListener("processing:update", (event) => {
        callback(JSON.parse((event as MessageEvent).data) as ProcessingUpdate);
      });
      events.addEventListener("error", () => undefined);
      return () => events.close();
    }
  };
}

async function requestJson<T>(path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const headers =
    body === undefined && extraHeaders === undefined
      ? undefined
      : { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...extraHeaders };
  const response = await fetch(`${localApiBase}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = (await response.json().catch(() => null)) as { value?: T; message?: string } | null;
  if (!response.ok) throw new Error(payload?.message ?? `Local worker request failed: ${response.status}`);
  return payload && "value" in payload ? (payload.value as T) : (payload as T);
}

function createPreviewBridge(): VideoReposterBridge {
  return {
    getDeviceInfo: async () => ({
      deviceId: "preview-device-id-000000000000000000000000",
      deviceName: "Preview Browser",
      os: "Browser Preview"
    }),
    getLicenseStatus: async () => ({
      state: "VALID",
      license: {
        license_key: "VDRP-PREV-IEW0-0000-0000",
        plan: "pro",
        package_limits: { video_limit: 50, template_limit: 5, worker_limit: 2 },
        status: "active",
        device_id: "preview-device-id-000000000000000000000000",
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(),
        activated_at: new Date().toISOString(),
        last_verified: new Date().toISOString(),
        user: { name: "Preview User", email: "preview@videoreposter.local", company: null }
      }
    }),
    activateLicense: async () => ({ ok: false, message: "Activation is available in the local browser app." }),
    openExternal: async (url: string) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    showItemInFolder: async () => undefined,
    getVideoPreviewUrl: async () => null,
    getProcessingPresets: async () => platformPresets,
    appendProcessingLog: async () => "preview-processing.log",
    getProcessingLogPath: async () => "preview-processing.log",
    openProcessingLog: async () => "",
    checkFfmpeg: async () => {
      const failure = componentUnavailableFailure("Processing is unavailable in browser preview mode.");
      return {
        available: false,
        message: failure.message,
        technicalMessage: failure.technicalMessage,
        hardwareAcceleration: {
          available: false,
          encoders: [],
          message: "CPU encoding fallback is active.",
          technicalMessage: "Browser preview mode cannot inspect FFmpeg encoders."
        },
        failure
      };
    },
    probeVideoFile: async () => ({ valid: false, message: invalidVideoFailure("Video probing is unavailable in browser preview mode.").message }),
    buildProcessingCommand: async () => "",
    startProcessingJob: async () => ({ id: "preview", args: [] }),
    startProcessingFile: async () => {
      const failure = componentUnavailableFailure("Processing is unavailable in browser preview mode.");
      return { ok: false, message: failure.message, failure };
    },
    stopProcessingJob: async () => false,
    selectVideoFiles: async () => [],
    selectVideoFolder: async () => [],
    selectOutputFolder: async () => null,
    sendProcessingTelemetry: async () => true,
    onProcessingUpdate: () => () => undefined
  };
}
