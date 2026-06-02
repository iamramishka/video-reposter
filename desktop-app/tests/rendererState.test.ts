import { describe, expect, it } from "vitest";
import {
  defaultPreferences,
  historyStorageKey,
  loadHistory,
  loadPreferences,
  loadQueue,
  preferencesStorageKey,
  queueStorageKey,
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

  it("validates stored processing preferences", () => {
    const storage = memoryStorage({
      [preferencesStorageKey]: JSON.stringify({
        selectedPresetId: "not-real",
        outputDir: "C:/Output",
        maxWorkers: 99,
        transforms: {
          brightness: 500,
          contrast: -500,
          saturation: "nope",
          sharpness: 999,
          volume: -20,
          rotateDegrees: 45,
          mirrorHorizontal: true
        }
      })
    });

    expect(loadPreferences(storage)).toEqual({
      selectedPresetId: defaultPreferences.selectedPresetId,
      outputDir: "C:/Output",
      maxWorkers: 4,
      transforms: {
        mirrorHorizontal: true,
        mirrorVertical: undefined,
        removeAudio: undefined,
        rotateDegrees: undefined,
        brightness: 50,
        contrast: -50,
        saturation: 0,
        sharpness: 100,
        volume: 0
      }
    });
  });

  it("saves preferences and keeps history to the newest fifty entries", () => {
    const storage = memoryStorage();
    const preferences: ProcessingPreferences = {
      selectedPresetId: "tiktok",
      outputDir: "C:/Output",
      maxWorkers: 3,
      transforms: { volume: 80 }
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

  it("summarizes non-default transforms", () => {
    expect(summarizeTransforms({ mirrorHorizontal: true, rotateDegrees: 90, volume: 80 })).toBe("mirror, 90 deg, volume");
    expect(summarizeTransforms({ brightness: 0, volume: 100 })).toBeUndefined();
  });
});
