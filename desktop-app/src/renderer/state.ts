import { defaultOutputNamingTemplate, normalizeOutputNamingOptions, platformPresets, supportedOutputFormats } from "../shared/processing";
import type { ImportedVideoFile, OutputFormat, OutputNamingOptions, PlatformPreset, TransformSettings } from "../shared/processing";
import { processingFailureMessages } from "../shared/processingFailure";
import type { ProcessingFailure } from "../shared/processingFailure";

export type QueueFailure = Pick<ProcessingFailure, "code" | "message" | "retryable" | "recovery">;

export type QueueStatus = "queued" | "starting" | "processing" | "paused" | "complete" | "failed";

export type QueueItem = {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: QueueStatus;
  path?: string;
  outputPath?: string;
  processingJobId?: string;
  presetName?: string;
  transformSummary?: string;
  durationSeconds?: number;
  resolution?: string;
  codec?: string;
  metadataState?: "probing" | "ready" | "unavailable";
  failure?: QueueFailure;
};

export type HistoryItem = {
  id: string;
  name: string;
  status: "complete" | "failed";
  completedAt: string;
  outputPath?: string;
  sourcePath?: string;
  sourceSize?: number;
  presetName?: string;
  transformSummary?: string;
  resolution?: string;
  durationSeconds?: number;
  codec?: string;
  message?: string;
  failure?: QueueFailure;
};

export type HistoryFilter = "all" | "complete" | "failed";
export type ImportSource = "files" | "folder";

export type ProcessingActionState = {
  activeCount: number;
  schedulableCount: number;
  startDisabled: boolean;
  pauseDisabled: boolean;
  stopDisabled: boolean;
  startReason?: string;
};

export type ProcessingPreferences = {
  defaultPresetId: string;
  outputDir: string;
  maxWorkers: number;
  outputNaming: Required<OutputNamingOptions>;
  transforms: TransformSettings;
};

export type CurrentBatchSettings = {
  presetId: string;
  outputDir: string;
  maxWorkers: number;
  outputNaming: Required<OutputNamingOptions>;
};

export type WorkerPoolState = {
  activeCount: number;
  queuedCount: number;
  maxWorkers: number;
  workerLimit: number;
  availableSlots: number;
  saturated: boolean;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const defaultTransforms: TransformSettings = {
  scalePercent: 100,
  cropPercent: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  sharpness: 0,
  customRotateDegrees: 0,
  textWatermark: "",
  logoWatermarkPath: "",
  watermarkPosition: "bottom-right",
  replaceAudioPath: "",
  pitchSemitones: 0,
  speedPercent: 100,
  fadeInSeconds: 0,
  fadeOutSeconds: 0,
  volume: 100
};

export const defaultPreferences: ProcessingPreferences = {
  defaultPresetId: "instagram-reel",
  outputDir: "",
  maxWorkers: 2,
  outputNaming: {
    template: defaultOutputNamingTemplate,
    format: "mp4"
  },
  transforms: defaultTransforms
};

export const historyStorageKey = "video-reposter.processing-history";
export const preferencesStorageKey = "video-reposter.processing-preferences";
export const queueStorageKey = "video-reposter.processing-queue";

const supportedVideoExtensions = new Set(["mp4", "mov", "avi", "mkv", "webm", "flv"]);

export function cleanTransforms(transforms: TransformSettings): TransformSettings {
  return {
    mirrorHorizontal: transforms.mirrorHorizontal || undefined,
    mirrorVertical: transforms.mirrorVertical || undefined,
    rotateDegrees: transforms.rotateDegrees,
    customRotateDegrees: transforms.customRotateDegrees ? transforms.customRotateDegrees : undefined,
    removeAudio: transforms.removeAudio || undefined,
    scalePercent: transforms.scalePercent && transforms.scalePercent !== 100 ? transforms.scalePercent : undefined,
    cropPercent: transforms.cropPercent ? transforms.cropPercent : undefined,
    brightness: transforms.brightness ? transforms.brightness : undefined,
    contrast: transforms.contrast ? transforms.contrast : undefined,
    saturation: transforms.saturation ? transforms.saturation : undefined,
    sharpness: transforms.sharpness ? transforms.sharpness : undefined,
    textWatermark: trimOrUndefined(transforms.textWatermark),
    logoWatermarkPath: trimOrUndefined(transforms.logoWatermarkPath),
    watermarkPosition: trimOrUndefined(transforms.textWatermark) || trimOrUndefined(transforms.logoWatermarkPath) ? transforms.watermarkPosition : undefined,
    replaceAudioPath: transforms.removeAudio ? undefined : trimOrUndefined(transforms.replaceAudioPath),
    volume: transforms.removeAudio || transforms.volume === 100 ? undefined : transforms.volume,
    pitchSemitones: transforms.removeAudio || !transforms.pitchSemitones ? undefined : transforms.pitchSemitones,
    speedPercent: transforms.removeAudio || transforms.speedPercent === 100 ? undefined : transforms.speedPercent,
    fadeInSeconds: transforms.removeAudio || !transforms.fadeInSeconds ? undefined : transforms.fadeInSeconds,
    fadeOutSeconds: transforms.removeAudio || !transforms.fadeOutSeconds ? undefined : transforms.fadeOutSeconds
  };
}

export function summarizeTransforms(transforms: TransformSettings) {
  const cleaned = cleanTransforms(transforms);
  const labels = [
    cleaned.mirrorHorizontal ? "mirror" : "",
    cleaned.mirrorVertical ? "flip" : "",
    cleaned.rotateDegrees ? `${cleaned.rotateDegrees} deg` : "",
    cleaned.customRotateDegrees ? `rotate ${cleaned.customRotateDegrees} deg` : "",
    cleaned.removeAudio ? "muted" : "",
    cleaned.scalePercent ? `scale ${cleaned.scalePercent}%` : "",
    cleaned.cropPercent ? `crop ${cleaned.cropPercent}%` : "",
    cleaned.brightness ? "brightness" : "",
    cleaned.contrast ? "contrast" : "",
    cleaned.saturation ? "saturation" : "",
    cleaned.sharpness ? "sharpness" : "",
    cleaned.textWatermark ? "text watermark" : "",
    cleaned.logoWatermarkPath ? "logo watermark" : "",
    cleaned.replaceAudioPath ? "audio replaced" : "",
    cleaned.volume ? "volume" : "",
    cleaned.pitchSemitones ? "pitch" : "",
    cleaned.speedPercent ? `speed ${cleaned.speedPercent}%` : "",
    cleaned.fadeInSeconds || cleaned.fadeOutSeconds ? "fade" : ""
  ].filter(Boolean);
  return labels.length ? labels.join(", ") : undefined;
}

export function buildQueueItems(files: File[], current: QueueItem[]) {
  const known = new Set(current.map((item) => `${item.name}:${item.size}`));
  let skipped = 0;
  const items = files.flatMap((file) => {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const key = `${file.name}:${file.size}`;
    if (!supportedVideoExtensions.has(extension) || known.has(key)) {
      skipped += 1;
      return [];
    }
    known.add(key);
    return [{ id: `${key}:${file.lastModified}`, name: file.name, size: file.size, progress: 0, status: "queued" as QueueStatus }];
  });
  return { items, skipped };
}

export function buildQueueItemsFromImports(files: ImportedVideoFile[], current: QueueItem[]) {
  const known = new Set(current.map((item) => item.path ?? `${item.name}:${item.size}`));
  let skipped = 0;
  const items = files.flatMap((file) => {
    if (known.has(file.path)) {
      skipped += 1;
      return [];
    }
    known.add(file.path);
    return [{ id: file.path, path: file.path, name: file.name, size: file.size, progress: 0, status: "queued" as QueueStatus, outputPath: undefined }];
  });
  return { items, skipped };
}

export function getQueueTotals(items: QueueItem[]) {
  const progressTotal = items.reduce((sum, item) => sum + item.progress, 0);
  return {
    bytes: items.reduce((sum, item) => sum + item.size, 0),
    complete: items.filter((item) => item.status === "complete").length,
    processing: items.filter((item) => item.status === "processing" || item.status === "starting").length,
    failed: items.filter((item) => item.status === "failed").length,
    overall: items.length ? Math.round(progressTotal / items.length) : 0
  };
}

export type ImportSummary = {
  count: number;
  totalBytes: number;
  ready: number;
  checking: number;
  unreadable: number;
};

export function summarizeImport(items: QueueItem[]): ImportSummary {
  return items.reduce<ImportSummary>(
    (summary, item) => {
      summary.count += 1;
      summary.totalBytes += Number.isFinite(item.size) ? item.size : 0;
      if (item.metadataState === "ready") summary.ready += 1;
      else if (item.metadataState === "unavailable") summary.unreadable += 1;
      else summary.checking += 1;
      return summary;
    },
    { count: 0, totalBytes: 0, ready: 0, checking: 0, unreadable: 0 }
  );
}

export function getProcessingActionState(
  items: QueueItem[],
  processingAvailable: boolean | null,
  running: boolean
): ProcessingActionState {
  const activeCount = items.filter((item) => item.status === "processing" || item.status === "starting").length;
  const schedulableCount = items.filter((item) => (item.status === "queued" || item.status === "paused") && Boolean(item.path)).length;
  let startReason: string | undefined;

  if (processingAvailable === null) {
    startReason = "Checking the video processing component.";
  } else if (!processingAvailable) {
    startReason = "Video processing is unavailable. Reinstall Video Reposter or contact support.";
  } else if (running) {
    startReason = activeCount > 0 ? "The batch is running." : "Starting queued videos.";
  } else if (schedulableCount === 0) {
    startReason = items.length === 0 ? "Import at least one video to start." : "No queued videos are ready to process.";
  }

  return {
    activeCount,
    schedulableCount,
    startDisabled: processingAvailable !== true || running || schedulableCount === 0,
    pauseDisabled: !running,
    stopDisabled: activeCount === 0,
    startReason
  };
}

export function getNewBatchItems(items: QueueItem[]) {
  return items.filter((item) => item.status === "queued" || item.status === "paused");
}

export function getFinishedQueueItems(items: QueueItem[]) {
  return items.filter((item) => item.status === "complete" || item.status === "failed");
}

export function getPresetAccess(presets: PlatformPreset[], presetLimit: number) {
  return presets.map((preset, index) => ({
    preset,
    included: index < Math.max(0, presetLimit)
  }));
}

export function isNewBatchLocked(items: QueueItem[], running: boolean) {
  return running || items.some((item) => item.status === "processing" || item.status === "starting");
}

export function currentBatchSettingsFromPreferences(preferences: ProcessingPreferences, workerLimit = 4): CurrentBatchSettings {
  return {
    presetId: preferences.defaultPresetId,
    outputDir: preferences.outputDir,
    maxWorkers: Math.min(preferences.maxWorkers, workerLimit),
    outputNaming: { ...preferences.outputNaming }
  };
}

export function getWorkerPoolState(items: QueueItem[], maxWorkers: unknown, workerLimit = 4): WorkerPoolState {
  const nextWorkerLimit = clampWorkers(workerLimit);
  const nextMaxWorkers = Math.min(clampWorkers(maxWorkers), nextWorkerLimit);
  const activeCount = items.filter((item) => item.status === "processing" || item.status === "starting").length;
  const queuedCount = items.filter((item) => (item.status === "queued" || item.status === "paused") && Boolean(item.path)).length;
  const availableSlots = Math.max(0, nextMaxWorkers - activeCount);

  return {
    activeCount,
    queuedCount,
    maxWorkers: nextMaxWorkers,
    workerLimit: nextWorkerLimit,
    availableSlots,
    saturated: activeCount >= nextMaxWorkers && queuedCount > 0
  };
}

export function restoredDefaultPreferences(workerLimit = 4, fallbackPresetId = defaultPreferences.defaultPresetId): ProcessingPreferences {
  return {
    ...defaultPreferences,
    maxWorkers: Math.min(defaultPreferences.maxWorkers, workerLimit),
    defaultPresetId: fallbackPresetId,
    outputNaming: { ...defaultPreferences.outputNaming },
    transforms: { ...defaultTransforms }
  };
}

export function queueStatusLabel(status: QueueStatus) {
  if (status === "queued") return "Waiting";
  if (status === "starting") return "Starting";
  if (status === "processing") return "Processing";
  if (status === "paused") return "Paused";
  if (status === "complete") return "Completed";
  return "Failed";
}

export function importSourceLabel(source: ImportSource) {
  return source === "folder" ? "selected folder" : "selected files";
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index < 2 ? 0 : 1)} ${units[index]}`;
}

export function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return "Unknown duration";
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
}

export function estimateQueueEtaSeconds(overallProgress: number, elapsedMs: number): number | undefined {
  if (!Number.isFinite(overallProgress) || !Number.isFinite(elapsedMs)) return undefined;
  if (overallProgress <= 0 || overallProgress >= 100 || elapsedMs <= 0) return undefined;
  const fraction = overallProgress / 100;
  const remainingMs = elapsedMs / fraction - elapsedMs;
  return Math.max(0, Math.round(remainingMs / 1000));
}

export function formatEta(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "Estimating time remaining...";
  if (seconds < 1) return "Almost done";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  if (hours > 0) return `~${hours}h ${String(minutes).padStart(2, "0")}m remaining`;
  if (minutes > 0) return `~${minutes}m ${String(secs).padStart(2, "0")}s remaining`;
  return `~${secs}s remaining`;
}

export function formatVideoFormat(path?: string, codec?: string) {
  const extension = path?.split(".").pop()?.toUpperCase();
  return [extension, codec?.toUpperCase()].filter(Boolean).join(" · ") || "Unknown format";
}

export function sanitizeOutputNaming(value: unknown): Required<OutputNamingOptions> {
  const naming = value && typeof value === "object" ? value as OutputNamingOptions : {};
  return normalizeOutputNamingOptions({
    template: sanitizeNamingTemplate(naming.template),
    format: supportedOutputFormats.includes(naming.format as OutputFormat) ? naming.format : undefined
  });
}

export function loadHistory(storage = getStorage()): HistoryItem[] {
  try {
    const stored = storage?.getItem(historyStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as HistoryItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item.id || !item.name || !item.completedAt || (item.status !== "complete" && item.status !== "failed")) return [];
      return [{ ...item, failure: sanitizeQueueFailure(item.failure) }];
    }).slice(0, 50);
  } catch {
    return [];
  }
}

export function saveHistory(history: HistoryItem[], storage = getStorage()) {
  try {
    storage?.setItem(historyStorageKey, JSON.stringify(history.slice(0, 50)));
  } catch {
    // Local storage can be unavailable in unusual browser contexts.
  }
}

export function loadPreferences(storage = getStorage()): ProcessingPreferences {
  try {
    const stored = storage?.getItem(preferencesStorageKey);
    if (!stored) return defaultPreferences;
    const parsed = JSON.parse(stored) as Partial<ProcessingPreferences> & { selectedPresetId?: unknown };
    const savedDefaultPresetId = typeof parsed.defaultPresetId === "string" ? parsed.defaultPresetId : parsed.selectedPresetId;
    return {
      defaultPresetId:
        typeof savedDefaultPresetId === "string" && platformPresets.some((preset) => preset.id === savedDefaultPresetId)
          ? savedDefaultPresetId
          : defaultPreferences.defaultPresetId,
      outputDir: typeof parsed.outputDir === "string" ? parsed.outputDir : "",
      maxWorkers: clampWorkers(parsed.maxWorkers),
      outputNaming: sanitizeOutputNaming(parsed.outputNaming),
      transforms: sanitizeTransforms(parsed.transforms)
    };
  } catch {
    return defaultPreferences;
  }
}

export function savePreferences(preferences: ProcessingPreferences, storage = getStorage()) {
  try {
    storage?.setItem(preferencesStorageKey, JSON.stringify(preferences));
  } catch {
    // Local storage can be unavailable in unusual browser contexts.
  }
}

export function loadQueue(storage = getStorage()): QueueItem[] {
  try {
    const stored = storage?.getItem(queueStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as QueueItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!isValidQueueItem(item)) return [];
      const status = item.status === "processing" || item.status === "starting" ? "queued" : item.status;
      return [
        {
          ...item,
          status,
          progress: status === "queued" ? 0 : clampNumber(item.progress, 0, 100, 0),
          processingJobId: undefined,
          failure: sanitizeQueueFailure(item.failure)
        }
      ];
    }).slice(0, 200);
  } catch {
    return [];
  }
}

export function saveQueue(items: QueueItem[], storage = getStorage()) {
  try {
    const persisted = items.map((item) => ({
      ...item,
      status: item.status === "processing" || item.status === "starting" ? "queued" : item.status,
      progress: item.status === "processing" || item.status === "starting" ? 0 : item.progress,
      processingJobId: undefined
    }));
    storage?.setItem(queueStorageKey, JSON.stringify(persisted.slice(0, 200)));
  } catch {
    // Local storage can be unavailable in unusual browser contexts.
  }
}

export function sanitizeTransforms(value: unknown): TransformSettings {
  const transforms = value && typeof value === "object" ? (value as TransformSettings) : {};
  return {
    mirrorHorizontal: Boolean(transforms.mirrorHorizontal) || undefined,
    mirrorVertical: Boolean(transforms.mirrorVertical) || undefined,
    removeAudio: Boolean(transforms.removeAudio) || undefined,
    rotateDegrees: transforms.rotateDegrees === 90 || transforms.rotateDegrees === 180 || transforms.rotateDegrees === 270 ? transforms.rotateDegrees : undefined,
    customRotateDegrees: clampNumber(transforms.customRotateDegrees, -180, 180, 0),
    scalePercent: clampNumber(transforms.scalePercent, 100, 200, 100),
    cropPercent: clampNumber(transforms.cropPercent, 0, 40, 0),
    brightness: clampNumber(transforms.brightness, -50, 50, 0),
    contrast: clampNumber(transforms.contrast, -50, 50, 0),
    saturation: clampNumber(transforms.saturation, -50, 50, 0),
    sharpness: clampNumber(transforms.sharpness, 0, 100, 0),
    textWatermark: sanitizeText(transforms.textWatermark, 80),
    logoWatermarkPath: sanitizeText(transforms.logoWatermarkPath, 260),
    watermarkPosition: sanitizeWatermarkPosition(transforms.watermarkPosition),
    replaceAudioPath: sanitizeText(transforms.replaceAudioPath, 260),
    volume: clampNumber(transforms.volume, 0, 150, 100),
    pitchSemitones: clampNumber(transforms.pitchSemitones, -12, 12, 0),
    speedPercent: clampNumber(transforms.speedPercent, 50, 200, 100),
    fadeInSeconds: clampNumber(transforms.fadeInSeconds, 0, 10, 0),
    fadeOutSeconds: clampNumber(transforms.fadeOutSeconds, 0, 10, 0)
  };
}

export function clampWorkers(value: unknown) {
  return clampNumber(value, 1, 4, defaultPreferences.maxWorkers);
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, Math.round(next)));
}

export function formatHistoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

export function filterHistoryItems(history: HistoryItem[], filter: HistoryFilter) {
  return filter === "all" ? history : history.filter((item) => item.status === filter);
}

export function canRetryHistoryItem(item: HistoryItem) {
  return item.status === "failed" && Boolean(item.sourcePath) && item.failure?.retryable === true;
}

function isValidQueueItem(item: unknown): item is QueueItem {
  if (!item || typeof item !== "object") return false;
  const next = item as QueueItem;
  return typeof next.id === "string" && typeof next.name === "string" && typeof next.size === "number" && isQueueStatus(next.status);
}

function isQueueStatus(status: unknown): status is QueueStatus {
  return status === "queued" || status === "starting" || status === "processing" || status === "paused" || status === "complete" || status === "failed";
}

function sanitizeQueueFailure(value: unknown): QueueFailure | undefined {
  if (!value || typeof value !== "object") return undefined;
  const code = (value as { code?: unknown }).code;
  if (code === "component_unavailable") {
    return { code, message: processingFailureMessages.componentUnavailable, retryable: false, recovery: "reinstall_support" };
  }
  if (code === "invalid_video") {
    return { code, message: processingFailureMessages.invalidVideo, retryable: false, recovery: "replace_video" };
  }
  if (code === "output_folder") {
    return { code, message: processingFailureMessages.outputFolder, retryable: true, recovery: "choose_output" };
  }
  if (code === "processing_failed") {
    return { code, message: processingFailureMessages.processingFailed, retryable: true, recovery: "retry_support" };
  }
  return undefined;
}

function sanitizeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function sanitizeNamingTemplate(value: unknown) {
  const trimmed = typeof value === "string" ? value.trim().slice(0, 120) : "";
  return trimmed || defaultOutputNamingTemplate;
}

function trimOrUndefined(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function sanitizeWatermarkPosition(value: unknown): TransformSettings["watermarkPosition"] {
  if (value === "top-left" || value === "top-right" || value === "bottom-left" || value === "bottom-right" || value === "center") return value;
  return "bottom-right";
}

function getStorage(): StorageLike | undefined {
  return globalThis.window?.localStorage;
}
