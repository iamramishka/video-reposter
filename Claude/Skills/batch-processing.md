# 🎬 Skill: Batch Processing Automation

## Overview
This skill defines the complete automation logic for running, managing, and recovering bulk video processing jobs. It is the operational core used by the Processing Agent.

---

## Processing Pipeline (Per Video)

```
INPUT FILE
  │
  ├── [PROBE]    FFprobe scan → get duration, codec, resolution, fps
  ├── [DECODE]   FFmpeg reads input stream
  ├── [SCALE]    Resize to target resolution (with letterbox/pillarbox)
  ├── [ENCODE]   Re-encode to target codec + bitrate
  ├── [AUDIO]    Re-encode audio (normalize if enabled)
  ├── [MUXING]   Combine video + audio streams
  ├── [WRITE]    Write to temp output path
  └── [VERIFY]   FFprobe check on output → confirm valid
```

---

## FFmpeg Command Templates

### Standard Reformat (scale + encode)
```bash
ffmpeg \
  -i "{input}" \
  -vf "scale={w}:{h}:force_original_aspect_ratio=decrease,\
       pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black" \
  -c:v libx264 \
  -preset fast \
  -crf 23 \
  -b:v {video_bitrate} \
  -c:a aac \
  -b:a {audio_bitrate} \
  -r {fps} \
  -movflags +faststart \
  -y \
  "{output}"
```

### With Audio Normalization
```bash
ffmpeg \
  -i "{input}" \
  -vf "scale={w}:{h}:force_original_aspect_ratio=decrease,\
       pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black" \
  -af "loudnorm=I=-16:LRA=11:TP=-1.5" \
  -c:v libx264 \
  -preset fast \
  -crf 23 \
  -c:a aac \
  -b:a 128k \
  -r {fps} \
  -movflags +faststart \
  -y \
  "{output}"
```

### With Watermark Overlay
```bash
ffmpeg \
  -i "{input}" \
  -i "{watermark_path}" \
  -filter_complex \
    "[0:v]scale={w}:{h}:force_original_aspect_ratio=decrease,\
     pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black[bg];\
     [bg][1:v]overlay={x}:{y}:alpha=0.7[out]" \
  -map "[out]" \
  -map 0:a \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  -r {fps} \
  -movflags +faststart \
  -y \
  "{output}"
```

### Trim to Max Duration
```bash
ffmpeg \
  -i "{input}" \
  -t {max_seconds} \
  -vf "scale={w}:{h}:force_original_aspect_ratio=decrease,\
       pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black" \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  -r {fps} \
  -movflags +faststart \
  -y \
  "{output}"
```

---

## Full Transformation FFmpeg Commands

### Mirror / Flip
```bash
# Horizontal flip (mirror)
ffmpeg -i "{input}" -vf "hflip" -c:a copy -y "{output}"

# Vertical flip
ffmpeg -i "{input}" -vf "vflip" -c:a copy -y "{output}"

# Both (180-degree rotation equivalent)
ffmpeg -i "{input}" -vf "hflip,vflip" -c:a copy -y "{output}"
```

### Brightness / Contrast / Saturation / Sharpness
```bash
# eq filter: brightness (-1.0 to 1.0), contrast (0 to 2), saturation (0 to 3)
ffmpeg -i "{input}" \
  -vf "eq=brightness={b}:contrast={c}:saturation={s}" \
  -c:a copy -y "{output}"

# Sharpness via unsharp mask (luma_msize_x:luma_msize_y:luma_amount)
ffmpeg -i "{input}" \
  -vf "unsharp=5:5:{amount}:5:5:0" \
  -c:a copy -y "{output}"

# Combined: eq + unsharp together
ffmpeg -i "{input}" \
  -vf "eq=brightness={b}:contrast={c}:saturation={s},unsharp=5:5:{sharpness}:5:5:0" \
  -c:a copy -y "{output}"
```

### Rotate Video
```bash
# 90 degrees clockwise
ffmpeg -i "{input}" -vf "transpose=1" -c:a copy -y "{output}"

# 90 degrees counter-clockwise
ffmpeg -i "{input}" -vf "transpose=2" -c:a copy -y "{output}"

# 180 degrees
ffmpeg -i "{input}" -vf "transpose=1,transpose=1" -c:a copy -y "{output}"

# Custom angle (e.g., 45 degrees) — adds black fill
ffmpeg -i "{input}" \
  -vf "rotate={angle}*PI/180:fillcolor=black" \
  -c:a copy -y "{output}"
```

### Crop Video
```bash
# Crop to specific region: w×h starting at (x, y)
ffmpeg -i "{input}" \
  -vf "crop={crop_w}:{crop_h}:{x}:{y}" \
  -c:a copy -y "{output}"

# Crop center (remove {margin}px from each side)
ffmpeg -i "{input}" \
  -vf "crop=iw-{margin*2}:ih-{margin*2}" \
  -c:a copy -y "{output}"
```

### Text Watermark
```bash
# Text watermark: bottom-right, white, semi-transparent
ffmpeg -i "{input}" \
  -vf "drawtext=text='{text}':fontfile='{font_path}':fontsize={size}:\
       fontcolor=white@{opacity}:x=w-tw-{padding}:y=h-th-{padding}" \
  -c:a copy -y "{output}"

# Position helpers:
#   top-left:     x={padding}:y={padding}
#   top-right:    x=w-tw-{padding}:y={padding}
#   bottom-left:  x={padding}:y=h-th-{padding}
#   bottom-right: x=w-tw-{padding}:y=h-th-{padding}
#   center:       x=(w-tw)/2:y=(h-th)/2
```

### Remove Audio
```bash
ffmpeg -i "{input}" -vn -c:v copy -y "{output_video_only}"
# OR strip audio from output:
ffmpeg -i "{input}" -c:v copy -an -y "{output}"
```

### Replace Audio with Custom File
```bash
# Replace audio — loop audio if shorter than video
ffmpeg -i "{input}" -i "{audio_file}" \
  -map 0:v -map 1:a \
  -c:v copy \
  -c:a aac -b:a 128k \
  -shortest \
  -y "{output}"
```

### Volume Adjustment
```bash
# Volume: 1.0 = original, 2.0 = double, 0.5 = half (supports up to 200%)
ffmpeg -i "{input}" \
  -af "volume={volume}" \
  -c:v copy -y "{output}"
```

### Pitch Adjustment
```bash
# Pitch shift without changing speed (semitones)
# pitch_factor = 2^(semitones/12)
ffmpeg -i "{input}" \
  -af "asetrate=44100*{pitch_factor},aresample=44100" \
  -c:v copy -y "{output}"

# Example: +2 semitones = pitch_factor = 2^(2/12) ≈ 1.1225
```

### Speed Adjustment (video + audio)
```bash
# Speed up or slow down — valid range: 0.25x to 4.0x
# Video: setpts=(1/{speed})*PTS
# Audio: atempo supports 0.5–2.0, chain for extreme values
ffmpeg -i "{input}" \
  -filter_complex \
    "[0:v]setpts=(1/{speed})*PTS[v];\
     [0:a]atempo={speed}[a]" \
  -map "[v]" -map "[a]" \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  -y "{output}"

# For speed > 2.0, chain atempo:
# 3.0x: atempo=2.0,atempo=1.5
# 4.0x: atempo=2.0,atempo=2.0
```

### Fade In / Fade Out
```bash
# Fade in first {fade_in}s + fade out last {fade_out}s
# Duration must be known for fade-out start time
ffmpeg -i "{input}" \
  -vf "fade=t=in:st=0:d={fade_in_s},fade=t=out:st={fade_out_start}:d={fade_out_s}" \
  -af "afade=t=in:st=0:d={fade_in_s},afade=t=out:st={fade_out_start}:d={fade_out_s}" \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  -y "{output}"
# fade_out_start = total_duration - fade_out_s
```

### Full Combined Transform (all features together)
```bash
# Example: scale + flip + brightness/contrast + text watermark + fade
ffmpeg -i "{input}" \
  -vf "scale={w}:{h}:force_original_aspect_ratio=decrease,\
       pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black,\
       hflip,\
       eq=brightness={b}:contrast={c}:saturation={s},\
       unsharp=5:5:{sharpness}:5:5:0,\
       drawtext=text='{text}':fontsize={size}:fontcolor=white@{opacity}:x=w-tw-10:y=h-th-10,\
       fade=t=in:st=0:d={fade_in_s},fade=t=out:st={fade_out_start}:d={fade_out_s}" \
  -af "volume={volume},afade=t=in:st=0:d={fade_in_s},afade=t=out:st={fade_out_start}:d={fade_out_s}" \
  -c:v libx264 -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  -r {fps} \
  -movflags +faststart \
  -y "{output}"
```

---

## Hardware Acceleration

### NVIDIA GPU (NVENC)
```bash
# Replace -c:v libx264 with:
-c:v h264_nvenc -preset p4 -rc:v vbr -cq 23 -b:v {bitrate}
# Detect: ffmpeg -encoders | grep nvenc
```

### AMD GPU (AMF)
```bash
-c:v h264_amf -quality speed -b:v {bitrate}
```

### Intel QuickSync
```bash
-c:v h264_qsv -preset fast -b:v {bitrate}
```

### Auto-detect Logic
```javascript
async function detectBestEncoder() {
  const encoders = await probeFFmpegEncoders();
  if (encoders.includes('h264_nvenc')) return 'h264_nvenc';
  if (encoders.includes('h264_amf'))  return 'h264_amf';
  if (encoders.includes('h264_qsv'))  return 'h264_qsv';
  return 'libx264'; // Software fallback
}
```

---

## Worker Management

### Spawning Workers
```javascript
class WorkerPool {
  constructor(maxWorkers = 2) {
    this.workers = [];
    this.maxWorkers = maxWorkers;
    this.queue = [];
  }

  async spawn() {
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new VideoWorker(i + 1);
      this.workers.push(worker);
      worker.start(this.queue);
    }
  }

  pause() { this.workers.forEach(w => w.pause()); }
  resume() { this.workers.forEach(w => w.resume()); }
  stop() { this.workers.forEach(w => w.kill()); }
}
```

### Progress Parsing from FFmpeg stdout
```javascript
// FFmpeg output line example:
// frame= 1234 fps= 30 q=23.0 size= 4096kB time=00:00:41.13 bitrate= 814.8kbits/s speed=1.02x

function parseFFmpegProgress(line, totalDurationSeconds) {
  const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d+)/);
  if (!timeMatch) return null;

  const h = parseInt(timeMatch[1]);
  const m = parseInt(timeMatch[2]);
  const s = parseFloat(timeMatch[3]);
  const currentSeconds = h * 3600 + m * 60 + s;

  const progress = Math.min(
    Math.round((currentSeconds / totalDurationSeconds) * 100),
    99 // Reserve 100% for confirmed done
  );

  return { progress, currentSeconds };
}
```

---

## Retry Logic

```javascript
async function processWithRetry(item, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await processVideo(item);
      return; // Success
    } catch (error) {
      item.retry_count = attempt;
      log.warn(`Retry ${attempt}/${maxRetries} for ${item.filename}: ${error.message}`);

      if (attempt < maxRetries) {
        // Exponential backoff: 5s, 10s, 20s
        await sleep(5000 * Math.pow(2, attempt - 1));
      } else {
        // All retries failed
        item.status = 'failed';
        item.error_message = error.message;
        emit('video:failed', { id: item.id, error_code: mapError(error) });
      }
    }
  }
}
```

---

## Input Validation Checklist

```javascript
async function validateFile(filePath) {
  const checks = [];

  // 1. File exists
  checks.push({ name: 'exists', pass: fs.existsSync(filePath) });

  // 2. File readable
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    checks.push({ name: 'readable', pass: true });
  } catch {
    checks.push({ name: 'readable', pass: false });
  }

  // 3. Supported extension
  const ext = path.extname(filePath).toLowerCase();
  checks.push({
    name: 'format',
    pass: ['.mp4','.mov','.avi','.mkv','.webm','.flv'].includes(ext)
  });

  // 4. FFprobe can parse it
  try {
    const probe = await ffprobe(filePath);
    checks.push({ name: 'parseable', pass: !!probe.format.duration });
  } catch {
    checks.push({ name: 'parseable', pass: false });
  }

  const passed = checks.every(c => c.pass);
  const reason = checks.find(c => !c.pass)?.name;
  return { valid: passed, reason };
}
```

---

## Preset Configuration File

`C:/VideoReposter/Config/presets.json`

```json
[
  {
    "id": "instagram-reel",
    "name": "Instagram Reel",
    "settings": { "width": 1080, "height": 1920, "fps": 30, "video_bitrate": "4M", "audio_bitrate": "128k", "codec": "libx264", "max_duration_s": 90, "normalize_audio": true }
  },
  {
    "id": "youtube-short",
    "name": "YouTube Short",
    "settings": { "width": 1080, "height": 1920, "fps": 60, "video_bitrate": "8M", "audio_bitrate": "192k", "codec": "libx264", "max_duration_s": 60, "normalize_audio": false }
  },
  {
    "id": "tiktok",
    "name": "TikTok",
    "settings": { "width": 1080, "height": 1920, "fps": 30, "video_bitrate": "4M", "audio_bitrate": "128k", "codec": "libx264", "max_duration_s": 180, "normalize_audio": true }
  },
  {
    "id": "twitter-video",
    "name": "Twitter / X",
    "settings": { "width": 1280, "height": 720, "fps": 30, "video_bitrate": "2M", "audio_bitrate": "96k", "codec": "libx264", "max_duration_s": 140, "normalize_audio": false }
  },
  {
    "id": "custom",
    "name": "Custom",
    "settings": null
  }
]
```

---

## Used By

```
Claude/Agents/processing-agent.md
Claude/Worktree/processing-queue.md
Claude/Worktree/monitoring.md
```
