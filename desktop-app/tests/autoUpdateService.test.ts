import { describe, expect, it, vi } from "vitest";
import { AutoUpdateService, compareVersions, getUpdateDecision, parseUpdateInfo } from "../src/main/autoUpdateService.js";

describe("auto update service", () => {
  it("compares semantic versions with optional v prefixes", () => {
    expect(compareVersions("1.2.0", "1.1.9")).toBe(1);
    expect(compareVersions("v1.2.0", "1.2.0")).toBe(0);
    expect(compareVersions("1.2", "1.2.1")).toBe(-1);
  });

  it("classifies normal, critical, and minimum-version updates", () => {
    expect(getUpdateDecision("1.0.0", { latestVersion: "1.1.0", isCritical: false })).toEqual({
      available: true,
      required: false,
      reason: "newer_version"
    });
    expect(getUpdateDecision("1.0.0", { latestVersion: "1.1.0", isCritical: true })).toEqual({
      available: true,
      required: true,
      reason: "critical"
    });
    expect(getUpdateDecision("0.8.0", { latestVersion: "1.1.0", minimumVersion: "0.9.0", isCritical: false })).toEqual({
      available: true,
      required: true,
      reason: "below_minimum"
    });
    expect(getUpdateDecision("1.1.0", { latestVersion: "1.1.0", isCritical: false })).toEqual({ available: false, required: false });
  });

  it("parses the update server payload shape", () => {
    expect(parseUpdateInfo({
      latest_version: "1.2.0",
      minimum_version: "1.0.0",
      is_critical: true,
      release_notes: "- Fixes",
      download_url: "https://updates.example.com/VideoReposter-1.2.0-Setup.exe",
      file_size_mb: 88.5,
      sha256_checksum: "abc123",
      changelog_url: "https://example.com/changelog"
    })).toEqual({
      latestVersion: "1.2.0",
      minimumVersion: "1.0.0",
      isCritical: true,
      releaseNotes: "- Fixes",
      downloadUrl: "https://updates.example.com/VideoReposter-1.2.0-Setup.exe",
      fileSizeMb: 88.5,
      sha256Checksum: "abc123",
      changelogUrl: "https://example.com/changelog"
    });
    expect(parseUpdateInfo({ latest_version: "1.2.0" })).toBeNull();
  });

  it("downloads and launches an accepted packaged update silently", async () => {
    const quit = vi.fn();
    const install = vi.fn();
    const service = new AutoUpdateService({
      app: {
        isPackaged: true,
        getPath: () => "C:/Temp",
        getVersion: () => "1.0.0",
        quit
      },
      dialog: {
        showMessageBox: vi.fn(async () => ({ response: 0, checkboxChecked: false }))
      },
      getMainWindow: () => null,
      fetchLatest: async () => ({
        latestVersion: "1.1.0",
        isCritical: false,
        releaseNotes: "- Better releases",
        downloadUrl: "https://updates.example.com/VideoReposter-1.1.0-Setup.exe",
        sha256Checksum: "abc123"
      }),
      downloadInstaller: async () => "abc123",
      installInstaller: install
    });

    await expect(service.checkAndPrompt()).resolves.toEqual({
      available: true,
      required: false,
      reason: "newer_version"
    });
    expect(install).toHaveBeenCalledWith("C:\\Temp\\VideoReposterUpdates\\VideoReposter-1.1.0-Setup.exe");
    expect(quit).toHaveBeenCalled();
  });

  it("skips update checks outside packaged builds by default", () => {
    const fetchLatest = vi.fn();
    const service = new AutoUpdateService({
      app: {
        isPackaged: false,
        getPath: () => "C:/Temp",
        getVersion: () => "1.0.0",
        quit: vi.fn()
      },
      dialog: {
        showMessageBox: vi.fn()
      },
      getMainWindow: () => null,
      fetchLatest
    });

    service.start();
    expect(fetchLatest).not.toHaveBeenCalled();
  });
});
