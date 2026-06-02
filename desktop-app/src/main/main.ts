import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { LicenseClient } from "./licenseClient.js";
import { appendProcessingLog, getProcessingLogPath } from "./processingLog.js";
import { ProcessingService } from "./processingService.js";
import { getStableDeviceId, readLicenseCache, writeLicenseCache } from "./licenseCache.js";
import { isLicenseKey, normalizeLicenseKey, stateFromCache } from "../shared/license.js";
import { buildFfmpegCommand, isSupportedVideoPath, platformPresets } from "../shared/processing.js";
import type { ProcessingJobRequest } from "./processingService.js";
import type { FfmpegJob, ImportedVideoFile, TransformSettings } from "../shared/processing.js";

const serverUrl = process.env.VITE_LICENSE_SERVER_URL ?? "http://localhost:4000";
const licenseClient = new LicenseClient(serverUrl);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: "Video Batch Processor",
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist-electron/preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (!app.isPackaged) {
    void mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    void mainWindow.loadFile(path.join(app.getAppPath(), "dist-renderer/index.html"));
  }
}

function getDeviceInfo() {
  const deviceId = getStableDeviceId(app.getPath("userData"));
  return {
    deviceId,
    deviceName: os.hostname(),
    os: `${os.type()} ${os.release()}`
  };
}

function getImportedVideoFiles(filePaths: string[]): ImportedVideoFile[] {
  return filePaths.flatMap((filePath) => {
    if (!isSupportedVideoPath(filePath)) return [];
    try {
      const stat = statSync(filePath);
      if (!stat.isFile()) return [];
      return [{ path: filePath, name: path.basename(filePath), size: stat.size, lastModified: stat.mtimeMs }];
    } catch {
      return [];
    }
  });
}

function getVideoFilesInFolder(folderPath: string) {
  const files: string[] = [];
  const pending = [folderPath];

  while (pending.length) {
    const current = pending.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile() && isSupportedVideoPath(entryPath)) {
        files.push(entryPath);
      }
    }
  }

  return getImportedVideoFiles(files);
}

function getDefaultOutputPath(inputPath: string, presetId: string, selectedOutputDir?: string) {
  const parsed = path.parse(inputPath);
  const outputDir = selectedOutputDir?.trim() ? selectedOutputDir : path.join(parsed.dir, "VideoReposterOutput");
  mkdirSync(outputDir, { recursive: true });
  return path.join(outputDir, `${parsed.name}_${presetId}_processed.mp4`);
}

app.whenReady().then(() => {
  const processingService = new ProcessingService((update) => {
    appendProcessingLog(app.getPath("userData"), `[${update.status}] ${update.id} ${update.progress}% ${update.message ?? ""}`.trim());
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("processing:update", update));
  });

  ipcMain.handle("license:getDeviceInfo", () => getDeviceInfo());

  ipcMain.handle("license:getStatus", async () => {
    const device = getDeviceInfo();
    const cache = readLicenseCache(app.getPath("userData"), device.deviceId);
    const state = stateFromCache(cache);
    if (cache && state === "NETWORK_ERROR") {
      const validation = await licenseClient.validate(cache.license_key, device);
      if (validation.ok && validation.license) {
        const next = { ...validation.license, last_verified: new Date().toISOString() };
        writeLicenseCache(app.getPath("userData"), next);
        return { state: "VALID", license: next };
      }
    }
    return { state, license: cache };
  });

  ipcMain.handle("license:activate", async (_event, keyInput: string) => {
    const key = normalizeLicenseKey(keyInput);
    if (!isLicenseKey(key)) return { ok: false, code: "LIC_FORMAT", message: "Use format VDRP-XXXX-XXXX-XXXX-XXXX." };

    const device = getDeviceInfo();
    const result = await licenseClient.activate(key, device);
    if (result.ok && result.license) {
      const cache = { ...result.license, device_id: device.deviceId, last_verified: new Date().toISOString() };
      writeLicenseCache(app.getPath("userData"), cache);
      return { ok: true, license: cache };
    }
    return result;
  });

  ipcMain.handle("shell:openExternal", (_event, url: string) => shell.openExternal(url));
  ipcMain.handle("shell:showItemInFolder", (_event, filePath: string) => shell.showItemInFolder(filePath));
  ipcMain.handle("processing:appendLog", (_event, message: string) => appendProcessingLog(app.getPath("userData"), message));
  ipcMain.handle("processing:getLogPath", () => getProcessingLogPath(app.getPath("userData")));
  ipcMain.handle("processing:openLog", () => shell.openPath(getProcessingLogPath(app.getPath("userData"))));
  ipcMain.handle("processing:getPresets", () => platformPresets);
  ipcMain.handle("processing:checkFfmpeg", () => processingService.checkFfmpeg());
  ipcMain.handle("processing:probeFile", (_event, inputPath: string) => processingService.probeFile(inputPath));
  ipcMain.handle("processing:buildCommand", (_event, job: FfmpegJob) => buildFfmpegCommand(job));
  ipcMain.handle("processing:startJob", (_event, request: ProcessingJobRequest) => processingService.startJob(request));
  ipcMain.handle("processing:startFile", async (_event, inputPath: string, presetId = "instagram-reel", outputDir?: string, transforms?: TransformSettings) => {
    const preset = platformPresets.find((item) => item.id === presetId) ?? platformPresets.find((item) => item.id === "instagram-reel");
    if (!preset) throw new Error("Default processing preset is missing.");
    const outputPath = getDefaultOutputPath(inputPath, preset.id, outputDir);
    const probe = await processingService.probeFile(inputPath);
    if (!probe.valid) {
      return { ok: false, message: probe.message ?? "Video validation failed." };
    }
    return {
      ok: true,
      ...processingService.startJob({
        inputPath,
        outputPath,
        output: preset.settings,
        transforms,
        durationSeconds: probe.durationSeconds
      }),
      outputPath,
      probe,
      preset
    };
  });
  ipcMain.handle("processing:stopJob", (_event, id: string) => processingService.stopJob(id));
  ipcMain.handle("files:selectVideos", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select videos",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Videos", extensions: ["mp4", "mov", "avi", "mkv", "webm", "flv"] }]
    });
    return result.canceled ? [] : getImportedVideoFiles(result.filePaths);
  });
  ipcMain.handle("files:selectVideoFolder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select video folder",
      properties: ["openDirectory"]
    });
    return result.canceled || !result.filePaths[0] ? [] : getVideoFilesInFolder(result.filePaths[0]);
  });
  ipcMain.handle("files:selectOutputFolder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select output folder",
      properties: ["openDirectory", "createDirectory"]
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
