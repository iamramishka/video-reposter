import { contextBridge, ipcRenderer } from "electron";
import type { DeviceInfo } from "../shared/license.js";
import type { FfmpegJob, ImportedVideoFile, OutputNamingOptions, OutputOverrides, PlatformPreset, TransformSettings } from "../shared/processing.js";
import type { ProbeResult, ProcessingJobRequest, ProcessingUpdate } from "../main/processingService.js";
import type { DiskSpaceInfo } from "../main/diskMonitor.js";
import type { ProcessingAvailability, ProcessingFailureResult } from "../shared/processingFailure.js";
import type { ProcessingTelemetryPayload } from "../shared/telemetry.js";

contextBridge.exposeInMainWorld("videoReposter", {
  getDeviceInfo: () => ipcRenderer.invoke("license:getDeviceInfo") as Promise<DeviceInfo>,
  getLicenseStatus: () => ipcRenderer.invoke("license:getStatus"),
  activateLicense: (key: string) => ipcRenderer.invoke("license:activate", key),
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
  showItemInFolder: (path: string) => ipcRenderer.invoke("shell:showItemInFolder", path) as Promise<void>,
  getVideoPreviewUrl: (path: string) => ipcRenderer.invoke("files:getPreviewUrl", path) as Promise<string | null>,
  getProcessingPresets: () => ipcRenderer.invoke("processing:getPresets") as Promise<PlatformPreset[]>,
  appendProcessingLog: (message: string) => ipcRenderer.invoke("processing:appendLog", message) as Promise<string>,
  getProcessingLogPath: () => ipcRenderer.invoke("processing:getLogPath") as Promise<string>,
  openProcessingLog: () => ipcRenderer.invoke("processing:openLog") as Promise<string>,
  checkFfmpeg: () => ipcRenderer.invoke("processing:checkFfmpeg") as Promise<ProcessingAvailability>,
  probeVideoFile: (path: string) => ipcRenderer.invoke("processing:probeFile", path) as Promise<ProbeResult>,
  buildProcessingCommand: (job: FfmpegJob) => ipcRenderer.invoke("processing:buildCommand", job) as Promise<string>,
  startProcessingJob: (job: ProcessingJobRequest) => ipcRenderer.invoke("processing:startJob", job) as Promise<{ id: string; args: string[] }>,
  startProcessingFile: (path: string, presetId: string, outputDir?: string, transforms?: TransformSettings, outputNaming?: OutputNamingOptions, outputOverrides?: OutputOverrides) =>
    ipcRenderer.invoke("processing:startFile", path, presetId, outputDir, transforms, outputNaming, outputOverrides) as Promise<
      { ok: true; id: string; args: string[]; outputPath: string; probe: ProbeResult; preset: PlatformPreset } | ProcessingFailureResult
    >,
  stopProcessingJob: (id: string) => ipcRenderer.invoke("processing:stopJob", id) as Promise<boolean>,
  selectVideoFiles: () => ipcRenderer.invoke("files:selectVideos") as Promise<ImportedVideoFile[]>,
  selectVideoFolder: () => ipcRenderer.invoke("files:selectVideoFolder") as Promise<ImportedVideoFile[]>,
  selectOutputFolder: () => ipcRenderer.invoke("files:selectOutputFolder") as Promise<string | null>,
  checkDiskSpace: (targetPath: string) => ipcRenderer.invoke("files:checkDiskSpace", targetPath) as Promise<DiskSpaceInfo>,
  sendProcessingTelemetry: (licenseKey: string, payload: ProcessingTelemetryPayload) => ipcRenderer.invoke("telemetry:processing", licenseKey, payload) as Promise<boolean>,
  onProcessingUpdate: (callback: (update: ProcessingUpdate) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, update: ProcessingUpdate) => callback(update);
    ipcRenderer.on("processing:update", listener);
    return () => ipcRenderer.removeListener("processing:update", listener);
  }
});
