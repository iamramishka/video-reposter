import { afterEach, describe, expect, it, vi } from "vitest";
import { createVideoReposterBridge, getBridgeMode, hasElectronBridge, isLocalWorkerAvailable, usesNativeFileDialogs } from "../src/renderer/bridge";
import type { VideoReposterBridge } from "../src/renderer/bridge";

describe("renderer bridge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the Electron bridge when preload exposes one", () => {
    const electronBridge = { getDeviceInfo: vi.fn() } as unknown as VideoReposterBridge;
    vi.stubGlobal("window", {
      videoReposter: electronBridge,
      location: { protocol: "http:", hostname: "127.0.0.1" }
    });

    expect(createVideoReposterBridge()).toBe(electronBridge);
    expect(hasElectronBridge(window)).toBe(true);
    expect(getBridgeMode(window.location, window)).toBe("electron");
  });

  it("detects when the Electron preload bridge is absent", () => {
    expect(hasElectronBridge({} as Window)).toBe(false);
  });

  it("detects localhost as local worker mode with native file dialogs", () => {
    expect(isLocalWorkerAvailable({ protocol: "http:", hostname: "127.0.0.1" })).toBe(true);
    expect(isLocalWorkerAvailable({ protocol: "http:", hostname: "localhost" })).toBe(true);
    expect(isLocalWorkerAvailable({ protocol: "https:", hostname: "example.com" })).toBe(false);
    expect(getBridgeMode({ protocol: "http:", hostname: "127.0.0.1" }, {} as Window)).toBe("local-worker");
    expect(usesNativeFileDialogs("local-worker")).toBe(true);
  });

  it("uses browser fallback only in preview mode", () => {
    const mode = getBridgeMode({ protocol: "https:", hostname: "example.com" }, {} as Window);

    expect(mode).toBe("preview");
    expect(usesNativeFileDialogs(mode)).toBe(false);
  });

  it("uses customer-safe non-retryable processing messages in preview mode", async () => {
    vi.stubGlobal("window", {
      location: { protocol: "https:", hostname: "example.com" },
      open: vi.fn()
    });
    const bridge = createVideoReposterBridge();

    const availability = await bridge.checkFfmpeg();
    const start = await bridge.startProcessingFile("clip.mp4", "instagram-reel");

    expect(availability.message).not.toContain("npm");
    expect(availability.failure).toEqual(expect.objectContaining({ code: "component_unavailable", retryable: false }));
    expect(start).toEqual(expect.objectContaining({
      ok: false,
      message: "Video processing is unavailable. Reinstall Video Reposter or contact support.",
      failure: expect.objectContaining({ retryable: false })
    }));
  });

  it("uses the localhost worker when Electron is absent", async () => {
    vi.stubGlobal("window", {
      location: { protocol: "http:", hostname: "127.0.0.1" }
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ value: { deviceId: "device", deviceName: "PC", os: "Windows" } })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createVideoReposterBridge().getDeviceInfo()).resolves.toEqual({ deviceId: "device", deviceName: "PC", os: "Windows" });
    expect(fetchMock).toHaveBeenCalledWith("/api/local/device-info", {
      method: "GET",
      headers: undefined,
      body: undefined
    });
  });

  it("sends local worker telemetry with a bearer token and wrapped payload", async () => {
    vi.stubGlobal("window", {
      location: { protocol: "http:", hostname: "127.0.0.1" }
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ value: true })));
    vi.stubGlobal("fetch", fetchMock);
    const payload = {
      jobId: "job-1",
      status: "complete" as const,
      preset: "instagram-reel",
      elapsedMs: 1234
    };

    await expect(createVideoReposterBridge().sendProcessingTelemetry("VDRP-TEST-KEY", payload)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/local/telemetry/processing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer VDRP-TEST-KEY"
      },
      body: JSON.stringify({ payload })
    });
  });

  it("builds an encoded local preview URL for native video paths", async () => {
    vi.stubGlobal("window", {
      location: { protocol: "http:", hostname: "127.0.0.1" }
    });

    await expect(createVideoReposterBridge().getVideoPreviewUrl("C:/My Videos/clip.mp4")).resolves.toBe(
      "/api/local/files/preview?path=C%3A%2FMy%20Videos%2Fclip.mp4"
    );
  });

  it("surfaces local worker request failures", async () => {
    vi.stubGlobal("window", {
      location: { protocol: "http:", hostname: "localhost" }
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "worker down" }), { status: 500 })));

    await expect(createVideoReposterBridge().getDeviceInfo()).rejects.toThrow("worker down");
  });
});
