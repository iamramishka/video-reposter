import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { IpcMainInvokeEvent, OpenDialogOptions } from "electron";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { LicenseClient } from "./licenseClient.js";
import { appendProcessingLog, getProcessingLogPath, trimProcessingLogs } from "./processingLog.js";
import { ProcessingService } from "./processingService.js";
import { AutoUpdateService } from "./autoUpdateService.js";
import { isProcessingTelemetryPayload } from "../shared/telemetry.js";
import { checkDiskSpace } from "./diskMonitor.js";
import { getStableDeviceId, readLicenseCache, writeLicenseCache } from "./licenseCache.js";
import { isLicenseKey, normalizeLicenseKey, stateFromCache } from "../shared/license.js";
import { productName } from "../shared/branding.js";
import { applyOutputOverrides, buildFfmpegCommand, isSupportedVideoPath, platformPresets, renderOutputFileName } from "../shared/processing.js";
import { invalidVideoFailure, outputFolderFailure } from "../shared/processingFailure.js";
import type { ProcessingJobRequest } from "./processingService.js";
import type { FfmpegJob, ImportedVideoFile, OutputNamingOptions, OutputOverrides, TransformSettings } from "../shared/processing.js";

const serverUrl = process.env.VITE_LICENSE_SERVER_URL ?? "https://video-reposter.vercel.app";
const licenseClient = new LicenseClient(serverUrl);
let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const rendererPath = path.join(app.getAppPath(), "dist-renderer/index.html");
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: productName,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist-electron/preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow = window;

  window.on("closed", () => {
    mainWindow = null;
  });

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    const message = `Renderer failed to load ${validatedURL}: ${errorCode} ${errorDescription}`;
    console.error(message);
    if (app.isPackaged) {
      void dialog.showMessageBox(window, {
        type: "error",
        title: `${productName} could not load`,
        message: "The app window could not load its interface.",
        detail: message
      });
    }
  });

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[renderer] ${sourceId}:${line} ${message}`);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (!app.isPackaged) {
    void window.loadURL("http://127.0.0.1:5173");
  } else {
    void window.loadFile(rendererPath).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown renderer load error";
      console.error(`Renderer loadFile failed for ${rendererPath}: ${message}`);
      void dialog.showMessageBox(window, {
        type: "error",
        title: `${productName} could not load`,
        message: "The app window could not load its interface.",
        detail: message
      });
    });
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

function getDefaultOutputPath(inputPath: string, presetId: string, selectedOutputDir?: string, outputNaming?: OutputNamingOptions) {
  const parsed = path.parse(inputPath);
  const outputDir = selectedOutputDir?.trim() ? selectedOutputDir : path.join(parsed.dir, "VideoReposterOutput");
  mkdirSync(outputDir, { recursive: true }); // may throw — caller wraps in try-catch
  return path.join(outputDir, renderOutputFileName(inputPath, presetId, outputNaming));
}

function showOpenDialogWithParent(event: IpcMainInvokeEvent, options: OpenDialogOptions) {
  const parent = BrowserWindow.fromWebContents(event.sender) ?? mainWindow ?? BrowserWindow.getFocusedWindow();
  if (parent) {
    if (parent.isMinimized()) parent.restore();
    parent.show();
    parent.focus();
  }
  return parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options);
}

app.whenReady().then(() => {
  trimProcessingLogs(app.getPath("userData"), 30);

  const processingService = new ProcessingService((update) => {
    let logLine = `[${update.status}] ${update.id} ${update.progress}% ${update.failure?.technicalMessage ?? update.message ?? ""}`.trim();
    if (update.elapsedMs !== undefined) {
      logLine += ` | ${(update.elapsedMs / 1000).toFixed(1)}s`;
      if (update.throughputMbPerMin !== undefined) logLine += ` | ${update.throughputMbPerMin} MB/min`;
    }
    appendProcessingLog(app.getPath("userData"), logLine);
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("processing:update", update));
  });

  // Kill any in-flight FFmpeg jobs when the app is quitting so we never leave
  // orphaned encoder processes running in the background.
  app.on("before-quit", () => processingService.stopAll());

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
  ipcMain.handle("files:getPreviewUrl", (_event, filePath: string) => isSupportedVideoPath(filePath) ? pathToFileURL(filePath).href : null);
  ipcMain.handle("processing:appendLog", (_event, message: string) => appendProcessingLog(app.getPath("userData"), message));
  ipcMain.handle("processing:getLogPath", () => getProcessingLogPath(app.getPath("userData")));
  ipcMain.handle("processing:openLog", () => shell.openPath(getProcessingLogPath(app.getPath("userData"))));
  ipcMain.handle("processing:getPresets", () => platformPresets);
  ipcMain.handle("processing:checkFfmpeg", () => processingService.checkFfmpeg());
  ipcMain.handle("processing:probeFile", (_event, inputPath: string) => processingService.probeFile(inputPath));
  ipcMain.handle("processing:buildCommand", (_event, job: FfmpegJob) => buildFfmpegCommand(job));
  ipcMain.handle("processing:startJob", (_event, request: ProcessingJobRequest) => processingService.startJob(request));
  ipcMain.handle("processing:startFile", async (_event, inputPath: string, presetId = "instagram-reel", outputDir?: string, transforms?: TransformSettings, outputNaming?: OutputNamingOptions, outputOverrides?: OutputOverrides) => {
    const preset = platformPresets.find((item) => item.id === presetId) ?? platformPresets.find((item) => item.id === "instagram-reel");
    if (!preset) throw new Error("Default processing preset is missing.");
    let outputPath: string;
    try {
      outputPath = getDefaultOutputPath(inputPath, preset.id, outputDir, outputNaming);
    } catch (error) {
      const failure = outputFolderFailure(`Could not create output folder: ${error instanceof Error ? error.message : String(error)}`);
      return { ok: false, message: failure.message, failure };
    }
    const probe = await processingService.probeFile(inputPath);
    if (!probe.valid) {
      const failure = invalidVideoFailure(probe.message ?? "Video validation failed.");
      return { ok: false, message: failure.message, failure };
    }
    const inputSizeBytes = (() => { try { return statSync(inputPath).size; } catch { return undefined; } })();
    return {
      ok: true,
      ...processingService.startJob({
        inputPath,
        outputPath,
        output: applyOutputOverrides(preset.settings, outputOverrides),
        transforms,
        durationSeconds: probe.durationSeconds,
        inputSizeBytes
      }),
      outputPath,
      probe,
      preset
    };
  });
  ipcMain.handle("processing:stopJob", (_event, id: string) => processingService.stopJob(id));
  ipcMain.handle("telemetry:processing", (_event, licenseKey: string, payload: unknown) =>
    isProcessingTelemetryPayload(payload) ? licenseClient.sendProcessingTelemetry(licenseKey, payload) : false
  );
  ipcMain.handle("files:checkDiskSpace", (_event, targetPath: string) => checkDiskSpace(targetPath));

  ipcMain.handle("files:selectVideos", async (event) => {
    const result = await showOpenDialogWithParent(event, {
      title: "Select videos",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Videos", extensions: ["mp4", "mov", "avi", "mkv", "webm", "flv"] }]
    });
    return result.canceled ? [] : getImportedVideoFiles(result.filePaths);
  });
  ipcMain.handle("files:selectVideoFolder", async (event) => {
    const result = await showOpenDialogWithParent(event, {
      title: "Select video folder",
      properties: ["openDirectory"]
    });
    return result.canceled || !result.filePaths[0] ? [] : getVideoFilesInFolder(result.filePaths[0]);
  });
  ipcMain.handle("files:selectOutputFolder", async (event) => {
    const result = await showOpenDialogWithParent(event, {
      title: "Select output folder",
      properties: ["openDirectory", "createDirectory"]
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  createWindow();

  const updateService = new AutoUpdateService({
    app,
    dialog,
    getMainWindow: () => mainWindow,
    updateUrl: process.env.VIDEO_REPOSTER_UPDATE_URL,
    allowInDev: process.env.VIDEO_REPOSTER_UPDATES_IN_DEV === "1",
    log: (message) => appendProcessingLog(app.getPath("userData"), message)
  });
  updateService.start();
  app.on("before-quit", () => updateService.stop());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
