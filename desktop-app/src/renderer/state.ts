import { platformPresets } from "../shared/processing";
import type { ImportedVideoFile, TransformSettings } from "../shared/processing";

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
};

export type HistoryItem = {
  id: string;
  name: string;
  status: "complete" | "failed";
  completedAt: string;
  outputPath?: string;
  sourcePath?: string;
  presetName?: string;
  transformSummary?: string;
  resolution?: string;
  durationSeconds?: number;
  message?: string;
};

export type ProcessingPreferences = {
  selectedPresetId: string;
  outputDir: string;
  maxWorkers: number;
  transforms: TransformSettings;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export const defaultTransforms: TransformSettings = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  sharpness: 0,
  volume: 100
};

export const defaultPreferences: ProcessingPreferences = {
  selectedPresetId: "instagram-reel",
  outputDir: "",
  maxWorkers: 2,
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
    removeAudio: transforms.removeAudio || undefined,
    brightness: transforms.brightness ? transforms.brightness : undefined,
    contrast: transforms.contrast ? transforms.contrast : undefined,
    saturation: transforms.saturation ? transforms.saturation : undefined,
    sharpness: transforms.sharpness ? transforms.sharpness : undefined,
    volume: transforms.removeAudio || transforms.volume === 100 ? undefined : transforms.volume
  };
}

export function summarizeTransforms(transforms: TransformSettings) {
  const cleaned = cleanTransforms(transforms);
  const labels = [
    cleaned.mirrorHorizontal ? "mirror" : "",
    cleaned.mirrorVertical ? "flip" : "",
    cleaned.rotateDegrees ? `${cleaned.rotateDegrees} deg` : "",
    cleaned.removeAudio ? "muted" : "",
    cleaned.brightness ? "brightness" : "",
    cleaned.contrast ? "contrast" : "",
    cleaned.saturation ? "saturation" : "",
    cleaned.sharpness ? "sharpness" : "",
    cleaned.volume ? "volume" : ""
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

export function formatBytes(bytes: number) {
  if (!bytes) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index < 2 ? 0 : 1)} ${units[index]}`;
}

export function loadHistory(storage = getStorage()): HistoryItem[] {
  try {
    const stored = storage?.getItem(historyStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as HistoryItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item.id && item.name && item.completedAt).slice(0, 50);
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
    const parsed = JSON.parse(stored) as Partial<ProcessingPreferences>;
    return {
      selectedPresetId:
        typeof parsed.selectedPresetId === "string" && platformPresets.some((preset) => preset.id === parsed.selectedPresetId)
          ? parsed.selectedPresetId
          : defaultPreferences.selectedPresetId,
      outputDir: typeof parsed.outputDir === "string" ? parsed.outputDir : "",
      maxWorkers: clampWorkers(parsed.maxWorkers),
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
          processingJobId: undefined
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
    brightness: clampNumber(transforms.brightness, -50, 50, 0),
    contrast: clampNumber(transforms.contrast, -50, 50, 0),
    saturation: clampNumber(transforms.saturation, -50, 50, 0),
    sharpness: clampNumber(transforms.sharpness, 0, 100, 0),
    volume: clampNumber(transforms.volume, 0, 150, 100)
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

function isValidQueueItem(item: unknown): item is QueueItem {
  if (!item || typeof item !== "object") return false;
  const next = item as QueueItem;
  return typeof next.id === "string" && typeof next.name === "string" && typeof next.size === "number" && isQueueStatus(next.status);
}

function isQueueStatus(status: unknown): status is QueueStatus {
  return status === "queued" || status === "starting" || status === "processing" || status === "paused" || status === "complete" || status === "failed";
}

function getStorage(): StorageLike | undefined {
  return globalThis.window?.localStorage;
}
