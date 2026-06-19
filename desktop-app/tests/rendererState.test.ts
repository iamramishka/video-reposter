import { describe, expect, it } from "vitest";
import {
  defaultPreferences,
  buildQueueItems,
  buildQueueItemsFromImports,
  canRetryHistoryItem,
  customPresetsStorageKey,
  currentBatchSettingsFromPreferences,
  estimateQueueEtaSeconds,
  filterHistoryItems,
  formatDuration,
  formatEta,
  formatVideoFormat,
  getFinishedQueueItems,
  getNewBatchItems,
  getPresetAccess,
  getProcessingActionState,
  getWorkerPoolState,
  importSourceLabel,
  isNewBatchLocked,
  queueStatusLabel,
  restoredDefaultPreferences,
  summarizeImport,
  historyStorageKey,
  loadCustomPresets,
  loadHistory,
  loadPreferences,
  loadQueue,
  preferencesStorageKey,
  queueStorageKey,
  saveCustomPresets,
  saveHistory,
  savePreferences,
  saveQueue,
  summarizeTransforms
} from "../src/renderer/state";
import type { HistoryItem, ProcessingPreferences, QueueItem } from "../src/renderer/state";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    read: (key: string) => values.get(key)
  };
}

describe("renderer state persistence", () => {
  it("restores active queue work as queued and removes stale job ids", () => {
    const storage = memoryStorage({
      [queueStorageKey]: JSON.stringify([
        { id: "a", name: "active.mp4", size: 100, progress: 73, status: "processing", processingJobId: "stale" },
        { id: "b", name: "done.mp4", size: 200, progress: 100, status: "complete", processingJobId: "old" },
        { id: "bad", name: "bad.mp4", size: 1, status: "unknown" }
      ])
    });

    expect(loadQueue(storage)).toEqual([
      { id: "a", name: "active.mp4", size: 100, progress: 0, status: "queued", processingJobId: undefined },
      { id: "b", name: "done.mp4", size: 200, progress: 100, status: "complete", processingJobId: undefined }
    ]);
  });

  it("saves queue snapshots without active process ids", () => {
    const storage = memoryStorage();
    const items: QueueItem[] = [
      { id: "a", name: "active.mp4", size: 100, progress: 50, status: "starting", processingJobId: "job-1" }
    ];

    saveQueue(items, storage);

    expect(JSON.parse(storage.read(queueStorageKey)!)).toEqual([
      { id: "a", name: "active.mp4", size: 100, progress: 0, status: "queued" }
    ]);
  });

  it("preserves structured failure retryability in queue snapshots", () => {
    const storage = memoryStorage();
    const failure = {
      code: "component_unavailable" as const,
      message: "Video processing is unavailable. Reinstall Video Reposter or contact support.",
      retryable: false,
      recovery: "reinstall_support" as const
    };

    saveQueue([{ id: "a", name: "failed.mp4", size: 100, progress: 0, status: "failed", failure }], storage);

    expect(loadQueue(storage)).toEqual([
      expect.objectContaining({ status: "failed", failure: expect.objectContaining({ code: "component_unavailable", retryable: false }) })
    ]);
  });

  it("validates stored processing preferences", () => {
    const storage = memoryStorage({
      [preferencesStorageKey]: JSON.stringify({
        selectedPresetId: "not-real",
        outputDir: "C:/Output",
        maxWorkers: 99,
        outputNaming: {
          template: "  {preset}:{name}?  ",
          format: "mkv"
        },
        transforms: {
          brightness: 500,
          contrast: -500,
          saturation: "nope",
          sharpness: 999,
          volume: -20,
          scalePercent: 999,
          cropPercent: 999,
          rotateDegrees: 45,
          customRotateDegrees: -999,
          textWatermark: "  Brand  ",
          logoWatermarkPath: "  C:/brand/logo.png  ",
          watermarkPosition: "top-right",
          replaceAudioPath: "  C:/audio/track.mp3  ",
          pitchSemitones: 99,
          speedPercent: 5,
          fadeInSeconds: 99,
          fadeOutSeconds: -2,
          mirrorHorizontal: true
        }
      })
    });

    expect(loadPreferences(storage)).toEqual({
      defaultPresetId: defaultPreferences.defaultPresetId,
      outputDir: "C:/Output",
      maxWorkers: 4,
      outputNaming: {
        template: "{preset}:{name}?",
        format: "mkv"
      },
      transforms: {
        mirrorHorizontal: true,
        mirrorVertical: undefined,
        removeAudio: undefined,
        rotateDegrees: undefined,
        customRotateDegrees: -180,
        scalePercent: 200,
        cropPercent: 40,
        brightness: 50,
        contrast: -50,
        saturation: 0,
        sharpness: 100,
        textWatermark: "Brand",
        logoWatermarkPath: "C:/brand/logo.png",
        watermarkPosition: "top-right",
        replaceAudioPath: "C:/audio/track.mp3",
        volume: 0,
        pitchSemitones: 12,
        speedPercent: 50,
        fadeInSeconds: 10,
        fadeOutSeconds: 0
      },
      autoOpenOutput: false
    });
  });

  it("migrates the legacy selected preset into the saved default preset", () => {
    const storage = memoryStorage({
      [preferencesStorageKey]: JSON.stringify({
        selectedPresetId: "facebook-reel",
        outputDir: "",
        maxWorkers: 2,
        outputNaming: {
          template: "",
          format: "bad"
        },
        transforms: {}
      })
    });

    expect(loadPreferences(storage).defaultPresetId).toBe("facebook-reel");
  });

  it("preserves the auto-open-output preference and coerces non-booleans to false", () => {
    const on = memoryStorage({ [preferencesStorageKey]: JSON.stringify({ ...defaultPreferences, autoOpenOutput: true }) });
    expect(loadPreferences(on).autoOpenOutput).toBe(true);

    const coerced = memoryStorage({ [preferencesStorageKey]: JSON.stringify({ autoOpenOutput: "yes" }) });
    expect(loadPreferences(coerced).autoOpenOutput).toBe(false);
  });

  it("saves preferences and keeps history to the newest fifty entries", () => {
    const storage = memoryStorage();
    const preferences: ProcessingPreferences = {
      defaultPresetId: "tiktok",
      outputDir: "C:/Output",
      maxWorkers: 3,
      outputNaming: {
        template: "{name}_{preset}",
        format: "mov"
      },
      transforms: { volume: 80 },
      autoOpenOutput: true
    };
    const history: HistoryItem[] = Array.from({ length: 55 }, (_, index) => ({
      id: String(index),
      name: `${index}.mp4`,
      status: "complete",
      completedAt: new Date(2026, 0, index + 1).toISOString()
    }));

    savePreferences(preferences, storage);
    saveHistory(history, storage);

    expect(JSON.parse(storage.read(preferencesStorageKey)!)).toEqual(preferences);
    expect(loadHistory(storage)).toHaveLength(50);
    expect(JSON.parse(storage.read(historyStorageKey)!)).toHaveLength(50);
  });

  it("loads and saves sanitized custom presets", () => {
    const storage = memoryStorage({
      [customPresetsStorageKey]: JSON.stringify([
        {
          id: " custom-one ",
          name: " Custom One ",
          settings: {
            width: 1280,
            height: 720,
            fps: 30,
            videoBitrate: "6M",
            audioBitrate: "160k",
            codec: "libx264",
            maxDurationSeconds: 120,
            normalizeAudio: true
          }
        },
        {
          id: "bad",
          name: "Bad",
          settings: { width: 0, height: 0, fps: 0, videoBitrate: "wat", audioBitrate: "wat", codec: "bad" }
        }
      ])
    });

    expect(loadCustomPresets(storage)).toEqual([
      {
        id: "custom-one",
        name: "Custom One",
        custom: true,
        settings: {
          width: 1280,
          height: 720,
          fps: 30,
          videoBitrate: "6M",
          audioBitrate: "160k",
          codec: "libx264",
          maxDurationSeconds: 120,
          normalizeAudio: true,
          crf: undefined,
          preset: undefined
        }
      }
    ]);

    saveCustomPresets(loadCustomPresets(storage), storage);
    expect(JSON.parse(storage.read(customPresetsStorageKey)!)).toHaveLength(1);
  });

  it("preserves safe failure metadata and source details in History", () => {
    const storage = memoryStorage();
    const failed: HistoryItem = {
      id: "failed-attempt",
      name: "failed.mp4",
      status: "failed",
      completedAt: new Date(2026, 5, 6).toISOString(),
      sourcePath: "C:/videos/failed.mp4",
      sourceSize: 2048,
      presetName: "TikTok",
      message: "Video processing failed. Try again. If it keeps failing, contact support.",
      failure: {
        code: "processing_failed",
        message: "Video processing failed. Try again. If it keeps failing, contact support.",
        retryable: true,
        recovery: "retry_support"
      }
    };

    saveHistory([failed], storage);

    expect(loadHistory(storage)).toEqual([failed]);
    expect(canRetryHistoryItem(loadHistory(storage)[0])).toBe(true);
  });

  it("filters History and only retries retryable failures with source files", () => {
    const complete: HistoryItem = { id: "complete", name: "done.mp4", status: "complete", completedAt: "2026-06-06T00:00:00.000Z" };
    const retryable: HistoryItem = {
      id: "retryable",
      name: "retry.mp4",
      status: "failed",
      completedAt: "2026-06-06T00:00:00.000Z",
      sourcePath: "C:/retry.mp4",
      failure: { code: "output_folder", message: "The output folder could not be used. Choose another output folder and try again.", retryable: true, recovery: "choose_output" }
    };
    const blocked: HistoryItem = {
      id: "blocked",
      name: "blocked.mp4",
      status: "failed",
      completedAt: "2026-06-06T00:00:00.000Z",
      sourcePath: "C:/blocked.mp4",
      failure: { code: "invalid_video", message: "This video could not be read. Remove it and choose a supported video file.", retryable: false, recovery: "replace_video" }
    };

    expect(filterHistoryItems([complete, retryable, blocked], "complete")).toEqual([complete]);
    expect(filterHistoryItems([complete, retryable, blocked], "failed")).toEqual([retryable, blocked]);
    expect(canRetryHistoryItem(retryable)).toBe(true);
    expect(canRetryHistoryItem(blocked)).toBe(false);
    expect(canRetryHistoryItem({ ...retryable, sourcePath: undefined })).toBe(false);
  });

  it("enables processing actions only when they can affect the queue", () => {
    expect(getProcessingActionState([], true, false)).toMatchObject({
      activeCount: 0,
      schedulableCount: 0,
      startDisabled: true,
      pauseDisabled: true,
      stopDisabled: true,
      startReason: "Import at least one video to start."
    });

    const queued: QueueItem = { id: "queued", path: "C:/video.mp4", name: "video.mp4", size: 10, progress: 0, status: "queued" };
    expect(getProcessingActionState([queued], true, false)).toMatchObject({
      schedulableCount: 1,
      startDisabled: false,
      pauseDisabled: true,
      stopDisabled: true
    });

    expect(getProcessingActionState([queued], true, true)).toMatchObject({
      schedulableCount: 1,
      startDisabled: true,
      pauseDisabled: false,
      stopDisabled: true,
      startReason: "Starting queued videos."
    });

    const active: QueueItem = { ...queued, status: "processing", processingJobId: "job-1" };
    expect(getProcessingActionState([active], true, true)).toMatchObject({
      activeCount: 1,
      startDisabled: true,
      pauseDisabled: false,
      stopDisabled: false,
      startReason: "The batch is running."
    });
  });

  it("summarizes worker pool slots within package limits", () => {
    const queued: QueueItem = { id: "queued", path: "C:/queued.mp4", name: "queued.mp4", size: 10, progress: 0, status: "queued" };
    const paused: QueueItem = { ...queued, id: "paused", status: "paused" };
    const processing: QueueItem = { ...queued, id: "processing", status: "processing", processingJobId: "job-1" };
    const starting: QueueItem = { ...queued, id: "starting", status: "starting", processingJobId: "job-2" };

    expect(getWorkerPoolState([queued, paused, processing, starting], 8, 3)).toEqual({
      activeCount: 2,
      queuedCount: 2,
      maxWorkers: 3,
      workerLimit: 3,
      availableSlots: 1,
      saturated: false
    });
    expect(getWorkerPoolState([queued, processing, starting], 2, 4)).toEqual(expect.objectContaining({
      availableSlots: 0,
      saturated: true
    }));
  });

  it("blocks Start for unavailable processing, invalid imports, and terminal queue items", () => {
    const invalid: QueueItem = { id: "invalid", name: "browser-preview.mp4", size: 10, progress: 0, status: "queued" };
    const complete: QueueItem = { id: "complete", path: "C:/done.mp4", name: "done.mp4", size: 10, progress: 100, status: "complete" };

    expect(getProcessingActionState([invalid], true, false)).toMatchObject({
      schedulableCount: 0,
      startDisabled: true,
      startReason: "No queued videos are ready to process."
    });
    expect(getProcessingActionState([complete], true, false).startDisabled).toBe(true);
    expect(getProcessingActionState([{ ...invalid, path: "C:/video.mp4" }], false, false)).toMatchObject({
      startDisabled: true,
      startReason: "Video processing is unavailable. Reinstall Video Reposter or contact support."
    });
  });

  it("keeps New Batch focused on preparation work and locks it during active processing", () => {
    const queued: QueueItem = { id: "queued", path: "C:/queued.mp4", name: "queued.mp4", size: 10, progress: 0, status: "queued" };
    const paused: QueueItem = { ...queued, id: "paused", status: "paused" };
    const active: QueueItem = { ...queued, id: "active", status: "processing", processingJobId: "job-1" };
    const complete: QueueItem = { ...queued, id: "complete", status: "complete", progress: 100 };

    expect(getNewBatchItems([queued, paused, active, complete])).toEqual([queued, paused]);
    expect(isNewBatchLocked([queued], false)).toBe(false);
    expect(isNewBatchLocked([active], false)).toBe(true);
    expect(isNewBatchLocked([queued], true)).toBe(true);
  });

  it("identifies only completed and failed queue entries as finished", () => {
    const queued: QueueItem = { id: "queued", name: "queued.mp4", size: 10, progress: 0, status: "queued" };
    const processing: QueueItem = { ...queued, id: "processing", status: "processing" };
    const complete: QueueItem = { ...queued, id: "complete", status: "complete", progress: 100 };
    const failed: QueueItem = { ...queued, id: "failed", status: "failed" };

    expect(getFinishedQueueItems([queued, processing, complete, failed])).toEqual([complete, failed]);
  });

  it("keeps package-restricted presets visible while marking their access", () => {
    const access = getPresetAccess([
      { id: "instagram-reel", name: "Instagram Reel", settings: { width: 1080, height: 1920, fps: 30, videoBitrate: "4M", audioBitrate: "128k", codec: "libx264" } },
      { id: "youtube-short", name: "YouTube Short", settings: { width: 1080, height: 1920, fps: 60, videoBitrate: "8M", audioBitrate: "192k", codec: "libx264" } },
      { id: "tiktok", name: "TikTok", settings: { width: 1080, height: 1920, fps: 30, videoBitrate: "4M", audioBitrate: "128k", codec: "libx264" } }
    ], 2);

    expect(access.map(({ preset, included }) => ({ id: preset.id, included }))).toEqual([
      { id: "instagram-reel", included: true },
      { id: "youtube-short", included: true },
      { id: "tiktok", included: false }
    ]);
  });

  it("uses customer-readable queue status labels", () => {
    expect(queueStatusLabel("queued")).toBe("Waiting");
    expect(queueStatusLabel("starting")).toBe("Starting");
    expect(queueStatusLabel("processing")).toBe("Processing");
    expect(queueStatusLabel("paused")).toBe("Paused");
    expect(queueStatusLabel("complete")).toBe("Completed");
    expect(queueStatusLabel("failed")).toBe("Failed");
  });

  it("uses distinct customer-readable import source labels", () => {
    expect(importSourceLabel("files")).toBe("selected files");
    expect(importSourceLabel("folder")).toBe("selected folder");
  });

  it("formats video metadata for customer-facing file details", () => {
    expect(formatDuration(65.4)).toBe("1:05");
    expect(formatDuration()).toBe("Unknown duration");
    expect(formatVideoFormat("C:/videos/clip.mp4", "h264")).toBe("MP4 · H264");
    expect(formatVideoFormat()).toBe("Unknown format");
  });

  it("summarizes an import batch by total size and validation status", () => {
    const items: QueueItem[] = [
      { id: "a", name: "a.mp4", size: 1_000_000, progress: 0, status: "queued", metadataState: "ready" },
      { id: "b", name: "b.mp4", size: 2_000_000, progress: 0, status: "queued", metadataState: "probing" },
      { id: "c", name: "c.mp4", size: 3_000_000, progress: 0, status: "queued", metadataState: "unavailable" },
      { id: "d", name: "d.mp4", size: 4_000_000, progress: 0, status: "queued" }
    ];

    expect(summarizeImport(items)).toEqual({
      count: 4,
      totalBytes: 10_000_000,
      ready: 1,
      checking: 2,
      unreadable: 1
    });

    expect(summarizeImport([])).toEqual({ count: 0, totalBytes: 0, ready: 0, checking: 0, unreadable: 0 });
  });

  it("estimates the remaining queue time from overall progress and elapsed time", () => {
    // 25% done in 60s implies ~180s remaining.
    expect(estimateQueueEtaSeconds(25, 60_000)).toBe(180);
    // 50% done in 30s implies ~30s remaining.
    expect(estimateQueueEtaSeconds(50, 30_000)).toBe(30);
    // No usable estimate before progress starts, once complete, or without elapsed time.
    expect(estimateQueueEtaSeconds(0, 60_000)).toBeUndefined();
    expect(estimateQueueEtaSeconds(100, 60_000)).toBeUndefined();
    expect(estimateQueueEtaSeconds(40, 0)).toBeUndefined();
  });

  it("formats the ETA into a customer-readable countdown", () => {
    expect(formatEta(undefined)).toBe("Estimating time remaining...");
    expect(formatEta(0)).toBe("Almost done");
    expect(formatEta(45)).toBe("~45s remaining");
    expect(formatEta(150)).toBe("~2m 30s remaining");
    expect(formatEta(3700)).toBe("~1h 01m remaining");
  });

  it("copies saved defaults into independent current-batch settings", () => {
    const preferences: ProcessingPreferences = {
      defaultPresetId: "youtube-short",
      outputDir: "C:/Default Output",
      maxWorkers: 3,
      outputNaming: {
        template: "{preset}_{name}",
        format: "mkv"
      },
      transforms: {},
      autoOpenOutput: false
    };

    const currentBatch = currentBatchSettingsFromPreferences(preferences, 2);
    preferences.outputDir = "C:/Changed Default";
    preferences.maxWorkers = 1;
    preferences.outputNaming.template = "changed";

    expect(currentBatch).toEqual({
      presetId: "youtube-short",
      outputDir: "C:/Default Output",
      maxWorkers: 2,
      outputNaming: {
        template: "{preset}_{name}",
        format: "mkv"
      }
    });
  });

  it("restores explicit saved defaults without sharing mutable adjustment state", () => {
    const restored = restoredDefaultPreferences(1, "youtube-short");

    expect(restored).toEqual({
      defaultPresetId: "youtube-short",
      outputDir: "",
      maxWorkers: 1,
      outputNaming: {
        template: "{name}_{preset}_processed",
        format: "mp4"
      },
      transforms: {
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
      },
      autoOpenOutput: false
    });

    restored.transforms.scalePercent = 150;
    expect(defaultPreferences.transforms.scalePercent).toBe(100);
  });

  it("summarizes non-default transforms", () => {
    expect(summarizeTransforms({ mirrorHorizontal: true, rotateDegrees: 90, scalePercent: 125, volume: 80 })).toBe("mirror, 90 deg, scale 125%, volume");
    expect(summarizeTransforms({ cropPercent: 10, textWatermark: "Brand", replaceAudioPath: "C:/audio/track.mp3", speedPercent: 125 })).toBe("crop 10%, text watermark, audio replaced, speed 125%");
    expect(summarizeTransforms({ brightness: 0, volume: 100 })).toBeUndefined();
  });

  it("skips unsupported and duplicate imports", () => {
    const existing: QueueItem[] = [{ id: "existing", name: "clip.mp4", size: 4, progress: 0, status: "queued" }];
    const result = buildQueueItems([
      new File(["same"], "clip.mp4", { lastModified: 1 }),
      new File(["new"], "new.MOV", { lastModified: 2 }),
      new File(["bad"], "notes.txt", { lastModified: 3 })
    ], existing);

    expect(result.skipped).toBe(2);
    expect(result.items).toEqual([expect.objectContaining({ name: "new.MOV", status: "queued" })]);

    const imported = buildQueueItemsFromImports([
      { path: "C:/clips/a.mp4", name: "a.mp4", size: 10, lastModified: 1 },
      { path: "C:/clips/a.mp4", name: "a.mp4", size: 10, lastModified: 1 }
    ], []);

    expect(imported.skipped).toBe(1);
    expect(imported.items).toHaveLength(1);
  });
});
