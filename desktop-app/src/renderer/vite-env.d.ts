/// <reference types="vite/client" />

import type { DeviceInfo } from "../shared/license";
import type { FfmpegJob, ImportedVideoFile, PlatformPreset, TransformSettings } from "../shared/processing";
import type { ProbeResult, ProcessingJobRequest, ProcessingUpdate } from "../main/processingService";

declare global {
  interface Window {
    videoReposter: {
      getDeviceInfo(): Promise<DeviceInfo>;
      getLicenseStatus(): Promise<{ state: string; license: unknown }>;
      activateLicense(key: string): Promise<{ ok: boolean; code?: string; message?: string; license?: unknown }>;
      openExternal(url: string): Promise<void>;
      showItemInFolder(path: string): Promise<void>;
      getProcessingPresets(): Promise<PlatformPreset[]>;
      appendProcessingLog(message: string): Promise<string>;
      getProcessingLogPath(): Promise<string>;
      openProcessingLog(): Promise<string>;
      checkFfmpeg(): Promise<{ available: boolean; message: string }>;
      probeVideoFile(path: string): Promise<ProbeResult>;
      buildProcessingCommand(job: FfmpegJob): Promise<string>;
      startProcessingJob(job: ProcessingJobRequest): Promise<{ id: string; args: string[] }>;
      startProcessingFile(path: string, presetId: string, outputDir?: string, transforms?: TransformSettings): Promise<
        { ok: true; id: string; args: string[]; outputPath: string; probe: ProbeResult; preset: PlatformPreset } | { ok: false; message: string }
      >;
      stopProcessingJob(id: string): Promise<boolean>;
      selectVideoFiles(): Promise<ImportedVideoFile[]>;
      selectVideoFolder(): Promise<ImportedVideoFile[]>;
      selectOutputFolder(): Promise<string | null>;
      onProcessingUpdate(callback: (update: ProcessingUpdate) => void): () => void;
    };
  }
}
