export type PlatformPresetId = "instagram-reel" | "youtube-short" | "tiktok" | "twitter-video" | "facebook-reel";

export type VideoCodec = "libx264" | "libx265" | "h264_nvenc" | "h264_amf" | "h264_qsv";

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
  brightness?: number;
  contrast?: number;
  saturation?: number;
  sharpness?: number;
  rotateDegrees?: 90 | 180 | 270;
  removeAudio?: boolean;
  volume?: number;
};

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

export function buildFfmpegArgs(job: FfmpegJob) {
  const output = normalizeOutputSettings(job.output);
  const transforms = job.transforms ?? {};
  const args = ["-i", job.inputPath];

  if (output.maxDurationSeconds) args.push("-t", String(output.maxDurationSeconds));

  const videoFilters = buildVideoFilters(output, transforms);
  if (videoFilters.length) args.push("-vf", videoFilters.join(","));

  const audioFilters = buildAudioFilters(output, transforms);
  if (transforms.removeAudio) {
    args.push("-an");
  } else {
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

function buildVideoFilters(output: OutputSettings, transforms: TransformSettings) {
  const filters = [
    `scale=${output.width}:${output.height}:force_original_aspect_ratio=decrease`,
    `pad=${output.width}:${output.height}:(ow-iw)/2:(oh-ih)/2:black`
  ];

  if (transforms.mirrorHorizontal) filters.push("hflip");
  if (transforms.mirrorVertical) filters.push("vflip");
  if (transforms.rotateDegrees) filters.push(...rotateFilters(transforms.rotateDegrees));

  const eq = buildEqFilter(transforms);
  if (eq) filters.push(eq);
  if (transforms.sharpness && transforms.sharpness > 0) filters.push(`unsharp=5:5:${toFixed(transforms.sharpness / 20)}:5:5:0`);

  return filters;
}

function buildAudioFilters(output: OutputSettings, transforms: TransformSettings) {
  const filters = [];
  if (output.normalizeAudio) filters.push("loudnorm=I=-16:LRA=11:TP=-1.5");
  if (typeof transforms.volume === "number" && transforms.volume !== 100) filters.push(`volume=${toFixed(transforms.volume / 100)}`);
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
