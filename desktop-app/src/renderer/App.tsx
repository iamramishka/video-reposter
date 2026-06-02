import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Cloud,
  Copy,
  Film,
  FolderOpen,
  Home,
  Info,
  KeyRound,
  Laptop,
  Lock,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Settings,
  Shield,
  ShieldCheck,
  Square,
  ShoppingCart,
  Upload,
  Video,
  X
} from "lucide-react";
import type { CachedLicense, DeviceInfo } from "../shared/license";
import { isLicenseKey, normalizeLicenseKey } from "../shared/license";
import { platformPresets } from "../shared/processing";
import type { ImportedVideoFile, PlatformPreset, TransformSettings } from "../shared/processing";
import {
  buildQueueItems,
  buildQueueItemsFromImports,
  clampWorkers,
  cleanTransforms,
  defaultPreferences,
  defaultTransforms,
  formatBytes,
  formatHistoryDate,
  getQueueTotals,
  loadHistory,
  loadPreferences,
  loadQueue,
  saveHistory,
  savePreferences,
  saveQueue,
  summarizeTransforms
} from "./state";
import type { HistoryItem, ProcessingPreferences, QueueItem } from "./state";
import "./styles.css";

const videoReposterBridge = window.videoReposter ?? {
  getDeviceInfo: async () => ({
    deviceId: "preview-device-id-000000000000000000000000",
    deviceName: "Preview Browser",
    os: "Browser Preview"
  }),
  getLicenseStatus: async () => ({
    state: "VALID",
    license: {
      license_key: "VDRP-PREV-IEW0-0000-0000",
      plan: "pro",
      status: "active",
      device_id: "preview-device-id-000000000000000000000000",
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(),
      last_verified: new Date().toISOString(),
      user: { name: "Preview User", email: "preview@videoreposter.local" }
    }
  }),
  activateLicense: async () => ({ ok: false, message: "Activation is available inside the desktop app." }),
  openExternal: async (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  },
  showItemInFolder: async () => undefined,
  getProcessingPresets: async () => platformPresets,
  appendProcessingLog: async () => "preview-processing.log",
  getProcessingLogPath: async () => "preview-processing.log",
  openProcessingLog: async () => "",
  checkFfmpeg: async () => ({ available: false, message: "FFmpeg check is available inside the desktop app." }),
  probeVideoFile: async () => ({ valid: false, message: "FFprobe is available inside the desktop app." }),
  buildProcessingCommand: async () => "",
  startProcessingJob: async () => ({ id: "preview", args: [] }),
  startProcessingFile: async () => ({ ok: false, message: "Real processing is available inside the desktop app." }),
  stopProcessingJob: async () => false,
  selectVideoFiles: async () => [],
  selectVideoFolder: async () => [],
  selectOutputFolder: async () => null,
  onProcessingUpdate: () => () => undefined
};

function App() {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [license, setLicense] = useState<CachedLicense | null>(null);
  const [state, setState] = useState("NO_LICENSE");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([videoReposterBridge.getDeviceInfo(), videoReposterBridge.getLicenseStatus()]).then(
      ([deviceInfo, status]) => {
        setDevice(deviceInfo);
        setState(status.state);
        setLicense(status.license as CachedLicense | null);
        setLoading(false);
      }
    );
  }, []);

  if (loading || !device) return <div className="boot">Starting Video Batch Processor...</div>;

  if (state === "VALID" || state === "VALID_FROM_CACHE" || state === "EXPIRED_GRACE") {
    return <Dashboard license={license} state={state} />;
  }

  return (
    <ActivationScreen
      device={device}
      blockedState={state}
      onActivated={(nextLicense) => {
        setLicense(nextLicense);
        setState("VALID");
      }}
    />
  );
}

function ActivationScreen({
  device,
  blockedState,
  onActivated
}: {
  device: DeviceInfo;
  blockedState: string;
  onActivated: (license: CachedLicense) => void;
}) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const normalized = useMemo(() => normalizeLicenseKey(key), [key]);

  async function activate() {
    setError("");
    if (!isLicenseKey(normalized)) {
      setError("Use format VDRP-XXXX-XXXX-XXXX-XXXX.");
      return;
    }
    setBusy(true);
    const result = await videoReposterBridge.activateLicense(normalized);
    setBusy(false);
    if (result.ok && result.license) {
      onActivated(result.license as CachedLicense);
      return;
    }
    setError(result.message ?? "Activation failed. Please try again.");
  }

  const blockedMessage =
    blockedState === "REVOKED"
      ? "This license was revoked. Contact support to restore access."
      : blockedState === "EXPIRED"
        ? "Your license has expired. Renew or activate a new license."
        : blockedState === "DEVICE_MISMATCH"
          ? "This license is already bound to another device."
          : "";

  return (
    <main className="activation-shell">
      <aside className="activation-sidebar">
        <div className="brand-mark">
          <Film size={58} />
        </div>
        <h1>Video Batch Processor</h1>
        <p className="tagline">Batch Process Videos with Ease</p>
        <Feature icon={<ShieldCheck />} title="Secure & Licensed" text="Your license ensures premium features and regular updates." />
        <Feature icon={<Cloud />} title="Online Validation" text="License is verified securely through our server." />
        <Feature icon={<Laptop />} title="Device Bound" text="This license is activated on this device only." />
        <Feature icon={<RotateCw />} title="Plans for Everyone" text="Choose from monthly or yearly plans that fit your needs." />
        <div className="support-row">
          <span>Need Help?</span>
          <button onClick={() => videoReposterBridge.openExternal("mailto:support@videoreposter.local")}>Contact our support team</button>
        </div>
      </aside>
      <section className="activation-content">
        <div className="lock-badge"><Shield size={44} /></div>
        <h2>License Activation</h2>
        <p className="subtitle">Enter your license key to activate the software.</p>

        <label className="field-label" htmlFor="license-key">License Key</label>
        <div className="license-input">
          <KeyRound size={22} />
          <input
            id="license-key"
            value={key}
            onChange={(event) => setKey(event.target.value.toUpperCase())}
            placeholder="Enter your license key here"
            disabled={busy}
          />
          {key && <button aria-label="Clear license key" onClick={() => setKey("")}><X size={22} /></button>}
        </div>

        <fieldset className="device-card">
          <legend>Device Information</legend>
          <InfoLine icon={<Laptop />} label="Device ID" value={device.deviceId.slice(0, 19).toUpperCase()} />
          <InfoLine icon={<Laptop />} label="Device Name" value={device.deviceName} />
        </fieldset>

        <div className="notice">
          <Info size={22} />
          <span>An active internet connection is required for license validation. The license will be bound to this device.</span>
        </div>

        {(error || blockedMessage) && <div className="error">{error || blockedMessage}</div>}

        <button className="primary-action" onClick={activate} disabled={busy}>
          <ShieldCheck size={22} />
          {busy ? "Activating..." : "Activate License"}
        </button>
        <div className="or-line"><span>or</span></div>
        <button className="secondary-action" onClick={() => videoReposterBridge.openExternal("https://videoreposter.local/buy")}>
          <ShoppingCart size={22} />
          Buy License
        </button>
        <p className="terms">By activating, you agree to our <a>Terms of Use</a> and <a>Privacy Policy</a>.</p>
      </section>
    </main>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="feature">
      <div>{icon}</div>
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function InfoLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="info-line">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
      <Copy size={20} />
    </div>
  );
}

function Dashboard({ license, state }: { license: CachedLicense | null; state: string }) {
  const name = license?.user?.name?.split(" ")[0] ?? "John";
  const [preferences, setPreferences] = useState<ProcessingPreferences>(loadPreferences);
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [items, setItems] = useState<QueueItem[]>(loadQueue);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>(["Ready for video import."]);
  const [presets, setPresets] = useState<PlatformPreset[]>(platformPresets);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const historyIds = useRef(new Set(history.map((item) => item.id)));
  const totals = useMemo(() => getQueueTotals(items), [items]);
  const selectedPresetId = preferences.selectedPresetId;
  const transforms = preferences.transforms;
  const outputDir = preferences.outputDir;
  const maxWorkers = preferences.maxWorkers;

  useEffect(() => {
    videoReposterBridge.getProcessingPresets().then((nextPresets) => {
      if (nextPresets.length) setPresets(nextPresets);
    });
    videoReposterBridge.checkFfmpeg().then((result) => {
      appendLog(setLogs, result.available ? result.message : `FFmpeg unavailable: ${result.message}`);
    });
    const unsubscribe = videoReposterBridge.onProcessingUpdate((update) => {
      setItems((current) =>
        current.map((item) =>
          item.processingJobId === update.id
            ? (() => {
                if (update.status === "complete" || update.status === "failed") {
                  recordHistoryItem(item, update.status, update.message);
                }
                return {
                ...item,
                progress: update.progress,
                status:
                  update.status === "complete"
                    ? "complete"
                    : update.status === "failed"
                      ? "failed"
                      : update.status === "stopped"
                        ? "queued"
                        : "processing",
                processingJobId: update.status === "complete" || update.status === "failed" || update.status === "stopped" ? undefined : item.processingJobId
                };
              })()
            : item
        )
      );
      appendLog(setLogs, `${update.status}: ${update.progress}%${update.message ? ` - ${update.message}` : ""}`);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    saveQueue(items);
  }, [items]);

  useEffect(() => {
    if (!running) return;

    const activeCount = items.filter((item) => item.status === "processing" || item.status === "starting").length;
    const openSlots = maxWorkers - activeCount;
    if (openSlots > 0) {
      items
        .filter((item) => item.status === "queued" || item.status === "paused")
        .slice(0, openSlots)
        .forEach((item) => void launchQueueItem(item));
    }

    if (items.length > 0 && activeCount === 0 && items.every((item) => item.status === "complete" || item.status === "failed")) {
      setRunning(false);
      appendLog(setLogs, "Batch complete.");
    }
  }, [items, running]);

  function importFiles(files: FileList | null) {
    if (!files?.length) return;
    const result = buildQueueItems(Array.from(files), items);
    if (result.items.length) setItems((current) => [...current, ...result.items]);
    appendLog(
      setLogs,
      `Imported ${result.items.length} video${result.items.length === 1 ? "" : "s"}${
        result.skipped ? `, skipped ${result.skipped} duplicate/unsupported file${result.skipped === 1 ? "" : "s"}` : ""
      }.`
    );
  }

  async function importNativeVideos() {
    const files = await videoReposterBridge.selectVideoFiles();
    queueImportedVideos(files, "disk");
  }

  async function importVideoFolder() {
    const files = await videoReposterBridge.selectVideoFolder();
    queueImportedVideos(files, "folder");
  }

  function queueImportedVideos(files: ImportedVideoFile[], source: "disk" | "folder") {
    const result = buildQueueItemsFromImports(files, items);
    if (result.items.length) setItems((current) => [...current, ...result.items]);
    appendLog(
      setLogs,
      `Imported ${result.items.length} video${result.items.length === 1 ? "" : "s"} from ${source}${result.skipped ? `, skipped ${result.skipped}` : ""}.`
    );
  }

  async function chooseOutputFolder() {
    const selected = await videoReposterBridge.selectOutputFolder();
    if (!selected) return;
    setPreferences((current) => ({ ...current, outputDir: selected }));
    appendLog(setLogs, `Output folder set to ${selected}.`);
  }

  function updateTransforms(next: React.SetStateAction<TransformSettings>) {
    setPreferences((current) => ({
      ...current,
      transforms: typeof next === "function" ? next(current.transforms) : next
    }));
  }

  function updateSelectedPreset(id: string) {
    setPreferences((current) => ({ ...current, selectedPresetId: id }));
  }

  function updateMaxWorkers(value: number) {
    setPreferences((current) => ({ ...current, maxWorkers: clampWorkers(value) }));
  }

  function resetProcessingDefaults() {
    setPreferences({ ...defaultPreferences, transforms: { ...defaultTransforms } });
    appendLog(setLogs, "Reset processing defaults.");
  }

  async function startBatch() {
    if (!items.length) {
      appendLog(setLogs, "Import videos before starting the batch.");
      return;
    }
    setRunning(true);
    appendLog(setLogs, `Started queue with ${maxWorkers} workers.`);
  }

  async function launchQueueItem(item: QueueItem) {
    if (!item.path) {
      setItems((current) => current.map((next) => (next.id === item.id ? { ...next, status: "failed", progress: 0 } : next)));
      appendLog(setLogs, `Could not start ${item.name}: choose files with Import Videos for real processing.`);
      return;
    }

    setItems((current) => current.map((next) => (next.id === item.id ? { ...next, status: "starting", progress: 0 } : next)));
    const started = await videoReposterBridge.startProcessingFile(item.path, selectedPresetId, outputDir || undefined, cleanTransforms(transforms));
    if (!started.ok) {
      setItems((current) => current.map((next) => (next.id === item.id ? { ...next, status: "failed", progress: 0 } : next)));
      appendLog(setLogs, `Could not start ${item.name}: ${started.message}`);
      return;
    }
    setItems((current) =>
      current.map((next) =>
        next.id === item.id
          ? {
              ...next,
              status: "processing",
              processingJobId: started.id,
              outputPath: started.outputPath,
              presetName: started.preset.name,
              transformSummary: summarizeTransforms(transforms),
              durationSeconds: started.probe.durationSeconds,
              resolution: started.probe.width && started.probe.height ? `${started.probe.width}x${started.probe.height}` : undefined
            }
          : next
      )
    );
    appendLog(
      setLogs,
      `Started ${started.preset.name} job for ${item.name}${started.probe.durationSeconds ? ` (${Math.round(started.probe.durationSeconds)}s)` : ""}. Output: ${started.outputPath}`
    );
  }

  function pauseBatch() {
    setRunning(false);
    appendLog(setLogs, "Paused queue scheduling. Active FFmpeg jobs will continue.");
  }

  function stopBatch() {
    setRunning(false);
    items
      .filter((item) => item.processingJobId && (item.status === "processing" || item.status === "starting"))
      .forEach((item) => void videoReposterBridge.stopProcessingJob(item.processingJobId!));
    setItems((current) =>
      current.map((item) =>
        item.status === "processing" || item.status === "starting" || item.status === "paused"
          ? { ...item, status: "queued", progress: 0, processingJobId: undefined }
          : item
      )
    );
    appendLog(setLogs, "Stopped batch and reset active work.");
  }

  function stopQueueItem(item: QueueItem) {
    if (item.processingJobId) void videoReposterBridge.stopProcessingJob(item.processingJobId);
    setItems((current) =>
      current.map((next) => (next.id === item.id ? { ...next, status: "queued", progress: 0, processingJobId: undefined } : next))
    );
    appendLog(setLogs, `Stopped ${item.name}.`);
  }

  function retryQueueItem(item: QueueItem) {
    setItems((current) =>
      current.map((next) =>
        next.id === item.id
          ? { ...next, status: "queued", progress: 0, processingJobId: undefined, outputPath: undefined, presetName: undefined, transformSummary: undefined }
          : next
      )
    );
    appendLog(setLogs, `Queued ${item.name} for retry.`);
  }

  function removeQueueItem(item: QueueItem) {
    if (item.processingJobId) void videoReposterBridge.stopProcessingJob(item.processingJobId);
    setItems((current) => current.filter((next) => next.id !== item.id));
    appendLog(setLogs, `Removed ${item.name} from the queue.`);
  }

  function clearFinishedItems() {
    const removable = items.filter((item) => item.status === "complete" || item.status === "failed").length;
    if (!removable) {
      appendLog(setLogs, "No finished queue items to clear.");
      return;
    }
    setItems((current) => current.filter((item) => item.status !== "complete" && item.status !== "failed"));
    appendLog(setLogs, `Cleared ${removable} finished queue item${removable === 1 ? "" : "s"}.`);
  }

  function clearQueue() {
    const activeItems = items.filter((item) => item.processingJobId && (item.status === "processing" || item.status === "starting"));
    activeItems.forEach((item) => void videoReposterBridge.stopProcessingJob(item.processingJobId!));
    setRunning(false);
    setItems([]);
    appendLog(setLogs, `Cleared queue${activeItems.length ? " and stopped active jobs" : ""}.`);
  }

  function recordHistoryItem(item: QueueItem, status: "complete" | "failed", message?: string) {
    const id = `${item.processingJobId ?? item.id}:${status}`;
    if (historyIds.current.has(id)) return;
    historyIds.current.add(id);
    setHistory((current) => [
      {
        id,
        name: item.name,
        status,
        outputPath: item.outputPath,
        sourcePath: item.path,
        presetName: item.presetName,
        transformSummary: item.transformSummary,
        resolution: item.resolution,
        durationSeconds: item.durationSeconds,
        message,
        completedAt: new Date().toISOString()
      },
      ...current
    ].slice(0, 50));
  }

  function clearHistory() {
    historyIds.current.clear();
    setHistory([]);
    appendLog(setLogs, "Cleared processing history.");
  }

  const pageTitle = viewTitles[activeView];
  const pageSubtitle = viewSubtitles[activeView];
  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? presets[0];

  return (
    <main
      className="dashboard-shell"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        importFiles(event.dataTransfer.files);
      }}
    >
      <aside className="dashboard-sidebar">
        <div className="app-title"><Film /> Video Batch Processor</div>
        {navItems.map((item) => (
          <button className={activeView === item.id ? "nav-active" : ""} key={item.id} onClick={() => setActiveView(item.id)}>
            {item.icon}
            {item.label}
          </button>
        ))}
        <div className="license-summary">
          <ShieldCheck />
          <span>License</span>
          <strong>{state === "VALID_FROM_CACHE" ? "Offline grace" : "Active"}</strong>
        </div>
      </aside>
      <section className="dashboard-main">
        <header>
          <div>
            <h1>{activeView === "dashboard" ? `Welcome, ${name}!` : pageTitle}</h1>
            <p>{pageSubtitle}</p>
          </div>
          <div className="header-actions">
            <button onClick={importNativeVideos}>
              <Upload /> Import Videos
            </button>
            <button className="solid" onClick={importNativeVideos}>
              <Plus /> Add Videos
            </button>
            <button onClick={importVideoFolder}>
              <FolderOpen /> Import Folder
            </button>
            <button onClick={() => setActiveView("settings")}><Settings /> Settings</button>
          </div>
        </header>
        {(activeView === "dashboard" || activeView === "videos" || activeView === "processing") && (
          <div className="stats-grid">
            <Stat label="Total Videos" value={String(items.length)} meta={formatBytes(totals.bytes)} />
            <Stat label="Completed" value={String(totals.complete)} meta={`${totals.overall}% overall`} />
            <Stat label="Processing" value={String(totals.processing)} meta={running ? "Workers active" : "Workers idle"} />
            <Stat label="Failed" value={String(totals.failed)} meta="Needs review" />
          </div>
        )}
        {(activeView === "dashboard" || activeView === "processing" || activeView === "presets") && (
          <>
            <div className="batch-toolbar">
              <button className="solid" onClick={startBatch}><Play /> {running ? "Resume" : "Start"}</button>
              <button onClick={pauseBatch}><Info /> Pause</button>
              <button onClick={stopBatch}><Square /> Stop</button>
              <select
                aria-label="Processing preset"
                value={selectedPresetId}
                onChange={(event) => updateSelectedPreset(event.target.value)}
                disabled={running}
              >
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                ))}
              </select>
              <button className="output-button" onClick={chooseOutputFolder} disabled={running}>
                <FolderOpen /> {outputDir ? outputDir.split(/[\\/]/).pop() || "Output" : "Output Folder"}
              </button>
              <strong>{totals.overall}%</strong>
              <progress value={totals.overall} max={100} />
            </div>
            <TransformPanel transforms={transforms} running={running} onChange={updateTransforms} />
          </>
        )}
        {(activeView === "dashboard" || activeView === "videos" || activeView === "processing") && (
          <div className="dashboard-panels">
            <section className="panel">
              <h2>{activeView === "videos" ? "Video Library" : "Current Processing"}</h2>
              {items.length === 0 && <EmptyQueue onFiles={importFiles} />}
              {items.slice(0, activeView === "dashboard" ? 5 : items.length).map((item) => (
                <div className="progress-row" key={item.id}>
                  <div className="thumb"><Film size={22} /></div>
                  <span>
                    {item.name}
                    <small>
                      {formatBytes(item.size)} · {item.status}
                      {item.presetName ? ` · ${item.presetName}` : ""}
                      {item.transformSummary ? ` · ${item.transformSummary}` : ""}
                      {item.resolution ? ` · ${item.resolution}` : ""}
                      {item.durationSeconds ? ` · ${Math.round(item.durationSeconds)}s` : ""}
                      {item.outputPath ? ` · ${item.outputPath}` : ""}
                    </small>
                  </span>
                  <progress value={item.progress} max={100} />
                  {item.outputPath ? (
                    <button onClick={() => videoReposterBridge.showItemInFolder(item.outputPath!)}>Open</button>
                  ) : item.status === "processing" || item.status === "starting" ? (
                    <button onClick={() => stopQueueItem(item)}>Stop</button>
                  ) : item.status === "failed" ? (
                    <button onClick={() => retryQueueItem(item)}>Retry</button>
                  ) : (
                    <button onClick={() => removeQueueItem(item)}>Remove</button>
                  )}
                </div>
              ))}
            </section>
            <section className="panel">
              <div className="panel-title">
                <h2>Processing Queue</h2>
                <div className="panel-actions">
                  <button onClick={clearFinishedItems}>Clear Finished</button>
                  <button onClick={clearQueue} disabled={!items.length}>Clear Queue</button>
                </div>
              </div>
              {items.map((item) => (
                <div className="queue-row" key={item.id}>
                  <Film size={18} />
                  <span>{item.name}<small>{item.status} · {item.progress}%</small></span>
                  <div className="queue-actions">
                    {(item.status === "processing" || item.status === "starting") && (
                      <button aria-label={`Stop ${item.name}`} title="Stop" onClick={() => stopQueueItem(item)}>
                        <Square size={16} />
                      </button>
                    )}
                    {item.status === "failed" && (
                      <button aria-label={`Retry ${item.name}`} title="Retry" onClick={() => retryQueueItem(item)}>
                        <RotateCcw size={16} />
                      </button>
                    )}
                    {item.outputPath && (
                      <button aria-label={`Open ${item.name}`} title="Open output" onClick={() => videoReposterBridge.showItemInFolder(item.outputPath!)}>
                        <FolderOpen size={16} />
                      </button>
                    )}
                    <button aria-label={`Remove ${item.name}`} title="Remove" onClick={() => removeQueueItem(item)}>
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="log-panel">
                <div className="log-heading">
                  <h2>Processing Log</h2>
                  <button onClick={() => videoReposterBridge.openProcessingLog()}>Open Log</button>
                </div>
                {logs.slice(-5).map((entry) => <p key={entry}>{entry}</p>)}
              </div>
            </section>
          </div>
        )}
        {activeView === "dashboard" || activeView === "history" ? <HistoryPanel history={history} onClear={clearHistory} /> : null}
        {activeView === "presets" && selectedPreset ? (
          <PresetGallery presets={presets} selectedPresetId={selectedPresetId} running={running} onSelect={updateSelectedPreset} />
        ) : null}
        {activeView === "settings" && (
          <SettingsPanel
            outputDir={outputDir}
            selectedPreset={selectedPreset}
            maxWorkers={maxWorkers}
            state={state}
            logs={logs}
            onChooseOutputFolder={chooseOutputFolder}
            onMaxWorkersChange={updateMaxWorkers}
            onResetDefaults={resetProcessingDefaults}
            onOpenLog={() => videoReposterBridge.openProcessingLog()}
          />
        )}
      </section>
    </main>
  );
}

function Stat({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <div className="stat">
      <Play />
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{meta}</small>
    </div>
  );
}

function HistoryPanel({ history, onClear }: { history: HistoryItem[]; onClear: () => void }) {
  return (
    <section className="panel history-panel">
      <div className="panel-title">
        <h2>Processing History</h2>
        <button onClick={onClear} disabled={!history.length}>Clear History</button>
      </div>
      {history.length === 0 ? (
        <p className="history-empty">Finished jobs will appear here.</p>
      ) : (
        <div className="history-list">
          {history.slice(0, 8).map((item) => (
            <div className="history-row" key={item.id}>
              <Film size={18} />
              <span>
                {item.name}
                <small>
                  {formatHistoryDate(item.completedAt)} · {item.status}
                  {item.presetName ? ` · ${item.presetName}` : ""}
                  {item.transformSummary ? ` · ${item.transformSummary}` : ""}
                  {item.resolution ? ` · ${item.resolution}` : ""}
                  {item.durationSeconds ? ` · ${Math.round(item.durationSeconds)}s` : ""}
                  {item.message && item.status === "failed" ? ` · ${item.message}` : ""}
                </small>
              </span>
              {item.outputPath ? (
                <button onClick={() => videoReposterBridge.showItemInFolder(item.outputPath!)}>Open</button>
              ) : (
                <strong>{item.status}</strong>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PresetGallery({
  presets,
  selectedPresetId,
  running,
  onSelect
}: {
  presets: PlatformPreset[];
  selectedPresetId: string;
  running: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="panel preset-gallery">
      <div className="panel-title">
        <h2>Platform Presets</h2>
      </div>
      <div className="preset-grid">
        {presets.map((preset) => (
          <button
            className={preset.id === selectedPresetId ? "preset-card selected" : "preset-card"}
            key={preset.id}
            onClick={() => onSelect(preset.id)}
            disabled={running}
          >
            <strong>{preset.name}</strong>
            <span>{preset.settings.width}x{preset.settings.height} · {preset.settings.fps} fps</span>
            <small>
              {preset.settings.codec} · {preset.settings.videoBitrate} video · {preset.settings.audioBitrate} audio
              {preset.settings.maxDurationSeconds ? ` · ${preset.settings.maxDurationSeconds}s max` : ""}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}

function SettingsPanel({
  outputDir,
  selectedPreset,
  maxWorkers,
  state,
  logs,
  onChooseOutputFolder,
  onMaxWorkersChange,
  onResetDefaults,
  onOpenLog
}: {
  outputDir: string;
  selectedPreset?: PlatformPreset;
  maxWorkers: number;
  state: string;
  logs: string[];
  onChooseOutputFolder: () => void;
  onMaxWorkersChange: (value: number) => void;
  onResetDefaults: () => void;
  onOpenLog: () => void;
}) {
  return (
    <div className="settings-grid">
      <section className="panel settings-card">
        <div className="panel-title">
          <h2>Output</h2>
          <button onClick={onChooseOutputFolder}>Choose Folder</button>
        </div>
        <InfoLine icon={<FolderOpen />} label="Folder" value={outputDir || "Same folder as source"} />
        <InfoLine icon={<Film />} label="Preset" value={selectedPreset?.name ?? "Not selected"} />
        <label className="settings-control">
          <span>Workers</span>
          <input type="number" min={1} max={4} value={maxWorkers} onChange={(event) => onMaxWorkersChange(Number(event.target.value))} />
        </label>
      </section>
      <section className="panel settings-card">
        <div className="panel-title">
          <h2>License & Logs</h2>
          <button onClick={onOpenLog}>Open Log</button>
        </div>
        <InfoLine icon={<ShieldCheck />} label="License" value={state === "VALID_FROM_CACHE" ? "Offline grace" : "Active"} />
        <InfoLine icon={<Info />} label="Last log" value={logs.at(-1) ?? "No log entries"} />
      </section>
      <section className="panel settings-card">
        <div className="panel-title">
          <h2>Defaults</h2>
          <button onClick={onResetDefaults}>Reset</button>
        </div>
        <InfoLine icon={<RotateCcw />} label="Preset" value="Instagram Reel" />
        <InfoLine icon={<Play />} label="Workers" value="2 concurrent jobs" />
      </section>
    </div>
  );
}

function TransformPanel({
  transforms,
  running,
  onChange
}: {
  transforms: TransformSettings;
  running: boolean;
  onChange: React.Dispatch<React.SetStateAction<TransformSettings>>;
}) {
  const setValue = <K extends keyof TransformSettings>(key: K, value: TransformSettings[K]) => {
    onChange((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="transform-panel">
      <div className="panel-title">
        <h2>Processing Adjustments</h2>
        <button disabled={running} onClick={() => onChange(defaultTransforms)}>Reset</button>
      </div>
      <div className="toggle-grid">
        <label>
          <input
            type="checkbox"
            checked={Boolean(transforms.mirrorHorizontal)}
            disabled={running}
            onChange={(event) => setValue("mirrorHorizontal", event.target.checked)}
          />
          Mirror
        </label>
        <label>
          <input
            type="checkbox"
            checked={Boolean(transforms.mirrorVertical)}
            disabled={running}
            onChange={(event) => setValue("mirrorVertical", event.target.checked)}
          />
          Flip
        </label>
        <label>
          <input
            type="checkbox"
            checked={Boolean(transforms.removeAudio)}
            disabled={running}
            onChange={(event) => setValue("removeAudio", event.target.checked)}
          />
          Mute
        </label>
        <label>
          <span>Rotate</span>
          <select
            value={transforms.rotateDegrees ?? 0}
            disabled={running}
            onChange={(event) => {
              const value = Number(event.target.value);
              setValue("rotateDegrees", value === 0 ? undefined : (value as TransformSettings["rotateDegrees"]));
            }}
          >
            <option value={0}>0 deg</option>
            <option value={90}>90 deg</option>
            <option value={180}>180 deg</option>
            <option value={270}>270 deg</option>
          </select>
        </label>
      </div>
      <div className="slider-grid">
        <Slider label="Brightness" min={-50} max={50} value={transforms.brightness ?? 0} disabled={running} onChange={(value) => setValue("brightness", value)} />
        <Slider label="Contrast" min={-50} max={50} value={transforms.contrast ?? 0} disabled={running} onChange={(value) => setValue("contrast", value)} />
        <Slider label="Saturation" min={-50} max={50} value={transforms.saturation ?? 0} disabled={running} onChange={(value) => setValue("saturation", value)} />
        <Slider label="Sharpness" min={0} max={100} value={transforms.sharpness ?? 0} disabled={running} onChange={(value) => setValue("sharpness", value)} />
        <Slider label="Volume" min={0} max={150} value={transforms.volume ?? 100} disabled={running || transforms.removeAudio} onChange={(value) => setValue("volume", value)} />
      </div>
    </section>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  disabled,
  onChange
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider-field">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
      <strong>{value}</strong>
    </label>
  );
}

type ViewKey = "dashboard" | "videos" | "processing" | "history" | "presets" | "settings";

const navItems: Array<{ id: ViewKey; label: string; icon: React.ReactNode }> = [
  { id: "dashboard", label: "Dashboard", icon: <Home /> },
  { id: "videos", label: "Videos", icon: <Video /> },
  { id: "processing", label: "Processing", icon: <Play /> },
  { id: "history", label: "History", icon: <RotateCw /> },
  { id: "presets", label: "Presets", icon: <Settings /> },
  { id: "settings", label: "Settings", icon: <Settings /> }
];

const viewTitles: Record<ViewKey, string> = {
  dashboard: "Dashboard",
  videos: "Videos",
  processing: "Processing",
  history: "History",
  presets: "Presets",
  settings: "Settings"
};

const viewSubtitles: Record<ViewKey, string> = {
  dashboard: "Batch process your videos easily and efficiently.",
  videos: "Review imported videos and remove anything that should not run.",
  processing: "Control the active queue, preset, output folder, and FFmpeg adjustments.",
  history: "Review finished jobs and reopen generated outputs.",
  presets: "Choose platform-ready output settings before starting the batch.",
  settings: "Manage output defaults, license status, and processing logs."
};

function appendLog(setLogs: React.Dispatch<React.SetStateAction<string[]>>, message: string) {
  void videoReposterBridge.appendProcessingLog(message);
  setLogs((current) => [...current, `${new Date().toLocaleTimeString()} - ${message}`]);
}

function EmptyQueue({ onFiles }: { onFiles: (files: FileList | null) => void }) {
  return (
    <label className="empty-queue">
      <FolderOpen />
      <strong>Drop videos here or choose files</strong>
      <span>Supported: MP4, MOV, AVI, MKV, WEBM, FLV</span>
      <input type="file" accept="video/*,.mp4,.mov,.avi,.mkv,.webm,.flv" multiple onChange={(event) => onFiles(event.target.files)} />
    </label>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
