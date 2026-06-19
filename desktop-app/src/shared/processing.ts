export type PlatformPresetId = "instagram-reel" | "youtube-short" | "tiktok" | "twitter-video" | "facebook-reel";

export type VideoCodec = "libx264" | "libx265" | "h264_nvenc" | "h264_amf" | "h264_qsv";
export type OutputFormat = "mp4" | "mkv" | "mov";

export type OutputNamingOptions = {
  template?: string;
  format?: OutputFormat;
};

export type OutputSettings = {
  width: number;
  height: number;
  fps: number;
  videoBitrate: string;
  audioBitrate: string;
  codec: VideoCodec;
  maxDurationSeconds?: number;
  normalizeAudio?: boolean;
  crf?: number;
  preset?: string;
};

export type TransformSettings = {
  mirrorHorizontal?: boolean;
  mirrorVertical?: boolean;
  scalePercent?: number;
  cropPercent?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  sharpness?: number;
  rotateDegrees?: 90 | 180 | 270;
  customRotateDegrees?: number;
  textWatermark?: string;
  logoWatermarkPath?: string;
  watermarkPosition?: WatermarkPosition;
  removeAudio?: boolean;
  replaceAudioPath?: string;
  volume?: number;
  pitchSemitones?: number;
  speedPercent?: number;
  fadeInSeconds?: number;
  fadeOutSeconds?: number;
};

export type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";

export type FfmpegJob = {
  inputPath: string;
  outputPath: string;
  output: OutputSettings;
  transforms?: TransformSettings;
};

export type PlatformPreset = {
  id: PlatformPresetId;
  name: string;
  settings: OutputSettings;
};

export type ImportedVideoFile = {
  path: string;
  name: string;
  size: number;
  lastModified: number;
};

export const supportedVideoExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv"] as const;
export const supportedOutputFormats: OutputFormat[] = ["mp4", "mkv", "mov"];
export const defaultOutputNamingTemplate = "{name}_{preset}_processed";

export const platformPresets: PlatformPreset[] = [
  {
    id: "instagram-reel",
    name: "Instagram Reel",
    settings: { width: 1080, height: 1920, fps: 30, videoBitrate: "4M", audioBitrate: "128k", codec: "libx264", maxDurationSeconds: 90, normalizeAudio: true }
  },
  {
    id: "youtube-short",
    name: "YouTube Short",
    settings: { width: 1080, height: 1920, fps: 60, videoBitrate: "8M", audioBitrate: "192k", codec: "libx264", maxDurationSeconds: 60 }
  },
  {
    id: "tiktok",
    name: "TikTok",
    settings: { width: 1080, height: 1920, fps: 30, videoBitrate: "4M", audioBitrate: "128k", codec: "libx264", maxDurationSeconds: 180, normalizeAudio: true }
  },
  {
    id: "twitter-video",
    name: "Twitter / X",
    settings: { width: 1280, height: 720, fps: 30, videoBitrate: "2M", audioBitrate: "96k", codec: "libx264", maxDurationSeconds: 140 }
  },
  {
    id: "facebook-reel",
    name: "Facebook Reel",
    settings: { width: 1080, height: 1920, fps: 30, videoBitrate: "5M", audioBitrate: "128k", codec: "libx265", maxDurationSeconds: 90 }
  }
];

export type QualityLevel = "preset" | "low" | "medium" | "high";

export type OutputOverrides = {
  quality?: QualityLevel;
  width?: number;
  height?: number;
};

export const qualityLevels: QualityLevel[] = ["preset", "low", "medium", "high"];

const qualityProfiles: Record<Exclude<QualityLevel, "preset">, { crf: number; preset: string }> = {
  low: { crf: 30, preset: "veryfast" },
  medium: { crf: 23, preset: "fast" },
  high: { crf: 18, preset: "slow" }
};

// FFmpeg with yuv420p requires even pixel dimensions; clamp to a sane 16..7680 range.
export function normalizeDimension(value?: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  if (rounded < 16 || rounded > 7680) return undefined;
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export function applyOutputOverrides(settings: OutputSettings, overrides?: OutputOverrides): OutputSettings {
  if (!overrides) return settings;
  let next: OutputSettings = { ...settings };

  if (overrides.quality && overrides.quality !== "preset") {
    const profile = qualityProfiles[overrides.quality];
    next = { ...next, crf: profile.crf, preset: profile.preset };
  }

  const width = normalizeDimension(overrides.width);
  const height = normalizeDimension(overrides.height);
  if (width && height) next = { ...next, width, height };

  return next;
}

export function buildFfmpegArgs(job: FfmpegJob) {
  const output = normalizeOutputSettings(job.output);
  const transforms = job.transforms ?? {};
  const args = ["-i", job.inputPath];
  const replacementAudioPath = transforms.removeAudio ? undefined : normalizeOptionalPath(transforms.replaceAudioPath);
  if (replacementAudioPath) args.push("-i", replacementAudioPath);

  const logoWatermarkPath = normalizeOptionalPath(transforms.logoWatermarkPath);
  const logoInputIndex = logoWatermarkPath ? (replacementAudioPath ? 2 : 1) : undefined;
  if (logoWatermarkPath) args.push("-i", logoWatermarkPath);

  if (output.maxDurationSeconds) args.push("-t", String(output.maxDurationSeconds));

  const videoFilters = buildVideoFilters(output, transforms);
  if (logoInputIndex) {
    args.push("-filter_complex", buildLogoWatermarkGraph(videoFilters, logoInputIndex, transforms.watermarkPosition), "-map", "[vout]");
  } else {
    if (videoFilters.length) args.push("-vf", videoFilters.join(","));
    if (replacementAudioPath) args.push("-map", "0:v:0");
  }

  const audioFilters = buildAudioFilters(output, transforms);
  if (transforms.removeAudio) {
    args.push("-an");
  } else {
    if (replacementAudioPath) {
      args.push("-map", "1:a:0", "-shortest");
    } else if (logoInputIndex) {
      args.push("-map", "0:a:0?");
    }
    if (audioFilters.length) args.push("-af", audioFilters.join(","));
    args.push("-c:a", "aac", "-b:a", output.audioBitrate);
  }

  args.push(
    "-c:v",
    output.codec,
    ...encoderPresetArgs(output),
    "-b:v",
    output.videoBitrate,
    "-r",
    String(output.fps),
    "-movflags",
    "+faststart",
    "-y",
    job.outputPath
  );

  return args;
}

export function buildFfmpegCommand(job: FfmpegJob, ffmpegPath = "ffmpeg") {
  return [ffmpegPath, ...buildFfmpegArgs(job).map(quoteShellArg)].join(" ");
}

export function isSupportedVideoPath(filePath: string) {
  const lower = filePath.toLowerCase();
  return supportedVideoExtensions.some((extension) => lower.endsWith(extension));
}

export function normalizeOutputNamingOptions(options?: OutputNamingOptions): Required<OutputNamingOptions> {
  return {
    template: normalizeOutputTemplate(options?.template),
    format: supportedOutputFormats.includes(options?.format as OutputFormat) ? (options!.format as OutputFormat) : "mp4"
  };
}

export function renderOutputFileName(inputPath: string, presetId: string, options?: OutputNamingOptions) {
  const naming = normalizeOutputNamingOptions(options);
  const baseName = fileNameWithoutExtension(inputPath);
  const rendered = naming.template
    .replaceAll("{name}", baseName)
    .replaceAll("{preset}", presetId)
    .replaceAll("{date}", formatDateToken(new Date()));
  return `${sanitizeFileName(rendered) || sanitizeFileName(baseName) || "video"}.${naming.format}`;
}

export function parseFfmpegProgress(line: string, totalDurationSeconds: number) {
  if (totalDurationSeconds <= 0) return null;
  const match = line.match(/time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const currentSeconds = hours * 3600 + minutes * 60 + seconds;

  return {
    currentSeconds,
    progress: Math.min(99, Math.max(0, Math.round((currentSeconds / totalDurationSeconds) * 100)))
  };
}

function normalizeOutputSettings(output: OutputSettings): Required<Pick<OutputSettings, "crf" | "preset">> & OutputSettings {
  return {
    ...output,
    crf: output.crf ?? 23,
    preset: output.preset ?? "fast"
  };
}

function normalizeOutputTemplate(value?: string) {
  const trimmed = value?.trim();
  return trimmed || defaultOutputNamingTemplate;
}

function fileNameWithoutExtension(filePath: string) {
  const normalized = filePath.replaceAll("\\", "/");
  const fileName = normalized.split("/").pop() ?? filePath;
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 180);
}

function formatDateToken(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function buildVideoFilters(output: OutputSettings, transforms: TransformSettings) {
  const scalePercent = typeof transforms.scalePercent === "number" ? transforms.scalePercent : 100;
  const filters =
    scalePercent > 100
      ? [
          `scale=${output.width}:${output.height}:force_original_aspect_ratio=decrease`,
          `pad=${output.width}:${output.height}:(ow-iw)/2:(oh-ih)/2:black`,
          `scale=iw*${toFixed(scalePercent / 100)}:ih*${toFixed(scalePercent / 100)}`,
          `crop=${output.width}:${output.height}:(iw-ow)/2:(ih-oh)/2`
        ]
      : [
          `scale=${output.width}:${output.height}:force_original_aspect_ratio=decrease`,
          `pad=${output.width}:${output.height}:(ow-iw)/2:(oh-ih)/2:black`
        ];

  if (transforms.mirrorHorizontal) filters.push("hflip");
  if (transforms.mirrorVertical) filters.push("vflip");
  if (transforms.rotateDegrees) filters.push(...rotateFilters(transforms.rotateDegrees));
  if (transforms.customRotateDegrees) filters.push(`rotate=${toFixed(transforms.customRotateDegrees)}*PI/180:fillcolor=black`);
  if (transforms.cropPercent && transforms.cropPercent > 0) {
    const cropScale = toFixed(1 - transforms.cropPercent / 100);
    filters.push(`crop=iw*${cropScale}:ih*${cropScale}:(iw-ow)/2:(ih-oh)/2`, `scale=${output.width}:${output.height}`);
  }

  const eq = buildEqFilter(transforms);
  if (eq) filters.push(eq);
  if (transforms.sharpness && transforms.sharpness > 0) filters.push(`unsharp=5:5:${toFixed(transforms.sharpness / 20)}:5:5:0`);
  if (transforms.textWatermark?.trim()) {
    const position = watermarkCoordinates(transforms.watermarkPosition);
    filters.push(`drawtext=text='${escapeFilterText(transforms.textWatermark.trim())}':${position}:fontcolor=white:fontsize=36:box=1:boxcolor=black@0.45:boxborderw=12`);
  }

  return filters;
}

function buildAudioFilters(output: OutputSettings, transforms: TransformSettings) {
  const filters = [];
  if (output.normalizeAudio) filters.push("loudnorm=I=-16:LRA=11:TP=-1.5");
  if (typeof transforms.volume === "number" && transforms.volume !== 100) filters.push(`volume=${toFixed(transforms.volume / 100)}`);
  if (typeof transforms.pitchSemitones === "number" && transforms.pitchSemitones !== 0) {
    const pitchFactor = Math.pow(2, transforms.pitchSemitones / 12);
    filters.push(`asetrate=44100*${toFixed(pitchFactor)}`, "aresample=44100", `atempo=${toFixed(1 / pitchFactor)}`);
  }
  if (typeof transforms.speedPercent === "number" && transforms.speedPercent !== 100) filters.push(...atempoFilters(transforms.speedPercent / 100));
  if (transforms.fadeInSeconds && transforms.fadeInSeconds > 0) filters.push(`afade=t=in:st=0:d=${transforms.fadeInSeconds}`);
  if (transforms.fadeOutSeconds && transforms.fadeOutSeconds > 0 && output.maxDurationSeconds) {
    filters.push(`afade=t=out:st=${Math.max(0, output.maxDurationSeconds - transforms.fadeOutSeconds)}:d=${transforms.fadeOutSeconds}`);
  }
  return filters;
}

function buildEqFilter(transforms: TransformSettings) {
  const parts = [];
  if (typeof transforms.brightness === "number" && transforms.brightness !== 0) {
    parts.push(`brightness=${toFixed(transforms.brightness / 100)}`);
  }
  if (typeof transforms.contrast === "number" && transforms.contrast !== 0) {
    parts.push(`contrast=${toFixed(1 + transforms.contrast / 100)}`);
  }
  if (typeof transforms.saturation === "number" && transforms.saturation !== 0) {
    parts.push(`saturation=${toFixed(1 + transforms.saturation / 100)}`);
  }
  return parts.length ? `eq=${parts.join(":")}` : null;
}

function rotateFilters(degrees: 90 | 180 | 270) {
  if (degrees === 90) return ["transpose=1"];
  if (degrees === 270) return ["transpose=2"];
  return ["transpose=1", "transpose=1"];
}

function buildLogoWatermarkGraph(videoFilters: string[], logoInputIndex: number, position: WatermarkPosition = "bottom-right") {
  const baseFilters = videoFilters.length ? videoFilters.join(",") : "null";
  return `[0:v]${baseFilters}[base];[${logoInputIndex}:v]scale=180:-1[logo];[base][logo]overlay=${watermarkCoordinates(position)}[vout]`;
}

function watermarkCoordinates(position: WatermarkPosition = "bottom-right") {
  if (position === "top-left") return "x=24:y=24";
  if (position === "top-right") return "x=W-w-24:y=24";
  if (position === "bottom-left") return "x=24:y=H-h-24";
  if (position === "center") return "x=(W-w)/2:y=(H-h)/2";
  return "x=W-w-24:y=H-h-24";
}

function atempoFilters(speed: number) {
  let remaining = Math.min(4, Math.max(0.25, speed));
  const filters: string[] = [];
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  filters.push(`atempo=${toFixed(remaining)}`);
  return filters;
}

function normalizeOptionalPath(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function escapeFilterText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll(":", "\\:").replaceAll(",", "\\,");
}

function encoderPresetArgs(output: Required<Pick<OutputSettings, "crf" | "preset">> & OutputSettings) {
  if (output.codec === "libx264" || output.codec === "libx265") return ["-preset", output.preset, "-crf", String(output.crf)];
  if (output.codec === "h264_nvenc") return ["-preset", "p4", "-rc:v", "vbr", "-cq", String(output.crf)];
  if (output.codec === "h264_amf") return ["-quality", "speed"];
  return ["-preset", output.preset];
}

function quoteShellArg(value: string) {
  if (/^[A-Za-z0-9_./:=+\-]+$/.test(value)) return value;
  return `"${value.replaceAll("\"", "\\\"")}"`;
}

function toFixed(value: number) {
  return Number(value.toFixed(3)).toString();
}
