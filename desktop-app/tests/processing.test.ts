import { describe, expect, it } from "vitest";
import {
  buildFfmpegArgs,
  buildFfmpegCommand,
  isSupportedVideoPath,
  parseFfmpegProgress,
  platformPresets
} from "../src/shared/processing";

describe("processing command builder", () => {
  it("builds a standard platform preset command", () => {
    const preset = platformPresets.find((item) => item.id === "instagram-reel");
    expect(preset).toBeDefined();

    const args = buildFfmpegArgs({
      inputPath: "C:/input/raw clip.mp4",
      outputPath: "C:/output/raw_clip_instagram.mp4",
      output: preset!.settings
    });

    expect(args).toContain("-i");
    expect(args).toContain("C:/input/raw clip.mp4");
    expect(args).toContain("-t");
    expect(args).toContain("90");
    expect(args).toContain("-vf");
    expect(args).toContain("scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black");
    expect(args).toContain("-af");
    expect(args).toContain("loudnorm=I=-16:LRA=11:TP=-1.5");
    expect(args).toContain("libx264");
    expect(args).toContain("+faststart");
  });

  it("combines video and audio transform filters", () => {
    const args = buildFfmpegArgs({
      inputPath: "in.mov",
      outputPath: "out.mp4",
      output: { width: 1280, height: 720, fps: 30, videoBitrate: "2M", audioBitrate: "128k", codec: "libx264" },
      transforms: {
        mirrorHorizontal: true,
        brightness: 20,
        contrast: -10,
        saturation: 25,
        sharpness: 40,
        rotateDegrees: 180,
        volume: 80
      }
    });

    expect(args[args.indexOf("-vf") + 1]).toBe(
      "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,hflip,transpose=1,transpose=1,eq=brightness=0.2:contrast=0.9:saturation=1.25,unsharp=5:5:2:5:5:0"
    );
    expect(args[args.indexOf("-af") + 1]).toBe("volume=0.8");
  });

  it("scales video inside the fixed output frame", () => {
    const args = buildFfmpegArgs({
      inputPath: "in.mov",
      outputPath: "out.mp4",
      output: { width: 1280, height: 720, fps: 30, videoBitrate: "2M", audioBitrate: "128k", codec: "libx264" },
      transforms: { scalePercent: 150 }
    });

    expect(args[args.indexOf("-vf") + 1]).toBe(
      "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,scale=iw*1.5:ih*1.5,crop=1280:720:(iw-ow)/2:(ih-oh)/2"
    );
  });

  it("strips audio when requested", () => {
    const args = buildFfmpegArgs({
      inputPath: "in.webm",
      outputPath: "out.mp4",
      output: { width: 1920, height: 1080, fps: 30, videoBitrate: "6M", audioBitrate: "128k", codec: "h264_nvenc" },
      transforms: { removeAudio: true }
    });

    expect(args).toContain("-an");
    expect(args).not.toContain("-c:a");
    expect(args).toContain("h264_nvenc");
    expect(args).toContain("-cq");
  });

  it("quotes paths when rendering a shell command", () => {
    const command = buildFfmpegCommand({
      inputPath: "C:/clips/raw clip.mp4",
      outputPath: "C:/processed/raw clip.mp4",
      output: { width: 1280, height: 720, fps: 30, videoBitrate: "2M", audioBitrate: "128k", codec: "libx264" }
    });

    expect(command).toContain("\"C:/clips/raw clip.mp4\"");
    expect(command).toContain("\"C:/processed/raw clip.mp4\"");
  });
});

describe("processing helpers", () => {
  it("detects supported video paths case-insensitively", () => {
    expect(isSupportedVideoPath("clip.MP4")).toBe(true);
    expect(isSupportedVideoPath("clip.txt")).toBe(false);
  });

  it("parses ffmpeg progress lines", () => {
    expect(parseFfmpegProgress("frame= 123 fps=30 time=00:00:30.00 bitrate=800kbits/s", 120)).toEqual({
      currentSeconds: 30,
      progress: 25
    });
    expect(parseFfmpegProgress("no timing here", 120)).toBeNull();
    expect(parseFfmpegProgress("time=00:10:00.00", 100)).toEqual({ currentSeconds: 600, progress: 99 });
  });
});
