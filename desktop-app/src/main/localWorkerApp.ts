import express from "express";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { LicenseClient } from "./licenseClient.js";
import { appendProcessingLog, getProcessingLogPath } from "./processingLog.js";
import { ProcessingService } from "./processingService.js";
import { getStableDeviceId, readLicenseCache, writeLicenseCache } from "./licenseCache.js";
import { isLicenseKey, normalizeLicenseKey, stateFromCache } from "../shared/license.js";
import { buildFfmpegCommand, isSupportedVideoPath, platformPresets } from "../shared/processing.js";
import { invalidVideoFailure, outputFolderFailure } from "../shared/processingFailure.js";
import type { DeviceInfo } from "../shared/license.js";
import type { FfmpegJob, ImportedVideoFile, TransformSettings } from "../shared/processing.js";
import type { ProcessingJobRequest, ProcessingUpdate } from "./processingService.js";

export type NativeDialogs = {
  selectVideos(): Promise<string[]>;
  selectVideoFolder(): Promise<string | null>;
  selectOutputFolder(): Promise<string | null>;
};

export type NativeShell = {
  openExternal(url: string): Promise<unknown>;
  showItemInFolder(filePath: string): unknown;
  openPath(filePath: string): Promise<string>;
};

export type LocalWorkerAppOptions = {
  userDataPath: string;
  deviceName: string;
  osName: string;
  rendererPath: string;
  dialogs: NativeDialogs;
  shell: NativeShell;
  serverUrl?: string;
  processingService?: ProcessingService;
};

type EventClient = {
  write(chunk: string): void;
};

export function createLocalWorkerApp(options: LocalWorkerAppOptions) {
  const api = express();
  const clients = new Set<EventClient>();
  const licenseClient = new LicenseClient(options.serverUrl ?? process.env.VITE_LICENSE_SERVER_URL ?? "https://video-reposter.vercel.app");
  const processingService =
    options.processingService ??
    new ProcessingService((update) => {
      appendProcessingLog(options.userDataPath, `[${update.status}] ${update.id} ${update.progress}% ${update.failure?.technicalMessage ?? update.message ?? ""}`.trim());
      broadcast(clients, update);
    });

  api.use(express.json({ limit: "1mb" }));

  api.get("/api/local/health", (_req, res) => {
    res.json({ ok: true, service: "video-reposter-local-worker" });
  });

  api.get("/api/local/device-info", (_req, res) => {
    res.json({ value: getDeviceInfo(options) });
  });

  api.get("/api/local/license/status", async (_req, res, next) => {
    try {
      res.json({ value: await getLicenseStatus(options, licenseClient) });
    } catch (error) {
      next(error);
    }
  });

  api.post("/api/local/license/activate", async (req, res, next) => {
    try {
      const key = normalizeLicenseKey(String((req.body as { key?: unknown }).key ?? ""));
      if (!isLicenseKey(key)) {
        res.json({ value: { ok: false, code: "LIC_FORMAT", message: "Use format VDRP-XXXX-XXXX-XXXX-XXXX." } });
        return;
      }
      const device = getDeviceInfo(options);
      const result = await licenseClient.activate(key, device);
      if (result.ok && result.license) {
        const cache = { ...result.license, device_id: device.deviceId, last_verified: new Date().toISOString() };
        writeLicenseCache(options.userDataPath, cache);
        res.json({ value: { ok: true, license: cache } });
        return;
      }
      res.json({ value: result });
    } catch (error) {
      next(error);
    }
  });

  api.post("/api/local/open-external", async (req, res, next) => {
    try {
      await options.shell.openExternal(String((req.body as { url?: unknown }).url ?? ""));
      res.json({ value: undefined });
    } catch (error) {
      next(error);
    }
  });

  api.post("/api/local/show-item-in-folder", (req, res, next) => {
    try {
      options.shell.showItemInFolder(String((req.body as { path?: unknown }).path ?? ""));
      res.json({ value: undefined });
    } catch (error) {
      next(error);
    }
  });

  api.get("/api/local/processing/presets", (_req, res) => {
    res.json({ value: platformPresets });
  });

  api.post("/api/local/processing/log", (req, res, next) => {
    try {
      res.json({ value: appendProcessingLog(options.userDataPath, String((req.body as { message?: unknown }).message ?? "")) });
    } catch (error) {
      next(error);
    }
  });

  api.get("/api/local/processing/log-path", (_req, res, next) => {
    try {
      res.json({ value: getProcessingLogPath(options.userDataPath) });
    } catch (error) {
      next(error);
    }
  });

  api.get("/api/local/processing/ffmpeg", async (_req, res, next) => {
    try {
      res.json({ value: await processingService.checkFfmpeg() });
    } catch (error) {
      next(error);
    }
  });

  api.post("/api/local/processing/open-log", async (_req, res, next) => {
    try {
      res.json({ value: await options.shell.openPath(getProcessingLogPath(options.userDataPath)) });
    } catch (error) {
      next(error);
    }
  });

  api.post("/api/local/processing/probe-file", async (req, res, next) => {
    try {
      res.json({ value: await processingService.probeFile(String((req.body as { inputPath?: unknown }).inputPath ?? "")) });
    } catch (error) {
      next(error);
    }
  });

  api.post("/api/local/processing/build-command", (req, res, next) => {
    try {
      res.json({ value: buildFfmpegCommand((req.body as { job?: FfmpegJob }).job as FfmpegJob) });
    } catch (error) {
      next(error);
    }
  });

  api.post("/api/local/processing/start-job", (req, res, next) => {
    try {
      res.json({ value: processingService.startJob((req.body as { job?: ProcessingJobRequest }).job as ProcessingJobRequest) });
    } catch (error) {
      next(error);
    }
  });

  api.post("/api/local/processing/start-file", async (req, res, next) => {
    try {
      const body = req.body as { inputPath?: unknown; presetId?: unknown; outputDir?: unknown; transforms?: TransformSettings };
      const inputPath = String(body.inputPath ?? "");
      const presetId = String(body.presetId ?? "instagram-reel");
      const preset = platformPresets.find((item) => item.id === presetId) ?? platformPresets.find((item) => item.id === "instagram-reel");
      if (!preset) throw new Error("Default processing preset is missing.");
      const outputDir = typeof body.outputDir === "string" ? body.outputDir : undefined;
      let outputPath: string;
      try {
        outputPath = getDefaultOutputPath(inputPath, preset.id, outputDir);
      } catch (error) {
        const failure = outputFolderFailure(`Could not create output folder: ${error instanceof Error ? error.message : String(error)}`);
        res.json({ value: { ok: false, message: failure.message, failure } });
        return;
      }
      const probe = await processingService.probeFile(inputPath);
      if (!probe.valid) {
        const failure = invalidVideoFailure(probe.message ?? "Video validation failed.");
        res.json({ value: { ok: false, message: failure.message, failure } });
        return;
      }
      res.json({
        value: {
          ok: true,
          ...processingService.startJob({
            inputPath,
            outputPath,
            output: preset.settings,
            transforms: body.transforms,
            durationSeconds: probe.durationSeconds
          }),
          outputPath,
          probe,
          preset
        }
      });
    } catch (error) {
      next(error);
    }
  });

  api.post("/api/local/processing/stop-job", (req, res, next) => {
    try {
      res.json({ value: processingService.stopJob(String((req.body as { id?: unknown }).id ?? "")) });
    } catch (error) {
      next(error);
    }
  });

  api.get("/api/local/processing/events", (req, res) => {
    res.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream"
    });
    res.write("\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  });

  api.post("/api/local/files/select-videos", async (_req, res, next) => {
    try {
      res.json({ value: getImportedVideoFiles(await options.dialogs.selectVideos()) });
    } catch (error) {
      next(error);
    }
  });

  api.post("/api/local/files/select-video-folder", async (_req, res, next) => {
    try {
      const folder = await options.dialogs.selectVideoFolder();
      res.json({ value: folder ? getVideoFilesInFolder(folder) : [] });
    } catch (error) {
      next(error);
    }
  });

  api.post("/api/local/files/select-output-folder", async (_req, res, next) => {
    try {
      res.json({ value: await options.dialogs.selectOutputFolder() });
    } catch (error) {
      next(error);
    }
  });

  api.get("/api/local/files/preview", (req, res) => {
    const filePath = String(req.query.path ?? "");
    if (!isSupportedVideoPath(filePath)) {
      res.status(400).end();
      return;
    }
    try {
      const stat = statSync(filePath);
      if (!stat.isFile()) {
        res.status(404).end();
        return;
      }
      res.sendFile(path.resolve(filePath));
    } catch {
      res.status(404).end();
    }
  });

  api.use(express.static(options.rendererPath));
  api.use((_req, res) => {
    res.sendFile(path.join(options.rendererPath, "index.html"));
  });

  api.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected local worker error.";
    res.status(500).json({ message });
  });

  return { app: api, broadcast: (update: ProcessingUpdate) => broadcast(clients, update) };
}

function getDeviceInfo(options: LocalWorkerAppOptions): DeviceInfo {
  return {
    deviceId: getStableDeviceId(options.userDataPath),
    deviceName: options.deviceName,
    os: options.osName
  };
}

async function getLicenseStatus(options: LocalWorkerAppOptions, licenseClient: LicenseClient) {
  const device = getDeviceInfo(options);
  const cache = readLicenseCache(options.userDataPath, device.deviceId);
  const state = stateFromCache(cache);
  if (cache && state === "NETWORK_ERROR") {
    const validation = await licenseClient.validate(cache.license_key, device);
    if (validation.ok && validation.license) {
      const next = { ...validation.license, last_verified: new Date().toISOString() };
      writeLicenseCache(options.userDataPath, next);
      return { state: "VALID", license: next };
    }
  }
  return { state, license: cache };
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

function broadcast(clients: Set<EventClient>, update: ProcessingUpdate) {
  const payload = `event: processing:update\ndata: ${JSON.stringify(update)}\n\n`;
  for (const client of clients) client.write(payload);
}
