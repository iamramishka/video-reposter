import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { ProcessingService } from "../src/main/processingService.js";
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
    const fake = new FakeProcess();
    const service = new ProcessingService(() => undefined, ((command, args) => {
      expect(command).toBe("ffmpeg");
      expect(args).toEqual(["-version"]);
      queueMicrotask(() => {
        fake.stdout.emit("data", "ffmpeg version 7.0\ncopyright");
        fake.emit("close", 0, null);
      });
      return fake;
    }) as never);

    await expect(service.checkFfmpeg()).resolves.toEqual({ available: true, message: "ffmpeg version 7.0" });
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
