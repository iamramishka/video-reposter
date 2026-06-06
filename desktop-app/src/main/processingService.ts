import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { buildFfmpegArgs, parseFfmpegProgress } from "../shared/processing.js";
import type { FfmpegJob } from "../shared/processing.js";
import { classifyProcessingFailure, componentUnavailableFailure, processingFailedFailure } from "../shared/processingFailure.js";
import type { ProcessingAvailability, ProcessingFailure } from "../shared/processingFailure.js";

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
  failure?: ProcessingFailure;
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

    // Keep a rolling buffer of the most recent stderr lines so a failed job can
    // report *why* FFmpeg failed instead of just an exit code.
    const stderrTail: string[] = [];
    // Guard so only the first of the "error"/"close" events emits a terminal
    // update. Without this, a spawn failure can fire both and produce
    // contradictory "failed" updates for the same job.
    let settled = false;
    const settle = (update: ProcessingUpdate) => {
      if (settled) return;
      settled = true;
      this.processes.delete(id);
      this.onUpdate(update);
    };

    this.onUpdate({ id, status: "processing", progress: 0, message: "FFmpeg started." });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      const lines = chunk.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          stderrTail.push(trimmed);
          if (stderrTail.length > 12) stderrTail.shift();
        }
        const parsed = request.durationSeconds ? parseFfmpegProgress(line, request.durationSeconds) : null;
        if (parsed) {
          this.onUpdate({ id, status: "processing", progress: parsed.progress, currentSeconds: parsed.currentSeconds });
        }
      }
    });

    child.on("error", (error) => {
      const failure = classifyProcessingFailure(error.message);
      settle({ id, status: "failed", progress: 0, message: failure.message, failure });
    });

    child.on("close", (code, signal) => {
      if (signal === "SIGTERM" || signal === "SIGKILL") {
        settle({ id, status: "stopped", progress: 0, message: "Processing stopped." });
        return;
      }
      if (code === 0) {
        settle({ id, status: "complete", progress: 100, message: "Processing complete." });
        return;
      }
      const reason = stderrTail.length ? ` ${stderrTail.slice(-3).join(" ")}` : "";
      const failure = processingFailedFailure(`FFmpeg exited with code ${code ?? "unknown"}.${reason}`.trim());
      settle({ id, status: "failed", progress: 0, message: failure.message, failure });
    });

    return { id, args };
  }

  stopJob(id: string) {
    const child = this.processes.get(id);
    if (!child) return false;
    child.kill("SIGTERM");
    return true;
  }

  /**
   * Terminate every running FFmpeg process. Called on app quit so we never
   * leave orphaned encoders consuming CPU after the window closes.
   */
  stopAll() {
    for (const child of this.processes.values()) child.kill("SIGTERM");
    this.processes.clear();
  }

  async checkFfmpeg() {
    return new Promise<ProcessingAvailability>((resolve) => {
      const child = this.processFactory(this.tools.ffmpeg, ["-version"]);
      let output = "";
      let settled = false;
      const settle = (result: ProcessingAvailability) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
      });

      child.on("error", (error) => {
        const failure = componentUnavailableFailure(error.message);
        settle({ available: false, message: failure.message, technicalMessage: failure.technicalMessage, failure });
      });

      child.on("close", (code) => {
        if (code === 0) {
          const versionLine = output.split(/\r?\n/)[0] || "FFmpeg is available.";
          settle({ available: true, message: "Video processing is ready.", technicalMessage: versionLine });
          return;
        }
        const failure = componentUnavailableFailure(`FFmpeg check failed with code ${code ?? "unknown"}.`);
        settle({ available: false, message: failure.message, technicalMessage: failure.technicalMessage, failure });
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
