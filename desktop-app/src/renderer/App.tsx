import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  Check,
  Clock,
  Cloud,
  Copy,
  Edit2,
  Film,
  FolderOpen,
  Home,
  Info,
  KeyRound,
  Laptop,
  Layers,
  ListVideo,
  Lock,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Settings,
  Shield,
  ShieldCheck,
  Square,
  ShoppingCart,
  Trash2,
  Upload,
  X
} from "lucide-react";
import type { CachedLicense, DeviceInfo, LicenseState, PackageLimits } from "../shared/license";
import { isLicenseKey, licenseRefreshDescription, licenseStateLabel, normalizeLicenseKey, packageLimitsForLicense } from "../shared/license";
import { productName, productTagline } from "../shared/branding";
import { buildOutputOverrides, isSupportedVideoPath, platformPresets, qualityLevels } from "../shared/processing";
import type { ImportedVideoFile, OutputNamingOptions, OutputSettings, PlatformPreset, QualityLevel, TransformSettings, VideoCodec } from "../shared/processing";
import { invalidVideoFailure, processingFailedFailure } from "../shared/processingFailure";
import type { ProcessingAvailability, ProcessingFailure } from "../shared/processingFailure";
import { buildProcessingTelemetryPayload } from "../shared/telemetry";
import { createVideoReposterBridge, getBridgeMode, usesNativeFileDialogs } from "./bridge";
import {
  buildQueueItems,
  buildQueueItemsFromImports,
  clampWorkers,
  cleanTransforms,
  currentBatchSettingsFromPreferences,
  canRetryHistoryItem,
  defaultPreferences,
  defaultTransforms,
  estimateQueueEtaSeconds,
  filterHistoryItems,
  formatBytes,
  formatDuration,
  formatEta,
  formatHistoryDate,
  formatVideoFormat,
  getFinishedQueueItems,
  getNewBatchItems,
  getPresetAccess,
  getProcessingActionState,
  getQueueTotals,
  getWorkerPoolState,
  importSourceLabel,
  isNewBatchLocked,
  loadCustomPresets,
  loadHistory,
  loadPreferences,
  loadQueue,
  queueStatusLabel,
  restoredDefaultPreferences,
  saveCustomPresets,
  saveHistory,
  savePreferences,
  saveQueue,
  summarizeImport,
  summarizeTransforms
} from "./state";
import type { HistoryFilter, HistoryItem, ImportSource, ProcessingPreferences, QueueFailure, QueueItem } from "./state";
import "./styles.css";

const videoReposterBridge = createVideoReposterBridge();
const bridgeMode = getBridgeMode();

function App() {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [license, setLicense] = useState<CachedLicense | null>(null);
  const [state, setState] = useState<LicenseState>("NO_LICENSE");
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState("");

  useEffect(() => {
    Promise.all([videoReposterBridge.getDeviceInfo(), videoReposterBridge.getLicenseStatus()])
      .then(([deviceInfo, status]) => {
        setDevice(deviceInfo);
        setState(status.state);
        setLicense(status.license);
        setLoading(false);
      })
      .catch((error: unknown) => {
        setStartupError(error instanceof Error ? error.message : `Could not connect to the local ${productName} worker.`);
        setLoading(false);
      });
  }, []);

  if (startupError) {
    return (
      <div className="boot boot-error">
        <strong>{productName} could not start.</strong>
        <span>{startupError}</span>
      </div>
    );
  }

  if (loading || !device) return <div className="boot">Starting {productName}...</div>;

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
  const [errorCode, setErrorCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [showBuyPopup, setShowBuyPopup] = useState(false);
  const normalized = useMemo(() => normalizeLicenseKey(key), [key]);

  async function activate() {
    setError("");
    setErrorCode("");
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
    setErrorCode(result.code ?? "");
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
        <h1>{productName}</h1>
        <p className="tagline">{productTagline}</p>
        <Feature icon={<ShieldCheck />} title="Secure & Licensed" text="Your license ensures premium features and regular updates." />
        <Feature icon={<Cloud />} title="Online Validation" text="License is verified securely through our server." />
        <Feature icon={<Laptop />} title="Device Bound" text="This license is activated on this device only." />
        <Feature icon={<RotateCw />} title="Plans for Everyone" text="Choose from monthly or yearly plans that fit your needs." />
        <div className="support-row">
          <span>Need Help?</span>
          <button onClick={() => videoReposterBridge.openExternal("https://wa.me/94784324261")}>Contact our support team</button>
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
          {key && <button aria-label="Clear license key" title="Clear license key" onClick={() => setKey("")}><X size={22} /></button>}
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
        {(errorCode === "LIC_003" || blockedState === "DEVICE_MISMATCH") && (
          <DeviceConflictHelp
            device={device}
            licenseKey={normalized}
            onContact={() => videoReposterBridge.openExternal("https://wa.me/94784324261")}
          />
        )}

        <button className="primary-action" onClick={activate} disabled={busy}>
          <ShieldCheck size={22} />
          {busy ? "Activating..." : "Activate License"}
        </button>
        <div className="or-line"><span>or</span></div>
        <button className="secondary-action" onClick={() => setShowBuyPopup(true)}>
          <ShoppingCart size={22} />
          Buy License
        </button>
        <p className="terms">By activating, you agree to our <a>Terms of Use</a> and <a>Privacy Policy</a>.</p>
        {showBuyPopup && (
          <div className="modal-backdrop" role="presentation" onClick={() => setShowBuyPopup(false)}>
            <section
              aria-labelledby="buy-license-title"
              aria-modal="true"
              className="buy-license-modal"
              role="dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <button className="modal-close" aria-label="Close buy license popup" title="Close" onClick={() => setShowBuyPopup(false)}>
                <X size={20} />
              </button>
              <div className="modal-icon">
                <ShoppingCart size={28} />
              </div>
              <h3 id="buy-license-title">Buy License</h3>
              <p>If you want to buy a license, contact +94784324261 through WhatsApp.</p>
              <button className="whatsapp-action" onClick={() => videoReposterBridge.openExternal("https://wa.me/94784324261")}>
                Contact on WhatsApp
              </button>
            </section>
          </div>
        )}
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
      <button
        className="copy-value"
        aria-label={`Copy ${label.toLowerCase()}`}
        title={`Copy ${label.toLowerCase()}`}
        onClick={() => void copyText(value)}
      >
        <Copy size={17} />
      </button>
    </div>
  );
}

function Dashboard({ license, state }: { license: CachedLicense | null; state: LicenseState }) {
  const name = license?.user?.name?.split(" ")[0] ?? "User";
  const [preferences, setPreferences] = useState<ProcessingPreferences>(loadPreferences);
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [items, setItems] = useState<QueueItem[]>(loadQueue);
  const [running, setRunning] = useState(false);
  const [batchStartedAt, setBatchStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [logs, setLogs] = useState<string[]>(["Ready for video import."]);
  const [importStatus, setImportStatus] = useState("");
  const [basePresets, setBasePresets] = useState<PlatformPreset[]>(platformPresets);
  const [customPresets, setCustomPresets] = useState<PlatformPreset[]>(loadCustomPresets);
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory);
  const [queueClearConfirmation, setQueueClearConfirmation] = useState<"finished" | "all" | null>(null);
  const [processingAvailability, setProcessingAvailability] = useState<ProcessingAvailability | null>(null);
  const [currentBatchPresetId, setCurrentBatchPresetId] = useState(() => currentBatchSettingsFromPreferences(loadPreferences()).presetId);
  const [currentBatchOutputDir, setCurrentBatchOutputDir] = useState(() => currentBatchSettingsFromPreferences(loadPreferences()).outputDir);
  const [currentBatchMaxWorkers, setCurrentBatchMaxWorkers] = useState(() => currentBatchSettingsFromPreferences(loadPreferences()).maxWorkers);
  const [currentBatchOutputNaming, setCurrentBatchOutputNaming] = useState(() => currentBatchSettingsFromPreferences(loadPreferences()).outputNaming);
  const [currentBatchQuality, setCurrentBatchQuality] = useState<QualityLevel>("preset");
  const [customResolution, setCustomResolution] = useState<{ width: string; height: string }>({ width: "", height: "" });
  const videoPickerRef = useRef<HTMLInputElement | null>(null);
  const folderPickerRef = useRef<HTMLInputElement | null>(null);
  const historyIds = useRef(new Set(history.map((item) => item.id)));
  const telemetryIds = useRef(new Set<string>());
  const autoOpenOutputRef = useRef(preferences.autoOpenOutput);
  const dragCounterRef = useRef(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const totals = useMemo(() => getQueueTotals(items), [items]);
  const etaSeconds = running && batchStartedAt !== null ? estimateQueueEtaSeconds(totals.overall, now - batchStartedAt) : undefined;
  const packageLimits = useMemo(() => packageLimitsForLicense(license), [license]);
  const presets = useMemo(() => [...basePresets, ...customPresets], [basePresets, customPresets]);
  const visiblePresets = useMemo(() => presets.slice(0, packageLimits.template_limit), [packageLimits.template_limit, presets]);
  const defaultPresetId = preferences.defaultPresetId;
  const transforms = preferences.transforms;
  const processingActions = useMemo(
    () => getProcessingActionState(items, processingAvailability?.available ?? null, running),
    [items, processingAvailability?.available, running]
  );
  const workerPool = useMemo(
    () => getWorkerPoolState(items, currentBatchMaxWorkers, packageLimits.worker_limit),
    [currentBatchMaxWorkers, items, packageLimits.worker_limit]
  );

  useEffect(() => {
    videoReposterBridge.getProcessingPresets().then((nextPresets) => {
      if (nextPresets.length) setBasePresets(nextPresets);
    });
    videoReposterBridge.checkFfmpeg().then((result) => {
      setProcessingAvailability(result);
      appendLog(setLogs, result.message, result.technicalMessage);
    }).catch((error: unknown) => {
      const failure = processingFailedFailure(error instanceof Error ? error.message : "Processing availability check failed.");
      setProcessingAvailability({ available: false, message: failure.message, technicalMessage: failure.technicalMessage, failure });
      appendLog(setLogs, failure.message, failure.technicalMessage);
    });
    const unsubscribe = videoReposterBridge.onProcessingUpdate((update) => {
      setItems((current) =>
        current.map((item) =>
          item.processingJobId === update.id
            ? (() => {
                if (update.status === "complete" || update.status === "failed") {
                  const failure = update.status === "failed"
                    ? toQueueFailure(update.failure ?? processingFailedFailure(update.message ?? "Processing failed without details."))
                    : undefined;
                  recordHistoryItem(item, update.status, failure?.message ?? update.message, failure);
                  void reportProcessingTelemetry(item, update, failure);
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
                processingJobId: update.status === "complete" || update.status === "failed" || update.status === "stopped" ? undefined : item.processingJobId,
                failure: update.status === "failed" ? toQueueFailure(update.failure ?? processingFailedFailure(update.message ?? "Processing failed without details.")) : undefined
                };
              })()
            : item
        )
      );
      appendLog(
        setLogs,
        `${update.status}: ${update.progress}%${update.message ? ` - ${update.failure?.message ?? update.message}` : ""}`,
        update.failure?.technicalMessage
      );
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    saveHistory(history);
  }, [history]);

  useEffect(() => {
    saveCustomPresets(customPresets);
  }, [customPresets]);

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    autoOpenOutputRef.current = preferences.autoOpenOutput;
  }, [preferences.autoOpenOutput]);

  useEffect(() => {
    saveQueue(items);
  }, [items]);

  useEffect(() => {
    if (!running) {
      setBatchStartedAt(null);
      return undefined;
    }
    setBatchStartedAt((current) => current ?? Date.now());
    setNow(Date.now());
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, [running]);

  useEffect(() => {
    const item = items.find((next) => next.path && !next.metadataState);
    if (!item?.path) return;
    setItems((current) => current.map((next) => next.id === item.id ? { ...next, metadataState: "probing" } : next));
    videoReposterBridge.probeVideoFile(item.path).then((probe) => {
      setItems((current) => current.map((next) => next.id === item.id
        ? {
            ...next,
            metadataState: probe.valid ? "ready" : "unavailable",
            durationSeconds: probe.durationSeconds,
            resolution: probe.width && probe.height ? `${probe.width}x${probe.height}` : undefined,
            codec: probe.codec
          }
        : next));
    }).catch(() => {
      setItems((current) => current.map((next) => next.id === item.id ? { ...next, metadataState: "unavailable" } : next));
    });
  }, [items]);

  useEffect(() => {
    setPreferences((current) => ({
      ...current,
      maxWorkers: Math.min(current.maxWorkers, packageLimits.worker_limit),
      defaultPresetId: visiblePresets.some((preset) => preset.id === current.defaultPresetId)
        ? current.defaultPresetId
        : visiblePresets[0]?.id ?? current.defaultPresetId
    }));
    setCurrentBatchPresetId((current) => visiblePresets.some((preset) => preset.id === current) ? current : visiblePresets[0]?.id ?? current);
    setCurrentBatchMaxWorkers((current) => Math.min(current, packageLimits.worker_limit));
  }, [packageLimits.worker_limit, visiblePresets]);

  useEffect(() => {
    if (!running) return;

    const activeCount = items.filter((item) => item.status === "processing" || item.status === "starting").length;
    const openSlots = currentBatchMaxWorkers - activeCount;
    if (openSlots > 0) {
      items
        .filter((item) => item.status === "queued" || item.status === "paused")
        .slice(0, openSlots)
        .forEach((item) => void launchQueueItem(item));
    }

    if (items.length > 0 && activeCount === 0 && items.every((item) => item.status === "complete" || item.status === "failed")) {
      setRunning(false);
      appendLog(setLogs, "Batch complete.");
      if (autoOpenOutputRef.current) {
        const firstOutput = items.find((item) => item.status === "complete" && item.outputPath)?.outputPath;
        if (firstOutput) {
          void videoReposterBridge.showItemInFolder(firstOutput);
          appendLog(setLogs, "Opened the output folder for the completed batch.");
        }
      }
    }
  }, [items, running, currentBatchMaxWorkers]);

  function notifyImport(message: string) {
    setImportStatus(message);
    appendLog(setLogs, message);
  }

  function importFiles(files: FileList | null, source: ImportSource | "drop" = "drop") {
    if (!files?.length) {
      notifyImport(source === "folder" ? "No supported videos found in selected folder." : "No videos selected.");
      return;
    }
    // In Electron, File objects from drag-and-drop and file inputs expose a .path
    // property with the full filesystem path. Use it to create proper ImportedVideoFile
    // objects so launchQueueItem can find and process the files.
    const electronFiles = Array.from(files) as Array<File & { path?: string }>;
    if (electronFiles[0]?.path) {
      const imported: ImportedVideoFile[] = electronFiles.flatMap((f) =>
        f.path && isSupportedVideoPath(f.path)
          ? [{ path: f.path, name: f.name, size: f.size, lastModified: f.lastModified }]
          : []
      );
      queueImportedVideos(imported, source === "folder" ? "folder" : "files");
      return;
    }
    // Fallback for browser / preview mode where no filesystem path is available.
    const result = buildQueueItems(Array.from(files), items);
    if (items.length + result.items.length > packageLimits.video_limit) {
      notifyImport(`Your ${packageLabel(license)} package allows ${packageLimits.video_limit} videos per batch.`);
      return;
    }
    if (result.items.length) setItems((current) => [...current, ...result.items]);
    const emptyMessage = source === "folder" ? "No new supported videos found in selected folder." : "No new videos selected.";
    const sourceLabel = source === "drop" ? "dropped files" : importSourceLabel(source);
    notifyImport(
      result.items.length
        ? `Added ${result.items.length} video${result.items.length === 1 ? "" : "s"} from ${sourceLabel}${
            result.skipped ? `, skipped ${result.skipped} duplicate/unsupported file${result.skipped === 1 ? "" : "s"}` : ""
          }.`
        : emptyMessage
    );
  }

  async function importNativeVideos() {
    notifyImport("Opening video files picker...");
    if (!usesNativeFileDialogs(bridgeMode)) {
      videoPickerRef.current?.click();
      return;
    }
    try {
      const files = await videoReposterBridge.selectVideoFiles();
      queueImportedVideos(files, "files");
    } catch (error) {
      appendLog(setLogs, `Could not open video picker: ${error instanceof Error ? error.message : "Unknown error"}.`);
    }
  }

  async function importVideoFolder() {
    notifyImport("Opening video folder picker...");
    if (!usesNativeFileDialogs(bridgeMode)) {
      folderPickerRef.current?.click();
      return;
    }
    try {
      const files = await videoReposterBridge.selectVideoFolder();
      queueImportedVideos(files, "folder");
    } catch (error) {
      appendLog(setLogs, `Could not open folder picker: ${error instanceof Error ? error.message : "Unknown error"}.`);
    }
  }

  function queueImportedVideos(files: ImportedVideoFile[], source: ImportSource) {
    if (files.length === 0) {
      notifyImport(source === "folder" ? "No supported videos found in selected folder." : "No videos selected.");
      return;
    }
    const result = buildQueueItemsFromImports(files, items);
    if (result.items.length === 0) {
      notifyImport(source === "folder" ? "No new supported videos found in selected folder." : "No new videos selected.");
      return;
    }
    if (items.length + result.items.length > packageLimits.video_limit) {
      notifyImport(`Your ${packageLabel(license)} package allows ${packageLimits.video_limit} videos per batch.`);
      return;
    }
    if (result.items.length) setItems((current) => [...current, ...result.items]);
    notifyImport(
      `Added ${result.items.length} video${result.items.length === 1 ? "" : "s"} from ${importSourceLabel(source)}${result.skipped ? `, skipped ${result.skipped}` : ""}.`
    );
  }

  async function chooseCurrentBatchOutputFolder() {
    appendLog(setLogs, "Opening output folder picker...");
    try {
      const selected = await videoReposterBridge.selectOutputFolder();
      if (!selected) {
        appendLog(setLogs, "No output folder selected.");
        return;
      }
      setCurrentBatchOutputDir(selected);
      appendLog(setLogs, `Current batch output folder set to ${selected}.`);
    } catch (error) {
      appendLog(setLogs, `Could not open output folder picker: ${error instanceof Error ? error.message : "Unknown error"}.`);
    }
  }

  function clearCurrentBatchOutputFolder() {
    setCurrentBatchOutputDir("");
    appendLog(setLogs, "Current batch output folder reset to the source folder.");
  }

  async function chooseDefaultOutputFolder() {
    appendLog(setLogs, "Opening default output folder picker...");
    try {
      const selected = await videoReposterBridge.selectOutputFolder();
      if (!selected) {
        appendLog(setLogs, "Default output folder was not changed.");
        return;
      }
      setPreferences((current) => ({ ...current, outputDir: selected }));
      appendLog(setLogs, `Default output folder set to ${selected}.`);
    } catch (error) {
      appendLog(setLogs, `Could not open default output folder picker: ${error instanceof Error ? error.message : "Unknown error"}.`);
    }
  }

  function clearDefaultOutputFolder() {
    setPreferences((current) => ({ ...current, outputDir: "" }));
    appendLog(setLogs, "Default output folder reset to the source folder.");
  }

  function updateTransforms(next: React.SetStateAction<TransformSettings>) {
    setPreferences((current) => ({
      ...current,
      transforms: typeof next === "function" ? next(current.transforms) : next
    }));
  }

  function updateDefaultPreset(id: string) {
    setPreferences((current) => ({ ...current, defaultPresetId: id }));
    appendLog(setLogs, `Default preset changed to ${presets.find((preset) => preset.id === id)?.name ?? id}.`);
  }

  function saveCustomPreset(preset: PlatformPreset) {
    setCustomPresets((current) => {
      const nextPreset = { ...preset, custom: true };
      const exists = current.some((item) => item.id === nextPreset.id);
      return exists ? current.map((item) => item.id === nextPreset.id ? nextPreset : item) : [...current, nextPreset];
    });
    appendLog(setLogs, `Saved custom preset ${preset.name}.`);
  }

  function deleteCustomPreset(id: string) {
    const fallbackPresetId = basePresets[0]?.id ?? defaultPreferences.defaultPresetId;
    const deleted = customPresets.find((preset) => preset.id === id);
    setCustomPresets((current) => current.filter((preset) => preset.id !== id));
    setPreferences((current) => current.defaultPresetId === id ? { ...current, defaultPresetId: fallbackPresetId } : current);
    setCurrentBatchPresetId((current) => current === id ? fallbackPresetId : current);
    appendLog(setLogs, `Deleted custom preset ${deleted?.name ?? id}.`);
  }

  function updateDefaultMaxWorkers(value: number) {
    const next = Math.min(clampWorkers(value), packageLimits.worker_limit);
    if (next < value) appendLog(setLogs, `Your ${packageLabel(license)} package allows ${packageLimits.worker_limit} concurrent worker${packageLimits.worker_limit === 1 ? "" : "s"}.`);
    setPreferences((current) => ({ ...current, maxWorkers: next }));
  }

  function updateCurrentBatchMaxWorkers(value: number) {
    const next = Math.min(clampWorkers(value), packageLimits.worker_limit);
    if (next < value) appendLog(setLogs, `Your ${packageLabel(license)} package allows ${packageLimits.worker_limit} concurrent worker${packageLimits.worker_limit === 1 ? "" : "s"}.`);
    setCurrentBatchMaxWorkers(next);
  }

  function updateDefaultOutputNaming(next: Partial<OutputNamingOptions>) {
    setPreferences((current) => ({ ...current, outputNaming: { ...current.outputNaming, ...next } }));
  }

  function updateAutoOpenOutput(value: boolean) {
    setPreferences((current) => ({ ...current, autoOpenOutput: value }));
    appendLog(setLogs, value ? "Output folder will open automatically when a batch finishes." : "Automatic output folder opening turned off.");
  }

  function updateCurrentBatchOutputNaming(next: Partial<OutputNamingOptions>) {
    setCurrentBatchOutputNaming((current) => ({ ...current, ...next }));
  }

  function restoreDefaultSettings() {
    const fallbackPresetId = visiblePresets.some((preset) => preset.id === defaultPreferences.defaultPresetId)
      ? defaultPreferences.defaultPresetId
      : visiblePresets[0]?.id ?? defaultPreferences.defaultPresetId;
    setPreferences(restoredDefaultPreferences(packageLimits.worker_limit, fallbackPresetId));
    appendLog(setLogs, "Restored saved default output, workers, preset, and processing adjustments.");
  }

  async function startBatch() {
    if (processingActions.startDisabled) {
      appendLog(
        setLogs,
        processingActions.startReason ?? "No queued videos are ready to process.",
        processingAvailability?.failure?.technicalMessage
      );
      return;
    }
    setRunning(true);
    setActiveView("queue");
    appendLog(setLogs, `Started queue with ${currentBatchMaxWorkers} workers.`);
  }

  async function launchQueueItem(item: QueueItem) {
    const attemptedItem = {
      ...item,
      presetId: currentBatchPresetId,
      presetName: visiblePresets.find((preset) => preset.id === currentBatchPresetId)?.name ?? currentBatchPresetId,
      transformSummary: summarizeTransforms(transforms)
    };
    if (!item.path) {
      const failure = invalidVideoFailure(`Could not start ${item.name}: the imported item has no usable filesystem path.`);
      const queueFailure = toQueueFailure(failure);
      setItems((current) => current.map((next) => (next.id === item.id ? { ...attemptedItem, status: "failed", progress: 0, failure: queueFailure } : next)));
      recordHistoryItem(attemptedItem, "failed", queueFailure.message, queueFailure);
      appendLog(setLogs, failure.message, failure.technicalMessage);
      return;
    }

    setItems((current) => current.map((next) => (next.id === item.id ? { ...next, status: "starting", progress: 0, failure: undefined } : next)));
    const outputOverrides = buildOutputOverrides(currentBatchQuality, customResolution.width, customResolution.height);
    let started: Awaited<ReturnType<typeof videoReposterBridge.startProcessingFile>>;
    try {
      started = await videoReposterBridge.startProcessingFile(item.path, currentBatchPresetId, currentBatchOutputDir || undefined, cleanTransforms(transforms), currentBatchOutputNaming, outputOverrides);
    } catch (error) {
      const failure = processingFailedFailure(error instanceof Error ? error.message : "Processing request failed.");
      const queueFailure = toQueueFailure(failure);
      setItems((current) => current.map((next) => (next.id === item.id ? { ...attemptedItem, status: "failed", progress: 0, failure: queueFailure } : next)));
      recordHistoryItem(attemptedItem, "failed", queueFailure.message, queueFailure);
      appendLog(setLogs, failure.message, failure.technicalMessage);
      return;
    }
    if (!started.ok) {
      const queueFailure = toQueueFailure(started.failure);
      setItems((current) => current.map((next) => (next.id === item.id ? { ...attemptedItem, status: "failed", progress: 0, failure: queueFailure } : next)));
      recordHistoryItem(attemptedItem, "failed", queueFailure.message, queueFailure);
      appendLog(setLogs, started.failure.message, started.failure.technicalMessage);
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
              presetId: currentBatchPresetId,
              presetName: started.preset.name,
              transformSummary: summarizeTransforms(transforms),
              durationSeconds: started.probe.durationSeconds,
              resolution: started.probe.width && started.probe.height ? `${started.probe.width}x${started.probe.height}` : undefined,
              failure: undefined
            }
          : next
      )
    );
    appendLog(
      setLogs,
      `Started ${started.preset.name} job for ${item.name}${started.probe.durationSeconds ? ` (${Math.round(started.probe.durationSeconds)}s)` : ""}. Output: ${started.outputPath}`
    );
  }

  async function reportProcessingTelemetry(item: QueueItem, update: { id: string; status: string; elapsedMs?: number; throughputMbPerMin?: number }, failure?: QueueFailure) {
    if (!license?.license_key || telemetryIds.current.has(update.id)) return;
    const payload = buildProcessingTelemetryPayload({
      jobId: update.id,
      status: update.status,
      preset: item.presetId ?? currentBatchPresetId,
      elapsedMs: update.elapsedMs,
      throughputMbPerMin: update.throughputMbPerMin,
      inputSizeBytes: item.size,
      errorCode: failure?.code
    });
    if (!payload) return;
    telemetryIds.current.add(update.id);
    try {
      await videoReposterBridge.sendProcessingTelemetry(license.license_key, payload);
    } catch {
      // Telemetry is best-effort and must never affect local processing.
    }
  }

  function pauseBatch() {
    if (processingActions.pauseDisabled) return;
    setRunning(false);
    setItems((current) => current.map((item) => item.status === "queued" ? { ...item, status: "paused" } : item));
    appendLog(setLogs, "Paused queue scheduling. Active FFmpeg jobs will continue.");
  }

  function stopBatch() {
    if (processingActions.stopDisabled) return;
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
          ? { ...next, status: "queued", progress: 0, processingJobId: undefined, outputPath: undefined, presetName: undefined, transformSummary: undefined, failure: undefined }
          : next
      )
    );
    appendLog(setLogs, `Queued ${item.name} for retry.`);
  }

  function retryHistoryItem(item: HistoryItem) {
    if (!canRetryHistoryItem(item) || !item.sourcePath) {
      appendLog(setLogs, "This failed attempt cannot be retried. Follow the recovery message shown in History.");
      return;
    }
    const existing = items.find((queueItem) => queueItem.path === item.sourcePath);
    if (existing) {
      retryQueueItem(existing);
    } else {
      setItems((current) => [
        ...current,
        {
          id: `${item.sourcePath}:retry:${Date.now()}`,
          path: item.sourcePath,
          name: item.name,
          size: item.sourceSize ?? 0,
          progress: 0,
          status: "queued"
        }
      ]);
      appendLog(setLogs, `Queued ${item.name} from History using the current batch preset.`);
    }
    setActiveView("queue");
  }

  function removeQueueItem(item: QueueItem) {
    if (item.processingJobId) void videoReposterBridge.stopProcessingJob(item.processingJobId);
    setItems((current) => current.filter((next) => next.id !== item.id));
    appendLog(setLogs, `Removed ${item.name} from the queue.`);
  }

  function clearFinishedItems() {
    const removable = getFinishedQueueItems(items).length;
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

  function recordHistoryItem(item: QueueItem, status: "complete" | "failed", message?: string, failure?: QueueFailure) {
    const id = item.processingJobId ? `${item.processingJobId}:${status}` : `${item.id}:${status}:${Date.now()}`;
    if (historyIds.current.has(id)) return;
    historyIds.current.add(id);
    setHistory((current) => [
      {
        id,
        name: item.name,
        status,
        outputPath: item.outputPath,
        sourcePath: item.path,
        sourceSize: item.size,
        presetName: item.presetName,
        transformSummary: item.transformSummary,
        resolution: item.resolution,
        durationSeconds: item.durationSeconds,
        codec: item.codec,
        message,
        failure,
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
  const defaultPreset = visiblePresets.find((preset) => preset.id === defaultPresetId) ?? visiblePresets[0];

  function renderStats() {
    return (
      <div className="stats-grid">
        <Stat label="Total Videos" value={String(items.length)} meta={formatBytes(totals.bytes)} />
        <Stat label="Completed" value={String(totals.complete)} meta={`${totals.overall}% overall`} />
        <Stat label="Processing" value={String(totals.processing)} meta={running ? (etaSeconds !== undefined ? formatEta(etaSeconds) : "Workers active") : "Workers idle"} />
        <Stat label="Failed" value={String(totals.failed)} meta="Needs review" />
      </div>
    );
  }

  function renderActiveLogPanel() {
    return (
      <section className="panel active-log-panel">
        <h2>Active Processing Log</h2>
        {logs.slice(-5).map((entry, index) => <p key={index}>{entry}</p>)}
      </section>
    );
  }

  function renderNewBatchPage() {
    const batchItems = getNewBatchItems(items);
    const importSummary = summarizeImport(batchItems);
    if (isNewBatchLocked(items, running)) {
      return (
        <section className="panel batch-handoff">
          <Play size={28} />
          <div>
            <h2>Batch in progress</h2>
            <p>Preparation controls are locked while the current batch is running.</p>
          </div>
          <button onClick={() => setActiveView("queue")}>View Queue</button>
        </section>
      );
    }

    return (
      <>
        <section className="panel new-batch-import">
          <div className="panel-title">
            <div>
              <h2>Choose Videos</h2>
              <p>{batchItems.length} of {packageLimits.video_limit} videos ready for this batch.</p>
            </div>
            <div className="panel-actions">
              <button aria-label="Add video files" title="Choose one or more video files" onClick={importNativeVideos}><Plus size={17} /> Add Videos</button>
              <button aria-label="Add video folder" title="Choose a folder containing videos" onClick={importVideoFolder}><FolderOpen size={17} /> Add Folder</button>
            </div>
          </div>
          {batchItems.length === 0 ? (
            <EmptyQueue />
          ) : (
            <>
            <div className="import-summary-bar" role="status" aria-live="polite">
              <span><strong>{importSummary.count}</strong> video{importSummary.count === 1 ? "" : "s"}</span>
              <span><strong>{formatBytes(importSummary.totalBytes)}</strong> total</span>
              <span className="import-summary-ok"><strong>{importSummary.ready}</strong> validated</span>
              {importSummary.checking > 0 && <span className="import-summary-checking"><strong>{importSummary.checking}</strong> checking</span>}
              {importSummary.unreadable > 0 && <span className="import-summary-bad"><strong>{importSummary.unreadable}</strong> unreadable</span>}
            </div>
            <div className="new-batch-video-list">
              {batchItems.map((item) => (
                <QueueItemRow
                  key={item.id}
                  item={item}
                  onOpen={() => undefined}
                  onRemove={() => removeQueueItem(item)}
                  onRetry={() => retryQueueItem(item)}
                  onStop={() => stopQueueItem(item)}
                />
              ))}
            </div>
            </>
          )}
        </section>
        <section className="panel batch-destination">
          <div>
            <label htmlFor="new-batch-preset">Preset</label>
            <select
              id="new-batch-preset"
              value={currentBatchPresetId}
              onChange={(event) => setCurrentBatchPresetId(event.target.value)}
            >
              {visiblePresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </select>
          </div>
          <div className="output-folder-picker">
            <label>Output Folder</label>
            <div className="output-folder-row">
              <span className="output-folder-path" title={currentBatchOutputDir || "Same folder as source video"}>
                {currentBatchOutputDir ? currentBatchOutputDir : <em>Same folder as source</em>}
              </span>
              <button type="button" aria-label="Choose current batch output folder" onClick={chooseCurrentBatchOutputFolder}>
                <FolderOpen size={15} /> Choose
              </button>
              {currentBatchOutputDir && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Clear output folder and reset to same folder as source"
                  title="Reset to same folder as source"
                  onClick={clearCurrentBatchOutputFolder}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>
          <div>
            <label htmlFor="new-batch-output-template">Output Name</label>
            <input
              id="new-batch-output-template"
              type="text"
              value={currentBatchOutputNaming.template}
              maxLength={120}
              onChange={(event) => updateCurrentBatchOutputNaming({ template: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor="new-batch-output-format">Output Format</label>
            <select
              id="new-batch-output-format"
              value={currentBatchOutputNaming.format}
              onChange={(event) => updateCurrentBatchOutputNaming({ format: event.target.value as OutputNamingOptions["format"] })}
            >
              <option value="mp4">MP4</option>
              <option value="mkv">MKV</option>
              <option value="mov">MOV</option>
            </select>
          </div>
          <div>
            <label htmlFor="new-batch-quality">Quality</label>
            <select
              id="new-batch-quality"
              value={currentBatchQuality}
              onChange={(event) => setCurrentBatchQuality(event.target.value as QualityLevel)}
            >
              {qualityLevels.map((level) => <option key={level} value={level}>{qualityLabel(level)}</option>)}
            </select>
          </div>
          <div className="resolution-inputs">
            <label>Custom Resolution <small>(optional — leave blank to use preset)</small></label>
            <div className="resolution-fields">
              <input
                id="new-batch-res-width"
                type="number"
                min={16}
                max={7680}
                step={2}
                placeholder="Width px"
                aria-label="Custom output width in pixels"
                value={customResolution.width}
                onChange={(event) => setCustomResolution((prev) => ({ ...prev, width: event.target.value }))}
              />
              <span aria-hidden="true">×</span>
              <input
                id="new-batch-res-height"
                type="number"
                min={16}
                max={7680}
                step={2}
                placeholder="Height px"
                aria-label="Custom output height in pixels"
                value={customResolution.height}
                onChange={(event) => setCustomResolution((prev) => ({ ...prev, height: event.target.value }))}
              />
            </div>
          </div>
          <div>
            <label htmlFor="new-batch-workers">Current Batch Workers</label>
            <input
              id="new-batch-workers"
              type="number"
              min={1}
              max={packageLimits.worker_limit}
              value={currentBatchMaxWorkers}
              onChange={(event) => updateCurrentBatchMaxWorkers(Number(event.target.value))}
            />
          </div>
        </section>
        <TransformPanel transforms={transforms} running={false} onChange={updateTransforms} />
        <section className="new-batch-start">
          <div>
            <strong>{batchItems.length} video{batchItems.length === 1 ? "" : "s"} ready</strong>
            <span>{visiblePresets.find((preset) => preset.id === currentBatchPresetId)?.name ?? currentBatchPresetId}</span>
          </div>
          {processingActions.startReason && <p role="status">{processingActions.startReason}</p>}
          <button className="solid" onClick={startBatch} disabled={processingActions.startDisabled}><Play size={18} /> Start Batch</button>
        </section>
      </>
    );
  }

  function renderQueuePage() {
    const finishedItemCount = getFinishedQueueItems(items).length;
    const hasFinishedItems = finishedItemCount > 0;
    const hasPausedItems = items.some((item) => item.status === "paused");
    const startLabel = running ? "Running" : (processingActions.activeCount > 0 || hasPausedItems) ? "Resume" : "Start";
    return (
      <>
        {renderStats()}
        <section className="panel queue-page">
          <div className="queue-page-toolbar">
            <div>
              <h2>Processing Queue</h2>
              <p>{items.length ? `${items.length} item${items.length === 1 ? "" : "s"} in the current queue.` : "No items in the current queue."}</p>
              {running && (
                <p className="queue-eta" role="status" aria-live="polite">
                  <Clock size={15} /> {formatEta(etaSeconds)}
                </p>
              )}
            </div>
            <div className="queue-level-actions">
              <button className="solid" onClick={startBatch} disabled={processingActions.startDisabled}><Play size={17} /> {startLabel}</button>
              <button onClick={pauseBatch} disabled={processingActions.pauseDisabled}><Pause size={17} /> Pause</button>
              <button onClick={stopBatch} disabled={processingActions.stopDisabled}><Square size={17} /> Stop</button>
              <button onClick={() => setQueueClearConfirmation("finished")} disabled={!hasFinishedItems}>Remove Finished Entries</button>
              <button onClick={() => setQueueClearConfirmation("all")} disabled={!items.length}>Clear Queue</button>
            </div>
          </div>
          {processingActions.startReason && <p className="queue-action-hint" role="status">{processingActions.startReason}</p>}
          <section className="worker-pool-panel" aria-label="Worker pool">
            <div>
              <span>Active</span>
              <strong>{workerPool.activeCount}</strong>
            </div>
            <div>
              <span>Queued</span>
              <strong>{workerPool.queuedCount}</strong>
            </div>
            <div>
              <span>Available Slots</span>
              <strong>{workerPool.availableSlots}</strong>
            </div>
            <label>
              <span>Workers</span>
              <div className="worker-stepper">
                <button
                  aria-label="Decrease current batch workers"
                  disabled={workerPool.maxWorkers <= 1}
                  onClick={() => updateCurrentBatchMaxWorkers(workerPool.maxWorkers - 1)}
                >
                  -
                </button>
                <input
                  aria-label="Current batch workers"
                  min={1}
                  max={workerPool.workerLimit}
                  type="number"
                  value={workerPool.maxWorkers}
                  onChange={(event) => updateCurrentBatchMaxWorkers(Number(event.target.value))}
                />
                <button
                  aria-label="Increase current batch workers"
                  disabled={workerPool.maxWorkers >= workerPool.workerLimit}
                  onClick={() => updateCurrentBatchMaxWorkers(workerPool.maxWorkers + 1)}
                >
                  +
                </button>
              </div>
            </label>
            <p>
              {workerPool.saturated
                ? "All worker slots are busy. Increase workers or wait for a job to finish."
                : `Package limit: ${workerPool.workerLimit} worker${workerPool.workerLimit === 1 ? "" : "s"}.`}
            </p>
          </section>
          {items.length === 0 ? (
            <div className="queue-empty">
              <ListVideo size={32} />
              <strong>Queue is empty</strong>
              <span>Prepare videos in New Batch, then start processing.</span>
              <button onClick={() => setActiveView("new-batch")}>Create New Batch</button>
            </div>
          ) : (
            <div className="queue-page-list">
              {items.map((item) => (
                <article className="queue-page-row" key={item.id}>
                  <div className="queue-item-title">
                    <VideoPreview sourcePath={item.path} name={item.name} compact />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{formatBytes(item.size)} · {formatDuration(item.durationSeconds)} · {item.resolution ?? "Unknown resolution"}</small>
                    </span>
                  </div>
                  <div className="queue-item-status">
                    <span className={`queue-status queue-status-${item.status}`}>{queueStatusLabel(item.status)}</span>
                    <progress value={item.progress} max={100} />
                    <small>{item.progress}%</small>
                  </div>
                  <dl className="queue-item-details">
                    <div><dt>Preset</dt><dd>{item.presetName ?? "Waiting to start"}</dd></div>
                    <div><dt>Format</dt><dd>{formatVideoFormat(item.path, item.codec)}</dd></div>
                    <div><dt>Source</dt><dd title={item.path}>{item.path ?? "Source path unavailable"}</dd></div>
                    <div><dt>Output</dt><dd title={item.outputPath}>{item.outputPath ?? "Not created yet"}</dd></div>
                    {item.failure && <div><dt>Issue</dt><dd>{item.failure.message}</dd></div>}
                  </dl>
                  <div className="queue-item-actions">
                    {(item.status === "processing" || item.status === "starting") && (
                      <button aria-label={`Stop processing ${item.name}`} title={`Stop processing ${item.name}`} onClick={() => stopQueueItem(item)}><Square size={15} /> Stop</button>
                    )}
                    {item.status === "failed" && isRetryable(item.failure) && (
                      <button aria-label={`Retry ${item.name}`} title={`Retry ${item.name}`} onClick={() => retryQueueItem(item)}><RotateCcw size={15} /> Retry</button>
                    )}
                    {item.outputPath && (
                      <button aria-label={`Open output folder for ${item.name}`} title={`Open output folder for ${item.name}`} onClick={() => videoReposterBridge.showItemInFolder(item.outputPath!)}><FolderOpen size={15} /> Open Output</button>
                    )}
                    <button aria-label={`Remove ${item.name} from queue`} title={`Remove ${item.name} from queue`} onClick={() => removeQueueItem(item)}><X size={15} /> Remove</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        {renderActiveLogPanel()}
        {queueClearConfirmation === "finished" && (
          <ConfirmationDialog
            title="Remove Finished Queue Entries?"
            confirmLabel="Remove Finished Entries"
            onCancel={() => setQueueClearConfirmation(null)}
            onConfirm={() => {
              clearFinishedItems();
              setQueueClearConfirmation(null);
            }}
          >
            <p>This removes {finishedItemCount} completed or failed {finishedItemCount === 1 ? "entry" : "entries"} from the current queue.</p>
            <p>Source videos, generated output files, and processing History are not deleted.</p>
          </ConfirmationDialog>
        )}
        {queueClearConfirmation === "all" && (
          <ConfirmationDialog
            title="Clear Current Queue?"
            confirmLabel="Clear Queue"
            destructive
            onCancel={() => setQueueClearConfirmation(null)}
            onConfirm={() => {
              clearQueue();
              setQueueClearConfirmation(null);
            }}
          >
            <p>This removes all {items.length} queue {items.length === 1 ? "entry" : "entries"} and stops any active processing jobs.</p>
            <p>Source videos, generated output files, and processing History are not deleted.</p>
          </ConfirmationDialog>
        )}
      </>
    );
  }

  function renderPage() {
    if (activeView === "dashboard") {
      return (
        <>
          <section className="dashboard-start">
            <div>
              <strong>{items.length ? "Continue your video workflow" : "Create your first video batch"}</strong>
              <span>{items.length ? "Prepare another batch or review the current queue." : "Add videos, choose a preset, and start processing."}</span>
            </div>
            <button className="solid" onClick={() => setActiveView("new-batch")}><Plus size={18} /> Create New Batch</button>
            {items.length > 0 && <button onClick={() => setActiveView("queue")}><ListVideo size={18} /> View Queue</button>}
          </section>
          {renderStats()}
          <RecentHistoryPanel history={history} onCreateBatch={() => setActiveView("new-batch")} />
        </>
      );
    }
    if (activeView === "new-batch") return renderNewBatchPage();
    if (activeView === "queue") return renderQueuePage();
    if (activeView === "history") return <HistoryPanel history={history} onClear={clearHistory} onRetry={retryHistoryItem} />;
    if (activeView === "presets") {
      return defaultPreset ? (
        <PresetGallery
          presets={presets}
          presetLimit={packageLimits.template_limit}
          packageName={packageLabel(license)}
          defaultPresetId={defaultPresetId}
          onSetDefault={updateDefaultPreset}
          onSaveCustomPreset={saveCustomPreset}
          onDeleteCustomPreset={deleteCustomPreset}
        />
      ) : null;
    }
    return (
      <SettingsPanel
        defaultOutputDir={preferences.outputDir}
        defaultOutputNaming={preferences.outputNaming}
        defaultMaxWorkers={preferences.maxWorkers}
        autoOpenOutput={preferences.autoOpenOutput}
        workerLimit={packageLimits.worker_limit}
        restoreDefaultPresetName={
          visiblePresets.find((preset) => preset.id === defaultPreferences.defaultPresetId)?.name
          ?? visiblePresets[0]?.name
          ?? defaultPreferences.defaultPresetId
        }
        state={state}
        license={license}
        packageLimits={packageLimits}
        processingAvailability={processingAvailability}
        onChooseDefaultOutputFolder={chooseDefaultOutputFolder}
        onClearDefaultOutputFolder={clearDefaultOutputFolder}
        onDefaultOutputNamingChange={updateDefaultOutputNaming}
        onDefaultMaxWorkersChange={updateDefaultMaxWorkers}
        onAutoOpenOutputChange={updateAutoOpenOutput}
        onRestoreDefaultSettings={restoreDefaultSettings}
        onOpenLog={() => videoReposterBridge.openProcessingLog()}
      />
    );
  }

  const canDrop = !isNewBatchLocked(items, running);

  return (
    <main
      className={`dashboard-shell${isDraggingOver && canDrop ? " drag-active" : ""}`}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        dragCounterRef.current += 1;
        if (dragCounterRef.current === 1) setIsDraggingOver(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = canDrop ? "copy" : "none";
      }}
      onDragLeave={() => {
        dragCounterRef.current -= 1;
        if (dragCounterRef.current === 0) setIsDraggingOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragCounterRef.current = 0;
        setIsDraggingOver(false);
        if (!canDrop) return;
        setActiveView("new-batch");
        importFiles(event.dataTransfer.files, "drop");
      }}
    >
      {isDraggingOver && canDrop && (
        <div className="drag-overlay" aria-hidden="true">
          <div className="drag-overlay-inner">
            <Upload size={40} />
            <p>Drop videos here</p>
          </div>
        </div>
      )}
      <aside className="dashboard-sidebar">
        <div className="app-title"><Film /> {productName}</div>
        {navItems.map((item) => (
          <button className={activeView === item.id ? "nav-active" : ""} key={item.id} onClick={() => setActiveView(item.id)}>
            {item.icon}
            {item.label}
          </button>
        ))}
        <div className="license-summary">
          <ShieldCheck />
          <span>{packageLabel(license)}</span>
          <strong>{licenseStateLabel(state)}</strong>
        </div>
      </aside>
      <section className="dashboard-main">
        <input
          ref={videoPickerRef}
          className="hidden-file-picker"
          type="file"
          accept="video/*,.mp4,.mov,.avi,.mkv,.webm,.flv"
          multiple
          onChange={(event) => {
            importFiles(event.target.files, "files");
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={folderPickerRef}
          className="hidden-file-picker"
          type="file"
          accept="video/*,.mp4,.mov,.avi,.mkv,.webm,.flv"
          multiple
          {...{ webkitdirectory: "", directory: "" }}
          onChange={(event) => {
            importFiles(event.target.files, "folder");
            event.currentTarget.value = "";
          }}
        />
        <header>
          <div>
            <h1>{activeView === "dashboard" ? `Welcome, ${name}!` : pageTitle}</h1>
            <p>{pageSubtitle}</p>
          </div>
        </header>
        {activeView === "new-batch" && importStatus && (
          <div className="import-status" role="status" aria-live="polite">
            <Info size={18} />
            <span>{importStatus}</span>
            {importStatus.includes(" package allows ") && (
              <button onClick={() => setActiveView("settings")}>View Package Details</button>
            )}
          </div>
        )}
        {processingAvailability && !processingAvailability.available && (
          <div className="processing-unavailable" role="alert">
            <Info size={20} />
            <div>
              <strong>Video processing unavailable</strong>
              <span>{processingAvailability.message}</span>
            </div>
            <button onClick={() => videoReposterBridge.openExternal("https://wa.me/94784324261")}>Contact Support</button>
          </div>
        )}
        {renderPage()}
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

function QueueItemRow({
  item,
  onOpen,
  onRemove,
  onRetry,
  onStop
}: {
  item: QueueItem;
  onOpen: () => unknown;
  onRemove: () => void;
  onRetry: () => void;
  onStop: () => void;
}) {
  return (
    <div className="progress-row">
      <VideoPreview sourcePath={item.path} name={item.name} />
      <span>
        {item.name}
        <small>
          {formatBytes(item.size)} · {formatDuration(item.durationSeconds)} · {item.resolution ?? "Unknown resolution"} · {formatVideoFormat(item.path, item.codec)} · {item.status}
          {item.path ? ` · ${item.path}` : ""}
          {item.presetName ? ` · ${item.presetName}` : ""}
          {item.transformSummary ? ` · ${item.transformSummary}` : ""}
          {item.resolution ? ` · ${item.resolution}` : ""}
          {item.durationSeconds ? ` · ${Math.round(item.durationSeconds)}s` : ""}
          {item.outputPath ? ` · ${item.outputPath}` : ""}
          {item.failure ? ` · ${item.failure.message}` : ""}
        </small>
      </span>
      <progress value={item.progress} max={100} />
      {item.outputPath ? (
        <button aria-label={`Open output folder for ${item.name}`} title={`Open output folder for ${item.name}`} onClick={onOpen}>Open Output</button>
      ) : item.status === "processing" || item.status === "starting" ? (
        <button aria-label={`Stop processing ${item.name}`} title={`Stop processing ${item.name}`} onClick={onStop}>Stop</button>
      ) : item.status === "failed" && isRetryable(item.failure) ? (
        <button aria-label={`Retry ${item.name}`} title={`Retry ${item.name}`} onClick={onRetry}>Retry</button>
      ) : (
        <button aria-label={`Remove ${item.name} from batch`} title={`Remove ${item.name} from batch`} onClick={onRemove}>Remove</button>
      )}
    </div>
  );
}

function RecentHistoryPanel({ history, onCreateBatch }: { history: HistoryItem[]; onCreateBatch: () => void }) {
  return (
    <section className="panel history-panel">
      <div className="panel-title">
        <h2>Recent History</h2>
      </div>
      {history.length === 0 ? (
        <EmptyState
          icon={<RotateCw size={28} />}
          title="No finished jobs yet"
          text="Create and process a batch to see completed or failed jobs here."
          actionLabel="Create New Batch"
          onAction={onCreateBatch}
        />
      ) : (
        <div className="history-list">
          {history.slice(0, 5).map((item) => (
            <div className="history-row" key={item.id}>
              <VideoPreview sourcePath={item.sourcePath} name={item.name} compact />
              <span>
                {item.name}
                <small>{formatHistoryDate(item.completedAt)} · {item.status} · {formatDuration(item.durationSeconds)} · {item.resolution ?? "Unknown resolution"} · {formatVideoFormat(item.sourcePath, item.codec)}{item.presetName ? ` · ${item.presetName}` : ""}</small>
              </span>
              <strong>{item.status}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function HistoryPanel({ history, onClear, onRetry }: { history: HistoryItem[]; onClear: () => void; onRetry: (item: HistoryItem) => void }) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const visibleHistory = filterHistoryItems(history, filter);
  return (
    <>
      <section className="panel history-panel">
        <div className="panel-title">
          <h2>Processing History</h2>
          <button onClick={() => setShowClearConfirmation(true)} disabled={!history.length}>Clear History</button>
        </div>
        <div className="history-filters" aria-label="History filters">
          {(["all", "complete", "failed"] as HistoryFilter[]).map((nextFilter) => (
            <button
              className={filter === nextFilter ? "selected" : ""}
              key={nextFilter}
              onClick={() => setFilter(nextFilter)}
            >
              {nextFilter === "all" ? "All" : nextFilter === "complete" ? "Completed" : "Failed"}
              <span>{filterHistoryItems(history, nextFilter).length}</span>
            </button>
          ))}
        </div>
        {visibleHistory.length === 0 ? (
          history.length ? (
            <EmptyState
              icon={<RotateCw size={28} />}
              title={`No ${filter === "complete" ? "completed" : filter === "failed" ? "failed" : ""} jobs`}
              text="Choose another History filter to review available jobs."
            />
          ) : (
            <EmptyState
              icon={<RotateCw size={28} />}
              title="No processing history yet"
              text="Create and process a batch. Completed and failed jobs will appear here."
            />
          )
        ) : (
          <div className="history-list">
            {visibleHistory.slice(0, 20).map((item) => (
              <div className="history-row" key={item.id}>
                <VideoPreview sourcePath={item.sourcePath} name={item.name} compact />
                <span>
                  {item.name}
                  <small>
                    {formatHistoryDate(item.completedAt)} · {item.status}
                    {item.presetName ? ` · ${item.presetName}` : ""}
                    {item.sourcePath ? ` · ${item.sourcePath}` : ""}
                    {item.sourceSize !== undefined ? ` · ${formatBytes(item.sourceSize)}` : ""}
                    {item.transformSummary ? ` · ${item.transformSummary}` : ""}
                    {item.resolution ? ` · ${item.resolution}` : ""}
                    {item.durationSeconds ? ` · ${Math.round(item.durationSeconds)}s` : ""}
                    {item.codec ? ` · ${item.codec.toUpperCase()}` : ""}
                    {item.message && item.status === "failed" ? ` · ${item.message}` : ""}
                  </small>
                </span>
                <div className="history-actions">
                  {canRetryHistoryItem(item) && <button aria-label={`Retry ${item.name} from History`} title={`Retry ${item.name} from History`} onClick={() => onRetry(item)}>Retry</button>}
                  {item.outputPath && <button aria-label={`Open output folder for ${item.name}`} title={`Open output folder for ${item.name}`} onClick={() => videoReposterBridge.showItemInFolder(item.outputPath!)}>Open Output</button>}
                  {!canRetryHistoryItem(item) && !item.outputPath && <strong>{item.status}</strong>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {showClearConfirmation && (
        <ConfirmationDialog
          title="Clear Processing History?"
          confirmLabel="Clear History"
          destructive
          onCancel={() => setShowClearConfirmation(false)}
          onConfirm={() => {
            onClear();
            setShowClearConfirmation(false);
          }}
        >
          <p>This removes all {history.length} saved processing-history {history.length === 1 ? "entry" : "entries"} from {productName}.</p>
          <p>Source videos, generated output files, and current queue entries are not deleted.</p>
        </ConfirmationDialog>
      )}
    </>
  );
}

function ConfirmationDialog({
  title,
  confirmLabel,
  destructive = false,
  onCancel,
  onConfirm,
  children
}: {
  title: string;
  confirmLabel: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <section
        aria-labelledby="confirmation-dialog-title"
        aria-modal="true"
        className="confirmation-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="confirmation-dialog-title">{title}</h3>
        {children}
        <div className="confirmation-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className={destructive ? "danger" : "confirm"} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}

function VideoPreview({ sourcePath, name, compact = false }: { sourcePath?: string; name: string; compact?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setUrl(null);
    if (!sourcePath) return () => { active = false; };
    videoReposterBridge.getVideoPreviewUrl(sourcePath)
      .then((nextUrl) => {
        if (active) setUrl(nextUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => { active = false; };
  }, [sourcePath]);

  if (!url || failed) {
    return (
      <div className={compact ? "video-preview compact unavailable" : "video-preview unavailable"} title="Preview unavailable">
        <Film size={compact ? 17 : 22} />
        {!compact && <small>Preview unavailable</small>}
      </div>
    );
  }

  return (
    <button
      className={compact ? "video-preview compact" : "video-preview"}
      aria-label={`Play or pause preview for ${name}`}
      title="Play or pause preview"
      onClick={() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) void video.play();
        else video.pause();
      }}
    >
      <video ref={videoRef} src={url} muted preload="metadata" onError={() => setFailed(true)} />
      <Play className="video-preview-play" size={compact ? 15 : 20} />
    </button>
  );
}

function PresetGallery({
  presets,
  presetLimit,
  packageName,
  defaultPresetId,
  onSetDefault,
  onSaveCustomPreset,
  onDeleteCustomPreset
}: {
  presets: PlatformPreset[];
  presetLimit: number;
  packageName: string;
  defaultPresetId: string;
  onSetDefault: (id: string) => void;
  onSaveCustomPreset: (preset: PlatformPreset) => void;
  onDeleteCustomPreset: (id: string) => void;
}) {
  const presetAccess = getPresetAccess(presets, presetLimit);
  const includedCount = presetAccess.filter((item) => item.included).length;
  const [editingPreset, setEditingPreset] = useState<PlatformPreset | null>(null);
  return (
    <>
      <section className="panel preset-gallery">
        <div className="panel-title">
          <div>
            <h2>Platform Presets</h2>
            <p>Your default preset is applied when preparing a new batch.</p>
          </div>
          <div className="preset-title-actions">
            <span className="preset-access-summary">{includedCount} of {presets.length} included in {packageName}</span>
            <button onClick={() => setEditingPreset(createCustomPresetDraft(presets[0]))}><Plus size={15} /> Custom Preset</button>
          </div>
        </div>
        <div className="preset-grid">
          {presetAccess.map(({ preset, included }) => {
            const isDefault = preset.id === defaultPresetId;
            return (
              <article className={`preset-card${isDefault ? " selected" : ""}${included ? "" : " restricted"}`} key={preset.id}>
                <div className="preset-card-title">
                  <strong>{preset.name}</strong>
                  <div className="preset-card-badges">
                    {isDefault && <span className="preset-badge">Default</span>}
                    {preset.custom && <span className="preset-badge custom">Custom</span>}
                    <span className={included ? "preset-badge included" : "preset-badge restricted"}>{included ? "Included" : "Not included"}</span>
                  </div>
                </div>
                <dl className="preset-details">
                  <div><dt>Resolution</dt><dd>{preset.settings.width}x{preset.settings.height}</dd></div>
                  <div><dt>Frame rate</dt><dd>{preset.settings.fps} fps</dd></div>
                  <div><dt>Video</dt><dd>{preset.settings.codec} / {preset.settings.videoBitrate}</dd></div>
                  <div><dt>Audio</dt><dd>{preset.settings.audioBitrate}{preset.settings.normalizeAudio ? " / normalized" : ""}</dd></div>
                  <div><dt>Max length</dt><dd>{preset.settings.maxDurationSeconds ? `${preset.settings.maxDurationSeconds} seconds` : "No preset limit"}</dd></div>
                </dl>
                {!included && (
                  <p className="preset-restriction"><Lock size={15} /> Your {packageName} package includes {includedCount} preset{includedCount === 1 ? "" : "s"}.</p>
                )}
                <div className="preset-card-actions">
                  <button onClick={() => onSetDefault(preset.id)} disabled={isDefault || !included}>
                    {isDefault ? <Check size={15} /> : null}
                    {isDefault ? "Current Default" : included ? "Set as Default" : "Not Included in Package"}
                  </button>
                  <button onClick={() => setEditingPreset(preset.custom ? preset : createCustomPresetDraft(preset))}>
                    <Edit2 size={15} /> {preset.custom ? "Edit" : "Clone"}
                  </button>
                  {preset.custom && (
                    <button className="danger" onClick={() => onDeleteCustomPreset(preset.id)} disabled={isDefault}>
                      <Trash2 size={15} /> Delete
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
      {editingPreset && (
        <PresetEditorDialog
          preset={editingPreset}
          onCancel={() => setEditingPreset(null)}
          onSave={(preset) => {
            onSaveCustomPreset(preset);
            setEditingPreset(null);
          }}
        />
      )}
    </>
  );
}

function DeviceConflictHelp({ device, licenseKey, onContact }: { device: DeviceInfo; licenseKey: string; onContact: () => void }) {
  return (
    <section className="device-conflict-panel" aria-label="Device conflict recovery">
      <div>
        <AlertTriangle size={20} />
        <strong>License already active on another device</strong>
      </div>
      <p>Ask support to reset the device binding, then activate again on this computer.</p>
      <dl>
        <div><dt>This device</dt><dd>{device.deviceName}</dd></div>
        <div><dt>Device ID</dt><dd>{device.deviceId.slice(0, 24).toUpperCase()}</dd></div>
        <div><dt>License</dt><dd>{isLicenseKey(licenseKey) ? licenseKey : "Enter the license key before contacting support"}</dd></div>
      </dl>
      <div className="device-conflict-actions">
        <button onClick={() => void copyText(`${device.deviceName} ${device.deviceId}`)}><Copy size={16} /> Copy Device Info</button>
        <button onClick={onContact}><ShoppingCart size={16} /> Contact Support</button>
      </div>
    </section>
  );
}

type PresetDraft = {
  id: string;
  name: string;
  width: string;
  height: string;
  fps: string;
  videoBitrate: string;
  audioBitrate: string;
  codec: VideoCodec;
  maxDurationSeconds: string;
  normalizeAudio: boolean;
  crf: string;
  encoderPreset: string;
};

function PresetEditorDialog({ preset, onCancel, onSave }: { preset: PlatformPreset; onCancel: () => void; onSave: (preset: PlatformPreset) => void }) {
  const [draft, setDraft] = useState<PresetDraft>(() => presetToDraft(preset));
  const settings = draftToPresetSettings(draft);
  const canSave = Boolean(draft.name.trim() && settings);

  function setValue<K extends keyof PresetDraft>(key: K, value: PresetDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <section
        aria-labelledby="preset-editor-title"
        aria-modal="true"
        className="preset-editor-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel-title">
          <div>
            <h3 id="preset-editor-title">Custom Preset</h3>
            <p>Save encoder settings for repeat batches.</p>
          </div>
          <button className="modal-close inline" aria-label="Close custom preset editor" title="Close" onClick={onCancel}><X size={18} /></button>
        </div>
        <div className="preset-editor-grid">
          <label>
            <span>Name</span>
            <input value={draft.name} maxLength={60} onChange={(event) => setValue("name", event.target.value)} />
          </label>
          <label>
            <span>Width</span>
            <input type="number" min={16} max={7680} step={2} value={draft.width} onChange={(event) => setValue("width", event.target.value)} />
          </label>
          <label>
            <span>Height</span>
            <input type="number" min={16} max={7680} step={2} value={draft.height} onChange={(event) => setValue("height", event.target.value)} />
          </label>
          <label>
            <span>FPS</span>
            <input type="number" min={1} max={120} value={draft.fps} onChange={(event) => setValue("fps", event.target.value)} />
          </label>
          <label>
            <span>Video Bitrate</span>
            <input value={draft.videoBitrate} placeholder="4M" onChange={(event) => setValue("videoBitrate", event.target.value)} />
          </label>
          <label>
            <span>Audio Bitrate</span>
            <input value={draft.audioBitrate} placeholder="128k" onChange={(event) => setValue("audioBitrate", event.target.value)} />
          </label>
          <label>
            <span>Codec</span>
            <select value={draft.codec} onChange={(event) => setValue("codec", event.target.value as VideoCodec)}>
              <option value="libx264">H.264 CPU</option>
              <option value="libx265">H.265 CPU</option>
              <option value="h264_nvenc">NVIDIA NVENC</option>
              <option value="h264_amf">AMD AMF</option>
              <option value="h264_qsv">Intel Quick Sync</option>
            </select>
          </label>
          <label>
            <span>Max Seconds</span>
            <input type="number" min={1} max={14400} placeholder="Optional" value={draft.maxDurationSeconds} onChange={(event) => setValue("maxDurationSeconds", event.target.value)} />
          </label>
          <label>
            <span>CRF <small title="0–51; lower = better quality. Leave blank to use bitrate-only mode.">(?)</small></span>
            <input type="number" min={0} max={51} placeholder="Optional (e.g. 23)" value={draft.crf} onChange={(event) => setValue("crf", event.target.value)} />
          </label>
          <label>
            <span>Encoder Speed</span>
            <select value={draft.encoderPreset} onChange={(event) => setValue("encoderPreset", event.target.value)}>
              <option value="">Default</option>
              <option value="ultrafast">Ultrafast</option>
              <option value="superfast">Superfast</option>
              <option value="veryfast">Very Fast</option>
              <option value="faster">Faster</option>
              <option value="fast">Fast</option>
              <option value="medium">Medium</option>
              <option value="slow">Slow</option>
              <option value="slower">Slower</option>
              <option value="veryslow">Very Slow</option>
            </select>
          </label>
          <label className="settings-toggle preset-editor-toggle">
            <input type="checkbox" checked={draft.normalizeAudio} onChange={(event) => setValue("normalizeAudio", event.target.checked)} />
            <span>Normalize audio</span>
          </label>
        </div>
        {!settings && <p className="preset-editor-error"><AlertTriangle size={15} /> Use valid dimensions, FPS, bitrate values like 4M or 128k, and CRF 0–51.</p>}
        <div className="confirmation-actions">
          <button onClick={onCancel}>Cancel</button>
          <button
            className="confirm"
            disabled={!canSave}
            onClick={() => {
              if (!settings) return;
              onSave({ id: draft.id, name: draft.name.trim(), settings, custom: true });
            }}
          >
            <Save size={15} /> Save Preset
          </button>
        </div>
      </section>
    </div>
  );
}

function createCustomPresetDraft(base?: PlatformPreset): PlatformPreset {
  const settings = base?.settings ?? platformPresets.find((preset) => preset.id === "instagram-reel")?.settings ?? {
    width: 1080,
    height: 1920,
    fps: 30,
    videoBitrate: "4M",
    audioBitrate: "128k",
    codec: "libx264"
  };
  const name = base ? `${base.name} Custom` : "Custom Preset";
  return {
    id: `custom-${Date.now().toString(36)}`,
    name,
    settings: { ...settings },
    custom: true
  };
}

function presetToDraft(preset: PlatformPreset): PresetDraft {
  return {
    id: preset.id,
    name: preset.name,
    width: String(preset.settings.width),
    height: String(preset.settings.height),
    fps: String(preset.settings.fps),
    videoBitrate: preset.settings.videoBitrate,
    audioBitrate: preset.settings.audioBitrate,
    codec: preset.settings.codec,
    maxDurationSeconds: preset.settings.maxDurationSeconds ? String(preset.settings.maxDurationSeconds) : "",
    normalizeAudio: Boolean(preset.settings.normalizeAudio),
    crf: preset.settings.crf !== undefined ? String(preset.settings.crf) : "",
    encoderPreset: preset.settings.preset ?? ""
  };
}

function draftToPresetSettings(draft: PresetDraft): OutputSettings | null {
  const width = parsePresetInteger(draft.width, 16, 7680);
  const height = parsePresetInteger(draft.height, 16, 7680);
  const fps = parsePresetInteger(draft.fps, 1, 120);
  const maxDurationSeconds = draft.maxDurationSeconds.trim() ? parsePresetInteger(draft.maxDurationSeconds, 1, 14400) : undefined;
  if (!width || !height || !fps || maxDurationSeconds === null) return null;
  if (!isBitrateValue(draft.videoBitrate) || !isBitrateValue(draft.audioBitrate)) return null;
  const crf = draft.crf.trim() ? parsePresetInteger(draft.crf, 0, 51) : undefined;
  if (crf === null) return null;
  const encoderPreset = draft.encoderPreset.trim() || undefined;
  return {
    width: width % 2 === 0 ? width : width + 1,
    height: height % 2 === 0 ? height : height + 1,
    fps,
    videoBitrate: draft.videoBitrate.trim(),
    audioBitrate: draft.audioBitrate.trim(),
    codec: draft.codec,
    maxDurationSeconds,
    normalizeAudio: draft.normalizeAudio || undefined,
    crf: crf ?? undefined,
    preset: encoderPreset
  };
}

function parsePresetInteger(value: string, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function isBitrateValue(value: string) {
  return /^[1-9]\d*(?:\.\d+)?[kKmM]$/.test(value.trim());
}

function SettingsPanel({
  defaultOutputDir,
  defaultOutputNaming,
  defaultMaxWorkers,
  autoOpenOutput,
  workerLimit,
  restoreDefaultPresetName,
  state,
  license,
  packageLimits,
  processingAvailability,
  onChooseDefaultOutputFolder,
  onClearDefaultOutputFolder,
  onDefaultOutputNamingChange,
  onDefaultMaxWorkersChange,
  onAutoOpenOutputChange,
  onRestoreDefaultSettings,
  onOpenLog
}: {
  defaultOutputDir: string;
  defaultOutputNaming: Required<OutputNamingOptions>;
  defaultMaxWorkers: number;
  autoOpenOutput: boolean;
  workerLimit: number;
  restoreDefaultPresetName: string;
  state: LicenseState;
  license: CachedLicense | null;
  packageLimits: PackageLimits;
  processingAvailability: ProcessingAvailability | null;
  onChooseDefaultOutputFolder: () => void;
  onClearDefaultOutputFolder: () => void;
  onDefaultOutputNamingChange: (value: Partial<OutputNamingOptions>) => void;
  onDefaultMaxWorkersChange: (value: number) => void;
  onAutoOpenOutputChange: (value: boolean) => void;
  onRestoreDefaultSettings: () => void;
  onOpenLog: () => void;
}) {
  const [showRestoreConfirmation, setShowRestoreConfirmation] = useState(false);
  return (
    <>
      <div className="settings-grid">
        <section className="panel settings-card license-package-card">
          <div className="panel-title">
            <div>
              <h2>License & Package</h2>
              <p>Your current access, package limits, and license verification state.</p>
            </div>
            <span className={`license-state license-state-${state.toLowerCase()}`}>{licenseStateLabel(state)}</span>
          </div>
          <div className="license-package-summary">
            <div><span>Package</span><strong>{packageLabel(license)}</strong></div>
            <div><span>Expires</span><strong>{formatLicenseDate(license?.expires_at)}</strong></div>
            <div><span>Device</span><strong>{license?.device_id ? "Bound to this device" : "Not bound"}</strong></div>
            <div><span>Last verified</span><strong>{formatLicenseDateTime(license?.last_verified)}</strong></div>
          </div>
          <div className="package-limit-grid">
            <div><strong>{packageLimits.video_limit}</strong><span>Videos per batch</span></div>
            <div><strong>{packageLimits.template_limit}</strong><span>Available presets</span></div>
            <div><strong>{packageLimits.worker_limit}</strong><span>Concurrent workers</span></div>
          </div>
          <div className={state === "VALID" ? "license-refresh-note" : "license-refresh-note cached"}>
            <Cloud size={18} />
            <span>{licenseRefreshDescription(state)}</span>
          </div>
          <div className={processingAvailability?.hardwareAcceleration?.available ? "gpu-status available" : "gpu-status fallback"}>
            <Settings size={18} />
            <div>
              <strong>{processingAvailability?.hardwareAcceleration?.available ? "GPU acceleration ready" : "CPU fallback active"}</strong>
              <span>{processingAvailability?.hardwareAcceleration?.message ?? "Checking FFmpeg encoder support."}</span>
            </div>
          </div>
        </section>
        <section className="panel settings-card">
        <div className="panel-title">
          <div>
            <h2>Saved Defaults</h2>
            <p>Used when preparing a new batch.</p>
          </div>
          <button onClick={() => setShowRestoreConfirmation(true)}>Restore Default Settings</button>
        </div>
        <div className="settings-default-folder">
          <InfoLine icon={<FolderOpen />} label="Default Output" value={defaultOutputDir || "Same folder as source"} />
          <button title="Choose the output folder used by new batches" onClick={onChooseDefaultOutputFolder}>Choose Default Folder</button>
          <button title="Reset the default output folder to the source folder" onClick={onClearDefaultOutputFolder} disabled={!defaultOutputDir}>Use Source Folder</button>
        </div>
        <label className="settings-control">
          <span>Default Workers</span>
          <input type="number" min={1} max={workerLimit} value={defaultMaxWorkers} onChange={(event) => onDefaultMaxWorkersChange(Number(event.target.value))} />
        </label>
        <label className="settings-control">
          <span>Default Output Name</span>
          <input
            type="text"
            value={defaultOutputNaming.template}
            maxLength={120}
            onChange={(event) => onDefaultOutputNamingChange({ template: event.target.value })}
          />
        </label>
        <label className="settings-control">
          <span>Default Output Format</span>
          <select value={defaultOutputNaming.format} onChange={(event) => onDefaultOutputNamingChange({ format: event.target.value as OutputNamingOptions["format"] })}>
            <option value="mp4">MP4</option>
            <option value="mkv">MKV</option>
            <option value="mov">MOV</option>
          </select>
        </label>
        <label className="settings-toggle">
          <input type="checkbox" checked={autoOpenOutput} onChange={(event) => onAutoOpenOutputChange(event.target.checked)} />
          <span>Open the output folder automatically when a batch finishes</span>
        </label>
        </section>
        <section className="panel settings-card">
        <div className="panel-title">
          <h2>Support Log</h2>
          <button title="Open the full technical processing log" onClick={onOpenLog}>Open Full Log</button>
        </div>
        <p className="settings-note">Open the full technical log when support asks for processing details.</p>
        </section>
      </div>
      {showRestoreConfirmation && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowRestoreConfirmation(false)}>
          <section
            aria-labelledby="restore-defaults-title"
            aria-modal="true"
            className="confirmation-modal"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="restore-defaults-title">Restore Default Settings?</h3>
            <p>The following saved defaults will be restored:</p>
            <ul className="confirmation-list">
              <li><strong>Output folder:</strong> Same folder as source</li>
              <li><strong>Output naming:</strong> {defaultPreferences.outputNaming.template}.{defaultPreferences.outputNaming.format}</li>
              <li><strong>Workers:</strong> {Math.min(defaultPreferences.maxWorkers, workerLimit)}</li>
              <li><strong>Preset:</strong> {restoreDefaultPresetName}</li>
              <li><strong>Adjustments:</strong> Mirror, flip, and mute off; rotation 0 deg; scale and volume 100%; color and sharpness neutral</li>
            </ul>
            <p>Your imported videos, current queue, history, source files, and output files are not removed.</p>
            <div className="confirmation-actions">
              <button onClick={() => setShowRestoreConfirmation(false)}>Cancel</button>
              <button
                className="confirm"
                onClick={() => {
                  onRestoreDefaultSettings();
                  setShowRestoreConfirmation(false);
                }}
              >
                Restore Default Settings
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function packageLabel(license: CachedLicense | null) {
  const plan = license?.plan ?? "pro";
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function qualityLabel(level: QualityLevel) {
  if (level === "preset") return "Preset default";
  if (level === "low") return "Low (smaller file)";
  if (level === "medium") return "Medium";
  return "High (best quality)";
}

async function copyText(value: string) {
  if (!navigator.clipboard?.writeText) return;
  await navigator.clipboard.writeText(value);
}

function formatLicenseDate(value?: string) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function formatLicenseDateTime(value?: string) {
  if (!value) return "Not yet verified";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not yet verified" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
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
        <button
          disabled={running}
          title="Reset only the processing adjustment controls shown below"
          onClick={() => onChange({ ...defaultTransforms })}
        >
          Reset Adjustments
        </button>
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
        <Slider label="Scale" min={100} max={200} value={transforms.scalePercent ?? 100} suffix="%" disabled={running} onChange={(value) => setValue("scalePercent", value)} />
        <Slider label="Crop" min={0} max={40} value={transforms.cropPercent ?? 0} suffix="%" disabled={running} onChange={(value) => setValue("cropPercent", value)} />
        <Slider label="Custom Rotate" min={-180} max={180} value={transforms.customRotateDegrees ?? 0} suffix=" deg" disabled={running} onChange={(value) => setValue("customRotateDegrees", value)} />
        <Slider label="Brightness" min={-50} max={50} value={transforms.brightness ?? 0} disabled={running} onChange={(value) => setValue("brightness", value)} />
        <Slider label="Contrast" min={-50} max={50} value={transforms.contrast ?? 0} disabled={running} onChange={(value) => setValue("contrast", value)} />
        <Slider label="Saturation" min={-50} max={50} value={transforms.saturation ?? 0} disabled={running} onChange={(value) => setValue("saturation", value)} />
        <Slider label="Sharpness" min={0} max={100} value={transforms.sharpness ?? 0} disabled={running} onChange={(value) => setValue("sharpness", value)} />
        <Slider label="Volume" min={0} max={150} value={transforms.volume ?? 100} disabled={running || Boolean(transforms.removeAudio)} onChange={(value) => setValue("volume", value)} />
        <Slider label="Pitch" min={-12} max={12} value={transforms.pitchSemitones ?? 0} suffix=" st" disabled={running || Boolean(transforms.removeAudio)} onChange={(value) => setValue("pitchSemitones", value)} />
        <Slider label="Speed" min={50} max={200} value={transforms.speedPercent ?? 100} suffix="%" disabled={running || Boolean(transforms.removeAudio)} onChange={(value) => setValue("speedPercent", value)} />
        <Slider label="Fade In" min={0} max={10} value={transforms.fadeInSeconds ?? 0} suffix="s" disabled={running || Boolean(transforms.removeAudio)} onChange={(value) => setValue("fadeInSeconds", value)} />
        <Slider label="Fade Out" min={0} max={10} value={transforms.fadeOutSeconds ?? 0} suffix="s" disabled={running || Boolean(transforms.removeAudio)} onChange={(value) => setValue("fadeOutSeconds", value)} />
      </div>
      <div className="advanced-transform-grid">
        <label>
          <span>Text Watermark</span>
          <input
            type="text"
            value={transforms.textWatermark ?? ""}
            disabled={running}
            maxLength={80}
            placeholder="Brand or caption"
            onChange={(event) => setValue("textWatermark", event.target.value)}
          />
        </label>
        <label>
          <span>Logo Path</span>
          <input
            type="text"
            value={transforms.logoWatermarkPath ?? ""}
            disabled={running}
            placeholder="C:\\brand\\logo.png"
            onChange={(event) => setValue("logoWatermarkPath", event.target.value)}
          />
        </label>
        <label>
          <span>Watermark Position</span>
          <select
            value={transforms.watermarkPosition ?? "bottom-right"}
            disabled={running}
            onChange={(event) => setValue("watermarkPosition", event.target.value as TransformSettings["watermarkPosition"])}
          >
            <option value="bottom-right">Bottom right</option>
            <option value="bottom-left">Bottom left</option>
            <option value="top-right">Top right</option>
            <option value="top-left">Top left</option>
            <option value="center">Center</option>
          </select>
        </label>
        <label>
          <span>Replacement Audio</span>
          <input
            type="text"
            value={transforms.replaceAudioPath ?? ""}
            disabled={running || Boolean(transforms.removeAudio)}
            placeholder="C:\\audio\\track.mp3"
            onChange={(event) => setValue("replaceAudioPath", event.target.value)}
          />
        </label>
      </div>
    </section>
  );
}

function Slider({
  label,
  min,
  max,
  value,
  suffix = "",
  disabled,
  onChange
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  suffix?: string;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider-field">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
      <strong>{value}{suffix}</strong>
    </label>
  );
}

type ViewKey = "dashboard" | "new-batch" | "queue" | "history" | "presets" | "settings";

const navItems: Array<{ id: ViewKey; label: string; icon: React.ReactNode }> = [
  { id: "dashboard", label: "Dashboard", icon: <Home /> },
  { id: "new-batch", label: "New Batch", icon: <Plus /> },
  { id: "queue", label: "Queue", icon: <ListVideo /> },
  { id: "history", label: "History", icon: <RotateCw /> },
  { id: "presets", label: "Presets", icon: <Layers /> },
  { id: "settings", label: "Settings", icon: <Settings /> }
];

const viewTitles: Record<ViewKey, string> = {
  dashboard: "Dashboard",
  "new-batch": "New Batch",
  queue: "Queue",
  history: "History",
  presets: "Presets",
  settings: "Settings"
};

const viewSubtitles: Record<ViewKey, string> = {
  dashboard: "Batch process your videos easily and efficiently.",
  "new-batch": "Choose videos and processing settings, then start the batch.",
  queue: "Monitor current work and manage queue actions.",
  history: "Review finished jobs and reopen generated outputs.",
  presets: "Choose platform-ready output settings before starting the batch.",
  settings: "Manage output defaults, license status, and processing logs."
};

function appendLog(setLogs: React.Dispatch<React.SetStateAction<string[]>>, message: string, technicalMessage?: string) {
  void videoReposterBridge.appendProcessingLog(technicalMessage ?? message);
  setLogs((current) => [...current, `${new Date().toLocaleTimeString()} - ${message}`]);
}

function isRetryable(failure?: Pick<ProcessingFailure, "retryable">) {
  return failure?.retryable ?? true;
}

function toQueueFailure(failure: ProcessingFailure) {
  return {
    code: failure.code,
    message: failure.message,
    retryable: failure.retryable,
    recovery: failure.recovery
  };
}

function EmptyQueue() {
  return (
    <div className="empty-queue">
      <FolderOpen />
      <strong>Add videos to begin</strong>
      <span>Use Add Videos or Add Folder above, or drag video files here.</span>
      <small>Supported: MP4, MOV, AVI, MKV, WEBM, FLV</small>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
  actionLabel,
  onAction
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="guided-empty">
      {icon}
      <strong>{title}</strong>
      <span>{text}</span>
      {actionLabel && onAction && <button onClick={onAction}>{actionLabel}</button>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
