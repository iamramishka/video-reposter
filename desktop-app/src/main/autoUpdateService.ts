import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { get } from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { BrowserWindow, Dialog, MessageBoxOptions, MessageBoxReturnValue } from "electron";
import type { App } from "electron";
import { productName } from "../shared/branding.js";

export type UpdateInfo = {
  latestVersion: string;
  minimumVersion?: string;
  isCritical: boolean;
  releaseNotes?: string;
  downloadUrl: string;
  fileSizeMb?: number;
  sha256Checksum?: string;
  changelogUrl?: string;
};

export type UpdateDecision =
  | { available: false; required: false }
  | { available: true; required: boolean; reason: "below_minimum" | "critical" | "newer_version" };

export type AutoUpdateServiceOptions = {
  app: Pick<App, "getPath" | "getVersion" | "isPackaged" | "quit">;
  dialog: Pick<Dialog, "showMessageBox">;
  getMainWindow: () => BrowserWindow | null;
  updateUrl?: string;
  allowInDev?: boolean;
  checkIntervalMs?: number;
  fetchLatest?: (url: string, currentVersion: string) => Promise<UpdateInfo | null>;
  downloadInstaller?: (info: UpdateInfo, destination: string, onProgress: (progress: UpdateDownloadProgress) => void) => Promise<string>;
  installInstaller?: (installerPath: string) => void;
  log?: (message: string) => void;
};

export type UpdateDownloadProgress = {
  downloadedBytes: number;
  totalBytes?: number;
  percent?: number;
};

const defaultUpdateUrl = "https://updates.videoreposter.com/api/updates/latest";
const defaultCheckIntervalMs = 24 * 60 * 60 * 1000;

export class AutoUpdateService {
  private timer: NodeJS.Timeout | null = null;
  private checking = false;

  constructor(private readonly options: AutoUpdateServiceOptions) {}

  start() {
    if (!this.options.app.isPackaged && !this.options.allowInDev) {
      this.log("Skipping update checks outside packaged builds.");
      return;
    }
    void this.checkAndPrompt();
    this.timer = setInterval(() => void this.checkAndPrompt(), this.options.checkIntervalMs ?? defaultCheckIntervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async checkAndPrompt() {
    if (this.checking) return { available: false, required: false } satisfies UpdateDecision;
    this.checking = true;
    try {
      const currentVersion = this.options.app.getVersion();
      const latest = await (this.options.fetchLatest ?? fetchLatestUpdate)(this.options.updateUrl ?? defaultUpdateUrl, currentVersion);
      if (!latest) return { available: false, required: false } satisfies UpdateDecision;

      const decision = getUpdateDecision(currentVersion, latest);
      if (!decision.available) return decision;

      const accepted = await this.promptForUpdate(currentVersion, latest, decision.required);
      if (!accepted) return decision;
      await this.downloadAndInstall(latest);
      return decision;
    } catch (error) {
      this.log(`Update check failed: ${error instanceof Error ? error.message : String(error)}`);
      return { available: false, required: false } satisfies UpdateDecision;
    } finally {
      this.checking = false;
    }
  }

  private async promptForUpdate(currentVersion: string, info: UpdateInfo, required: boolean) {
    const buttons = required ? ["Update Now"] : ["Update Now", "Later"];
    const detail = [
      `Current version: ${currentVersion}`,
      `New version: ${info.latestVersion}${info.fileSizeMb ? ` (${info.fileSizeMb} MB)` : ""}`,
      info.releaseNotes ? `\nWhat's new:\n${info.releaseNotes}` : "",
      info.changelogUrl ? `\nChangelog: ${info.changelogUrl}` : ""
    ].filter(Boolean).join("\n");
    const response = await this.showMessageBox({
      type: required ? "warning" : "info",
      title: required ? "Critical Update Required" : "Update Available",
      message: required ? `A required ${productName} update is available.` : `A new ${productName} update is available.`,
      detail,
      buttons,
      defaultId: 0,
      cancelId: required ? 0 : 1,
      noLink: true
    });
    return response.response === 0;
  }

  private async downloadAndInstall(info: UpdateInfo) {
    const installerPath = getInstallerPath(this.options.app.getPath("temp"), info);
    this.log(`Downloading update ${info.latestVersion} to ${installerPath}.`);
    const checksum = await (this.options.downloadInstaller ?? downloadUpdateInstaller)(info, installerPath, (progress) => {
      const label = typeof progress.percent === "number" ? `${progress.percent}%` : `${progress.downloadedBytes} bytes`;
      this.log(`Downloading update ${info.latestVersion}: ${label}.`);
    });

    if (info.sha256Checksum && checksum.toLowerCase() !== info.sha256Checksum.toLowerCase()) {
      if (existsSync(installerPath)) unlinkSync(installerPath);
      throw new Error("Downloaded update checksum did not match the update manifest.");
    }

    await this.showMessageBox({
      type: "info",
      title: "Update Ready",
      message: `${productName} will restart to install the update.`,
      detail: "The installer will run silently and preserve your app data, license cache, queue, and output files.",
      buttons: ["Install & Restart"],
      defaultId: 0,
      noLink: true
    });

    (this.options.installInstaller ?? installSilently)(installerPath);
    this.options.app.quit();
  }

  private showMessageBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue> {
    const parent = this.options.getMainWindow();
    return parent ? this.options.dialog.showMessageBox(parent, options) : this.options.dialog.showMessageBox(options);
  }

  private log(message: string) {
    this.options.log?.(`[auto-update] ${message}`);
  }
}

export function getUpdateDecision(currentVersion: string, info: Pick<UpdateInfo, "latestVersion" | "minimumVersion" | "isCritical">): UpdateDecision {
  if (info.minimumVersion && compareVersions(currentVersion, info.minimumVersion) < 0) {
    return { available: true, required: true, reason: "below_minimum" };
  }
  if (compareVersions(currentVersion, info.latestVersion) < 0) {
    return { available: true, required: info.isCritical, reason: info.isCritical ? "critical" : "newer_version" };
  }
  return { available: false, required: false };
}

export function parseUpdateInfo(value: unknown): UpdateInfo | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  const latestVersion = stringField(payload.latest_version) ?? stringField(payload.latestVersion);
  const downloadUrl = stringField(payload.download_url) ?? stringField(payload.downloadUrl);
  if (!latestVersion || !downloadUrl) return null;
  return {
    latestVersion,
    minimumVersion: stringField(payload.minimum_version) ?? stringField(payload.minimumVersion),
    isCritical: Boolean(payload.is_critical ?? payload.isCritical),
    releaseNotes: stringField(payload.release_notes) ?? stringField(payload.releaseNotes),
    downloadUrl,
    fileSizeMb: numberField(payload.file_size_mb) ?? numberField(payload.fileSizeMb),
    sha256Checksum: stringField(payload.sha256_checksum) ?? stringField(payload.sha256Checksum),
    changelogUrl: stringField(payload.changelog_url) ?? stringField(payload.changelogUrl)
  };
}

export function compareVersions(left: string, right: string) {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue !== rightValue) return leftValue > rightValue ? 1 : -1;
  }
  return 0;
}

async function fetchLatestUpdate(url: string, currentVersion: string) {
  const response = await fetch(url, {
    headers: {
      "X-App-Version": currentVersion,
      "X-OS": process.platform,
      "X-Arch": process.arch
    }
  });
  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) throw new Error(`Update server returned ${response.status}.`);
  return parseUpdateInfo(await response.json());
}

function downloadUpdateInstaller(info: UpdateInfo, destination: string, onProgress: (progress: UpdateDownloadProgress) => void) {
  mkdirSync(path.dirname(destination), { recursive: true });
  return new Promise<string>((resolve, reject) => {
    const file = createWriteStream(destination);
    const hash = createHash("sha256");
    get(info.downloadUrl, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        void downloadUpdateInstaller({ ...info, downloadUrl: response.headers.location }, destination, onProgress).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`Update download failed with status ${response.statusCode ?? "unknown"}.`));
        return;
      }
      const totalBytes = Number(response.headers["content-length"]);
      let downloadedBytes = 0;
      response.on("data", (chunk: Buffer) => {
        hash.update(chunk);
        downloadedBytes += chunk.length;
        onProgress({
          downloadedBytes,
          totalBytes: Number.isFinite(totalBytes) ? totalBytes : undefined,
          percent: Number.isFinite(totalBytes) && totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : undefined
        });
      });
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve(hash.digest("hex"));
      });
    }).on("error", (error) => {
      file.close();
      reject(error);
    });
  });
}

function installSilently(installerPath: string) {
  const args = process.platform === "win32" ? ["/S"] : [];
  spawn(installerPath, args, {
    detached: true,
    stdio: "ignore"
  }).unref();
}

function getInstallerPath(tempRoot: string, info: UpdateInfo) {
  const fileName = path.basename(new URL(info.downloadUrl).pathname) || `VideoReposter-${info.latestVersion}-Setup.exe`;
  const folder = path.join(tempRoot || tmpdir(), "VideoReposterUpdates");
  return path.join(folder, fileName);
}

function normalizeVersion(value: string) {
  return value
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map((part) => Number(part.replace(/\D.*$/, "")))
    .map((part) => Number.isFinite(part) ? part : 0);
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberField(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}
