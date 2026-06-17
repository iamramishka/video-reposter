import { describe, expect, it } from "vitest";
import {
  buildFfmpegArgs,
  buildFfmpegCommand,
  isSupportedVideoPath,
  parseFfmpegProgress,
  platformPresets,
  renderOutputFileName
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

  it("keeps the Instagram golden FFmpeg arguments stable", () => {
    const preset = platformPresets.find((item) => item.id === "instagram-reel");
    expect(preset).toBeDefined();

    expect(buildFfmpegArgs({
      inputPath: "in.mp4",
      outputPath: "out.mp4",
      output: preset!.settings,
      transforms: {
        mirrorHorizontal: true,
        brightness: 10,
        saturation: -20,
        volume: 125
      }
    })).toEqual([
      "-i",
      "in.mp4",
      "-t",
      "90",
      "-vf",
      "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,hflip,eq=brightness=0.1:saturation=0.8",
      "-af",
      "loudnorm=I=-16:LRA=11:TP=-1.5,volume=1.25",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-b:v",
      "4M",
      "-r",
      "30",
      "-movflags",
      "+faststart",
      "-y",
      "out.mp4"
    ]);
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

  it("builds advanced transform filters", () => {
    const args = buildFfmpegArgs({
      inputPath: "in.mov",
      outputPath: "out.mp4",
      output: { width: 1280, height: 720, fps: 30, videoBitrate: "2M", audioBitrate: "128k", codec: "libx264", maxDurationSeconds: 60 },
      transforms: {
        cropPercent: 12,
        customRotateDegrees: -7,
        textWatermark: "My Brand",
        watermarkPosition: "top-left",
        pitchSemitones: 3,
        speedPercent: 125,
        fadeInSeconds: 2,
        fadeOutSeconds: 4
      }
    });

    expect(args[args.indexOf("-vf") + 1]).toContain("crop=iw*0.88:ih*0.88:(iw-ow)/2:(ih-oh)/2");
    expect(args[args.indexOf("-vf") + 1]).toContain("rotate=-7*PI/180:fillcolor=black");
    expect(args[args.indexOf("-vf") + 1]).toContain("drawtext=text='My Brand':x=24:y=24");
    expect(args[args.indexOf("-af") + 1]).toBe("asetrate=44100*1.189,aresample=44100,atempo=0.841,atempo=1.25,afade=t=in:st=0:d=2,afade=t=out:st=56:d=4");
  });

  it("maps replacement audio and logo watermarks", () => {
    const args = buildFfmpegArgs({
      inputPath: "in.mov",
      outputPath: "out.mp4",
      output: { width: 1280, height: 720, fps: 30, videoBitrate: "2M", audioBitrate: "128k", codec: "libx264" },
      transforms: {
        logoWatermarkPath: "C:/brand/logo.png",
        replaceAudioPath: "C:/audio/track.mp3",
        watermarkPosition: "center"
      }
    });

    expect(args).toContain("C:/audio/track.mp3");
    expect(args).toContain("C:/brand/logo.png");
    expect(args[args.indexOf("-filter_complex") + 1]).toBe(
      "[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black[base];[2:v]scale=180:-1[logo];[base][logo]overlay=x=(W-w)/2:y=(H-h)/2[vout]"
    );
    expect(args).toEqual(expect.arrayContaining(["-map", "[vout]", "-map", "1:a:0", "-shortest"]));
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

  it("renders safe output filenames from naming templates", () => {
    expect(renderOutputFileName("C:/clips/raw clip.mp4", "instagram-reel")).toBe("raw clip_instagram-reel_processed.mp4");
    expect(renderOutputFileName("C:/clips/raw:clip.mp4", "youtube-short", { template: "{preset}_{name}_{date}", format: "mkv" })).toMatch(
      /^youtube-short_raw_clip_\d{8}\.mkv$/
    );
    expect(renderOutputFileName("C:/clips/raw.mp4", "youtube-short", { template: "   ", format: "mov" })).toBe("raw_youtube-short_processed.mov");
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
