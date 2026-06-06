import { BrowserWindow, app as electronApp, dialog, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import http from "node:http";
import type { RequestListener } from "node:http";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalWorkerApp } from "./localWorkerApp.js";

const host = "127.0.0.1";
const defaultPort = Number(process.env.VIDEO_REPOSTER_BROWSER_PORT ?? 5174);
let dialogParent: BrowserWindow | null = null;

electronApp.whenReady().then(async () => {
  const rendererPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist-renderer");
  if (!existsSync(path.join(rendererPath, "index.html"))) {
    console.error(`Renderer build not found at ${rendererPath}. Run npm run build -w desktop-app first.`);
    electronApp.exit(1);
    return;
  }

  const { app } = createLocalWorkerApp({
    userDataPath: electronApp.getPath("userData"),
    deviceName: os.hostname(),
    osName: `${os.type()} ${os.release()}`,
    rendererPath,
    dialogs: {
      selectVideos: async () => {
        const result = await showWorkerDialog({
          title: "Select videos",
          properties: ["openFile", "multiSelections"],
          filters: [{ name: "Videos", extensions: ["mp4", "mov", "avi", "mkv", "webm", "flv"] }]
        });
        return result.canceled ? [] : result.filePaths;
      },
      selectVideoFolder: async () => {
        const result = await showWorkerDialog({
          title: "Select video folder",
          properties: ["openDirectory"]
        });
        return result.canceled ? null : result.filePaths[0] ?? null;
      },
      selectOutputFolder: async () => {
        const result = await showWorkerDialog({
          title: "Select output folder",
          properties: ["openDirectory", "createDirectory"]
        });
        return result.canceled ? null : result.filePaths[0] ?? null;
      }
    },
    shell: {
      openExternal: (url) => shell.openExternal(url),
      showItemInFolder: (filePath) => shell.showItemInFolder(filePath),
      openPath: (filePath) => shell.openPath(filePath)
    }
  });

  try {
    const server = await listenOnAvailablePort(app, defaultPort);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : defaultPort;
    const url = `http://${host}:${port}`;
    console.log(`Video Reposter browser app listening on ${url}`);
    await waitForHealth(url);
    await shell.openExternal(url);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    electronApp.exit(1);
  }
});

electronApp.on("window-all-closed", () => undefined);

async function showWorkerDialog(options: OpenDialogOptions) {
  const parent = getDialogParent();
  parent.show();
  parent.setAlwaysOnTop(true, "screen-saver");
  parent.focus();
  try {
    return await dialog.showOpenDialog(parent, options);
  } finally {
    parent.setAlwaysOnTop(false);
    parent.hide();
  }
}

function getDialogParent() {
  if (!dialogParent || dialogParent.isDestroyed()) {
    dialogParent = new BrowserWindow({
      width: 360,
      height: 120,
      show: false,
      skipTaskbar: true,
      title: "Video Reposter",
      resizable: false,
      minimizable: false,
      maximizable: false
    });
    dialogParent.loadURL("data:text/html,<body style='font-family:Segoe UI,sans-serif;margin:24px'>Opening picker...</body>").catch(() => undefined);
  }
  return dialogParent;
}

function listenOnAvailablePort(handler: RequestListener, firstPort: number) {
  return new Promise<http.Server>((resolve, reject) => {
    const tryPort = (port: number) => {
      if (port > firstPort + 25) {
        reject(new Error(`Could not bind local worker on ports ${firstPort}-${firstPort + 25}.`));
        return;
      }
      const server = http.createServer(handler);
      server.once("error", (error: NodeJS.ErrnoException) => {
        server.close();
        if (error.code === "EADDRINUSE") {
          tryPort(port + 1);
          return;
        }
        reject(error);
      });
      server.listen(port, host, () => resolve(server));
    };
    tryPort(firstPort);
  });
}

async function waitForHealth(baseUrl: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/local/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Local worker started but did not become healthy.");
}
