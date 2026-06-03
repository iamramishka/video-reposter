import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { buildFfmpegArgs, parseFfmpegProgress } from "../shared/processing.js";
import type { FfmpegJob } from "../shared/processing.js";

const require = createRequire(import.meta.url);
const ffmpegStatic = require("ffmpeg-static") as string | null;
const ffprobeStatic = require("ffprobe-static") as { path: string };

export type ProcessingStatus = "processing" | "complete" | "failed" | "stopped";

export type ProcessingUpdate = {
  id: string;
  status: ProcessingStatus;
  progress: number;
  currentSeconds?: number;
  message?: string;
};

export type ProcessingJobRequest = FfmpegJob & {
  durationSeconds?: number;
};

export type ProbeResult = {
  valid: boolean;
  durationSeconds?: number;
  codec?: string;
  width?: number;
  height?: number;
  message?: string;
};

type ProcessFactory = (command: string, args: string[]) => ChildProcessWithoutNullStreams;

type ProcessingTools = {
  ffmpeg: string;
  ffprobe: string;
};

export class ProcessingService {
  private readonly processes = new Map<string, ChildProcessWithoutNullStreams>();
  private readonly tools: ProcessingTools;

  constructor(
    private readonly onUpdate: (update: ProcessingUpdate) => void,
    private readonly processFactory: ProcessFactory = spawn,
    tools?: ProcessingTools
  ) {
    this.tools = tools ?? (processFactory === spawn ? resolveProcessingTools() : { ffmpeg: "ffmpeg", ffprobe: "ffprobe" });
  }

  startJob(request: ProcessingJobRequest) {
    const id = randomUUID();
    const args = buildFfmpegArgs(request);
    const child = this.processFactory(this.tools.ffmpeg, args);
    this.processes.set(id, child);

    this.onUpdate({ id, status: "processing", progress: 0, message: "FFmpeg started." });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      const lines = chunk.split(/\r?\n/);
      for (const line of lines) {
        const parsed = request.durationSeconds ? parseFfmpegProgress(line, request.durationSeconds) : null;
        if (parsed) {
          this.onUpdate({ id, status: "processing", progress: parsed.progress, currentSeconds: parsed.currentSeconds });
        }
      }
    });

    child.on("error", (error) => {
      this.processes.delete(id);
      this.onUpdate({ id, status: "failed", progress: 0, message: error.message });
    });

    child.on("close", (code, signal) => {
      this.processes.delete(id);
      if (signal === "SIGTERM") {
        this.onUpdate({ id, status: "stopped", progress: 0, message: "Processing stopped." });
        return;
      }
      if (code === 0) {
        this.onUpdate({ id, status: "complete", progress: 100, message: "Processing complete." });
        return;
      }
      this.onUpdate({ id, status: "failed", progress: 0, message: `FFmpeg exited with code ${code ?? "unknown"}.` });
    });

    return { id, args };
  }

  stopJob(id: string) {
    const child = this.processes.get(id);
    if (!child) return false;
    child.kill("SIGTERM");
    return true;
  }

  async checkFfmpeg() {
    return new Promise<{ available: boolean; message: string }>((resolve) => {
      const child = this.processFactory(this.tools.ffmpeg, ["-version"]);
      let output = "";

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
      });

      child.on("error", () => {
        resolve({ available: false, message: "FFmpeg was not found on PATH." });
      });

      child.on("close", (code) => {
        if (code === 0) {
          const versionLine = output.split(/\r?\n/)[0] || "FFmpeg is available.";
          resolve({ available: true, message: versionLine });
          return;
        }
        resolve({ available: false, message: `FFmpeg check failed with code ${code ?? "unknown"}.` });
      });
    });
  }

  async probeFile(inputPath: string) {
    return new Promise<ProbeResult>((resolve) => {
      const child = this.processFactory(this.tools.ffprobe, [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "format=duration:stream=codec_name,width,height",
        "-of",
        "json",
        inputPath
      ]);
      let output = "";
      let errorOutput = "";

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        errorOutput += chunk;
      });
      child.on("error", () => {
        resolve({ valid: false, message: "FFprobe was not found on PATH." });
      });
      child.on("close", (code) => {
        if (code !== 0) {
          resolve({ valid: false, message: errorOutput.trim() || `FFprobe exited with code ${code ?? "unknown"}.` });
          return;
        }
        try {
          resolve(parseProbeJson(output));
        } catch (error) {
          resolve({ valid: false, message: error instanceof Error ? error.message : "Unable to parse FFprobe output." });
        }
      });
    });
  }
}

function resolveProcessingTools(): ProcessingTools {
  return {
    ffmpeg: resolveToolPath("ffmpeg.exe", ffmpegStatic, "ffmpeg"),
    ffprobe: resolveToolPath("ffprobe.exe", ffprobeStatic.path, "ffprobe")
  };
}

function resolveToolPath(fileName: string, staticPath: string | null | undefined, fallbackCommand: string) {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    const packagedPath = join(resourcesPath, "bin", fileName);
    if (existsSync(packagedPath)) return packagedPath;
  }
  if (staticPath && existsSync(staticPath)) return staticPath;
  return fallbackCommand;
}

function parseProbeJson(output: string): ProbeResult {
  const parsed = JSON.parse(output) as {
    streams?: Array<{ codec_name?: string; width?: number; height?: number }>;
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  const durationSeconds = Number(parsed.format?.duration);

  if (!stream) return { valid: false, message: "No video stream found." };
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return { valid: false, message: "Video duration is unavailable." };

  return {
    valid: true,
    durationSeconds,
    codec: stream.codec_name,
    width: stream.width,
    height: stream.height
  };
}
