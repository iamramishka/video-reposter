import http from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalWorkerApp } from "../src/main/localWorkerApp.js";
import type { ProcessingService, ProcessingUpdate } from "../src/main/processingService.js";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers.length = 0;
});

describe("local worker app", () => {
  it("serves health and presets", async () => {
    const { baseUrl } = await startWorker();

    await expect(readJson(`${baseUrl}/api/local/health`)).resolves.toEqual({ ok: true, service: "video-reposter-local-worker" });
    await expect(readJson(`${baseUrl}/api/local/processing/presets`)).resolves.toEqual({
      value: expect.arrayContaining([expect.objectContaining({ id: "instagram-reel" })])
    });
  });

  it("returns ffmpeg status and starts/stops a fake job", async () => {
    const { baseUrl } = await startWorker();

    await expect(readJson(`${baseUrl}/api/local/processing/ffmpeg`)).resolves.toEqual({
      value: { available: true, message: "ffmpeg fake" }
    });
    await expect(
      postJson(`${baseUrl}/api/local/processing/start-job`, {
        job: {
          inputPath: "in.mp4",
          outputPath: "out.mp4",
          output: { width: 1280, height: 720, fps: 30, videoBitrate: "2M", audioBitrate: "128k", codec: "libx264" }
        }
      })
    ).resolves.toEqual({ value: { id: "job-1", args: ["-i", "in.mp4"] } });
    await expect(postJson(`${baseUrl}/api/local/processing/stop-job`, { id: "job-1" })).resolves.toEqual({ value: true });
  });

  it("forwards processing updates over server-sent events", async () => {
    const { baseUrl, broadcast } = await startWorker();
    const response = await fetch(`${baseUrl}/api/local/processing/events`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("SSE response did not expose a readable body.");

    const update: ProcessingUpdate = { id: "job-1", status: "processing", progress: 42, message: "Halfway" };
    broadcast(update);
    const text = await readUntil(reader, "progress");

    expect(text).toContain("event: processing:update");
    expect(text).toContain(JSON.stringify(update));
    await reader.cancel();
  });

  it("returns empty file selections when native dialogs are canceled", async () => {
    const { baseUrl } = await startWorker();

    await expect(postJson(`${baseUrl}/api/local/files/select-videos`, {})).resolves.toEqual({ value: [] });
    await expect(postJson(`${baseUrl}/api/local/files/select-video-folder`, {})).resolves.toEqual({ value: [] });
    await expect(postJson(`${baseUrl}/api/local/files/select-output-folder`, {})).resolves.toEqual({ value: null });
  });

  it("keeps selected native video paths usable for processing", async () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), "video-reposter-source-"));
    const videoPath = path.join(folder, "clip.mp4");
    const nestedFolder = path.join(folder, "nested");
    const nestedVideoPath = path.join(nestedFolder, "nested.mov");
    mkdirSync(nestedFolder);
    writeFileSync(videoPath, "fake video bytes");
    writeFileSync(nestedVideoPath, "fake nested video bytes");
    writeFileSync(path.join(folder, "notes.txt"), "not a video");
    const { baseUrl } = await startWorker({
      dialogs: {
        selectVideos: async () => [videoPath],
        selectVideoFolder: async () => folder,
        selectOutputFolder: async () => null
      }
    });

    const selectedFiles = await postJson<{ value: Array<{ path: string; name: string }> }>(`${baseUrl}/api/local/files/select-videos`, {});
    expect(selectedFiles.value).toEqual([expect.objectContaining({ path: videoPath, name: "clip.mp4" })]);
    const selectedFolder = await postJson<{ value: Array<{ path: string; name: string }> }>(`${baseUrl}/api/local/files/select-video-folder`, {});
    expect(selectedFolder.value).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: videoPath, name: "clip.mp4" }),
      expect.objectContaining({ path: nestedVideoPath, name: "nested.mov" })
    ]));
    expect(selectedFolder.value).toHaveLength(2);

    await expect(
      postJson(`${baseUrl}/api/local/processing/start-file`, {
        inputPath: selectedFiles.value[0].path,
        presetId: "instagram-reel",
        outputNaming: {
          template: "{preset}_{name}",
          format: "mkv"
        }
      })
    ).resolves.toEqual({
      value: expect.objectContaining({
        ok: true,
        outputPath: expect.stringContaining("instagram-reel_clip.mkv")
      })
    });
  });

  it("returns structured customer-safe failures for unavailable processing and invalid videos", async () => {
    const missingFailure = {
      code: "component_unavailable" as const,
      message: "Video processing is unavailable. Reinstall Video Reposter or contact support.",
      technicalMessage: "spawn ffmpeg ENOENT",
      retryable: false,
      recovery: "reinstall_support" as const
    };
    const { baseUrl } = await startWorker({
      processingService: {
        checkFfmpeg: async () => ({ available: false, message: missingFailure.message, technicalMessage: missingFailure.technicalMessage, failure: missingFailure }),
        probeFile: async () => ({ valid: false, message: "Invalid data found when processing input." }),
        startJob: () => ({ id: "job-1", args: [] }),
        stopJob: () => true
      } as unknown as ProcessingService
    });

    await expect(readJson(`${baseUrl}/api/local/processing/ffmpeg`)).resolves.toEqual({
      value: expect.objectContaining({
        available: false,
        message: missingFailure.message,
        failure: expect.objectContaining({ retryable: false })
      })
    });
    await expect(postJson(`${baseUrl}/api/local/processing/start-file`, { inputPath: path.join(os.tmpdir(), "bad.mp4") })).resolves.toEqual({
      value: expect.objectContaining({
        ok: false,
        message: "This video could not be read. Remove it and choose a supported video file.",
        failure: expect.objectContaining({ code: "invalid_video", retryable: false })
      })
    });
  });
});

async function startWorker(overrides: Partial<Parameters<typeof createLocalWorkerApp>[0]> = {}) {
  const rendererPath = path.join(os.tmpdir(), "video-reposter-renderer-test");
  const worker = createLocalWorkerApp({
    userDataPath: mkdtempSync(path.join(os.tmpdir(), "video-reposter-worker-")),
    deviceName: "Test Device",
    osName: "Test OS",
    rendererPath,
    dialogs: {
      selectVideos: async () => [],
      selectVideoFolder: async () => null,
      selectOutputFolder: async () => null
    },
    shell: {
      openExternal: async () => undefined,
      showItemInFolder: () => undefined,
      openPath: async () => ""
    },
    processingService: fakeProcessingService(),
    ...overrides
  });
  const server = http.createServer(worker.app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server did not bind a TCP port.");
  return { baseUrl: `http://127.0.0.1:${address.port}`, broadcast: worker.broadcast };
}

function fakeProcessingService() {
  return {
    checkFfmpeg: async () => ({ available: true, message: "ffmpeg fake" }),
    probeFile: async () => ({ valid: true, durationSeconds: 10 }),
    startJob: (request: { inputPath: string }) => ({ id: "job-1", args: ["-i", request.inputPath] }),
    stopJob: () => true
  } as unknown as ProcessingService;
}

async function readJson(url: string) {
  const response = await fetch(url);
  return response.json();
}

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json() as Promise<T>;
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string) {
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + 5000;
  while (!text.includes(needle) && Date.now() < deadline) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text;
}
