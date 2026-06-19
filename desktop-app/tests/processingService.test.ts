import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { parseHardwareAcceleration, ProcessingService } from "../src/main/processingService.js";
import type { ProcessingUpdate } from "../src/main/processingService.js";

class FakeStream extends EventEmitter {
  setEncoding(_encoding: BufferEncoding) {
    return this;
  }
}

class FakeProcess extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  killedWith: NodeJS.Signals | null = null;

  kill(signal?: NodeJS.Signals) {
    this.killedWith = signal ?? "SIGTERM";
    this.emit("close", null, this.killedWith);
    return true;
  }
}

function sampleJob() {
  return {
    inputPath: "in.mp4",
    outputPath: "out.mp4",
    durationSeconds: 120,
    output: { width: 1280, height: 720, fps: 30, videoBitrate: "2M", audioBitrate: "128k", codec: "libx264" as const }
  };
}

describe("ProcessingService", () => {
  it("starts ffmpeg and emits parsed progress updates", () => {
    const updates: ProcessingUpdate[] = [];
    const fake = new FakeProcess();
    const service = new ProcessingService((update) => updates.push(update), ((command, args) => {
      expect(command).toBe("ffmpeg");
      expect(args).toContain("-vf");
      return fake;
    }) as never);

    const started = service.startJob(sampleJob());
    fake.stderr.emit("data", "frame= 123 fps=30 time=00:01:00.00 bitrate=800kbits/s");
    fake.emit("close", 0, null);

    expect(started.id).toBeTruthy();
    expect(updates).toContainEqual(expect.objectContaining({ id: started.id, status: "processing", progress: 0 }));
    expect(updates).toContainEqual(expect.objectContaining({ id: started.id, status: "processing", progress: 50, currentSeconds: 60 }));
    expect(updates).toContainEqual(expect.objectContaining({ id: started.id, status: "complete", progress: 100 }));
  });

  it("stops a running job", () => {
    const updates: ProcessingUpdate[] = [];
    const fake = new FakeProcess();
    const service = new ProcessingService((update) => updates.push(update), (() => fake) as never);

    const started = service.startJob(sampleJob());

    expect(service.stopJob(started.id)).toBe(true);
    expect(fake.killedWith).toBe("SIGTERM");
    expect(updates).toContainEqual(expect.objectContaining({ id: started.id, status: "stopped" }));
    expect(service.stopJob(started.id)).toBe(false);
  });

  it("reports ffmpeg availability from version output", async () => {
    const versionProcess = new FakeProcess();
    const encodersProcess = new FakeProcess();
    const service = new ProcessingService(() => undefined, ((command, args) => {
      expect(command).toBe("ffmpeg");
      if (args[0] === "-version") {
        queueMicrotask(() => {
          versionProcess.stdout.emit("data", "ffmpeg version 7.0\ncopyright");
          versionProcess.emit("close", 0, null);
        });
        return versionProcess;
      }
      expect(args).toEqual(["-hide_banner", "-encoders"]);
      queueMicrotask(() => {
        encodersProcess.stdout.emit("data", " V....D h264_nvenc NVIDIA NVENC H.264 encoder\n V....D h264_qsv H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (Intel Quick Sync Video acceleration)");
        encodersProcess.emit("close", 0, null);
      });
      return encodersProcess;
    }) as never);

    await expect(service.checkFfmpeg()).resolves.toEqual({
      available: true,
      message: "Video processing is ready.",
      technicalMessage: "ffmpeg version 7.0",
      hardwareAcceleration: {
        available: true,
        encoders: ["h264_nvenc", "h264_qsv"],
        message: "GPU acceleration available: NVIDIA NVENC, Intel Quick Sync."
      }
    });
  });

  it("parses hardware encoder support and reports CPU fallback", () => {
    expect(parseHardwareAcceleration(" V....D h264_amf AMD AMF H.264 encoder")).toEqual({
      available: true,
      encoders: ["h264_amf"],
      message: "GPU acceleration available: AMD AMF."
    });
    expect(parseHardwareAcceleration(" V....D libx264 libx264 H.264 encoder")).toEqual({
      available: false,
      encoders: [],
      message: "CPU encoding fallback is active.",
      technicalMessage: "No supported H.264 GPU encoders reported by FFmpeg."
    });
  });

  it("returns a non-retryable customer-safe failure when ffmpeg is missing", async () => {
    const fake = new FakeProcess();
    const service = new ProcessingService(() => undefined, (() => {
      queueMicrotask(() => fake.emit("error", new Error("spawn ffmpeg ENOENT")));
      return fake;
    }) as never);

    await expect(service.checkFfmpeg()).resolves.toEqual(expect.objectContaining({
      available: false,
      message: "Video processing is unavailable. Reinstall Video Reposter or contact support.",
      failure: expect.objectContaining({ code: "component_unavailable", retryable: false })
    }));
  });

  it("keeps technical ffmpeg failure details inside structured metadata", () => {
    const updates: ProcessingUpdate[] = [];
    const fake = new FakeProcess();
    const service = new ProcessingService((update) => updates.push(update), (() => fake) as never);

    service.startJob(sampleJob());
    fake.stderr.emit("data", "private technical ffmpeg detail");
    fake.emit("close", 1, null);

    const failure = updates.at(-1);
    expect(failure).toEqual(expect.objectContaining({
      status: "failed",
      message: "Video processing failed. Try again. If it keeps failing, contact support.",
      failure: expect.objectContaining({
        retryable: true,
        technicalMessage: expect.stringContaining("private technical ffmpeg detail")
      })
    }));
    expect(failure?.message).not.toContain("private technical");
  });

  it("probes video metadata with ffprobe", async () => {
    const fake = new FakeProcess();
    const service = new ProcessingService(() => undefined, ((command, args) => {
      expect(command).toBe("ffprobe");
      expect(args).toContain("sample.mp4");
      queueMicrotask(() => {
        fake.stdout.emit(
          "data",
          JSON.stringify({
            streams: [{ codec_name: "h264", width: 1920, height: 1080 }],
            format: { duration: "12.345" }
          })
        );
        fake.emit("close", 0, null);
      });
      return fake;
    }) as never);

    await expect(service.probeFile("sample.mp4")).resolves.toEqual({
      valid: true,
      durationSeconds: 12.345,
      codec: "h264",
      width: 1920,
      height: 1080
    });
  });

  it("emits elapsedMs and throughputMbPerMin on a completed job", () => {
    vi.useFakeTimers();
    try {
      const updates: ProcessingUpdate[] = [];
      const fake = new FakeProcess();
      const service = new ProcessingService((update) => updates.push(update), (() => fake) as never);

      service.startJob({ ...sampleJob(), inputSizeBytes: 60_000_000 });
      vi.advanceTimersByTime(3000);
      fake.emit("close", 0, null);

      const done = updates.find((u) => u.status === "complete");
      expect(done).toBeDefined();
      expect(done?.elapsedMs).toBeGreaterThanOrEqual(3000);
      expect(done?.throughputMbPerMin).toBeTypeOf("number");
      expect(done?.throughputMbPerMin).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits elapsedMs without throughput when inputSizeBytes is absent", () => {
    const updates: ProcessingUpdate[] = [];
    const fake = new FakeProcess();
    const service = new ProcessingService((update) => updates.push(update), (() => fake) as never);

    service.startJob(sampleJob());
    fake.emit("close", 0, null);

    const done = updates.find((u) => u.status === "complete");
    expect(done?.elapsedMs).toBeTypeOf("number");
    expect(done?.throughputMbPerMin).toBeUndefined();
  });

  it("returns a validation error when ffprobe cannot find a video stream", async () => {
    const fake = new FakeProcess();
    const service = new ProcessingService(() => undefined, (() => {
      queueMicrotask(() => {
        fake.stdout.emit("data", JSON.stringify({ streams: [], format: { duration: "9" } }));
        fake.emit("close", 0, null);
      });
      return fake;
    }) as never);

    await expect(service.probeFile("audio.mp3")).resolves.toEqual({ valid: false, message: "No video stream found." });
  });
});
