# ⚙️ Processing Agent

## Overview
The Processing Agent manages the entire video batch processing lifecycle — from queue intake through transformation, monitoring, error recovery, and final output delivery. It acts as the engine controller for all video operations in the desktop app.

---

## Responsibilities

| Task | Trigger | Output |
|------|---------|--------|
| Accept video files into queue | User drag-drop / import | Queue updated, count shown |
| Validate input files | On queue add | Accept / Reject with reason |
| Apply selected preset | User preset selection | Preset config loaded |
| Mirror / flip video | Transformation setting | FFmpeg hflip/vflip filter |
| Brightness / contrast / saturation | Slider adjustment | FFmpeg eq filter |
| Sharpness | Slider adjustment | FFmpeg unsharp filter |
| Resize video | Output setting | FFmpeg scale filter |
| Crop video | Crop region setting | FFmpeg crop filter |
| Rotate video | Rotation setting | FFmpeg rotate/transpose filter |
| Logo watermark | PNG + position + opacity | FFmpeg overlay filter |
| Text watermark | Text + font + position | FFmpeg drawtext filter |
| Remove / replace audio | Audio setting | FFmpeg -an / audio map |
| Volume / pitch adjustment | Audio slider | FFmpeg volume / asetrate filter |
| Speed adjustment | Speed slider (0.25×–4×) | FFmpeg setpts + atempo filter |
| Fade in / fade out | Duration input | FFmpeg fade filter |
| Start processing batch | User clicks Start | Workers spawned |
| Monitor per-video progress | Continuous | Progress bar % per file |
| Pause / Resume processing | User action | Workers suspended / resumed |
| Stop processing | User action | Workers killed, partial files cleaned |
| Detect and handle errors | On worker failure | Auto-retry (3x), then mark failed |
| Log all processing events | Continuous | Log file written |
| Notify on completion | Batch complete | In-app + system notification |
| Move output files | On success | Files saved to output folder |

---

## Agent Workflow

```
START
  │
  ▼
[1] RECEIVE video file list from user
  │   (drag-drop, file picker, folder watch)
  │
  ▼
[2] VALIDATE each file
  │   Check: format supported, file not corrupt, not duplicate
  │   Supported: .mp4, .mov, .avi, .mkv, .webm, .flv
  │
  ├─ Invalid? ──► Mark as "Skipped" with reason, continue with rest
  │
  ▼
[3] LOAD selected preset configuration
  │   { resolution, bitrate, codec, fps, watermark, platform_target }
  │
  ▼
[4] BUILD processing queue
  │   Assign priority, order, and worker slots
  │   Default: 2 parallel workers (configurable)
  │
  ▼
[5] SPAWN worker threads
  │   Each worker picks next queued video
  │
  ▼
[6] PROCESS video (per worker)
  │   ├─ Decode input
  │   ├─ Apply transformations (resize, encode, watermark, trim)
  │   ├─ Write to temp output path
  │   └─ Report progress % every 500ms
  │
  ├─ Worker crash? ──► Auto-retry (up to 3x)
  │                    After 3 failures → mark as FAILED, log error
  │
  ▼
[7] MOVE temp output to final output folder
  │   Output path: /Output/{date}/{filename}_processed.mp4
  │
  ▼
[8] UPDATE queue: mark video as DONE
  │
  ▼
[9] REPEAT steps 5–8 until queue is empty
  │
  ▼
[10] EMIT event: batch:complete
  │    Trigger: system notification, analytics update
  │
  ▼
[11] WRITE processing log + summary
END
```

---

## Queue Item Schema

```json
{
  "id": "uuid-v4",
  "filename": "video_001.mp4",
  "input_path": "C:/Users/user/Videos/video_001.mp4",
  "output_path": "C:/VideoReposter/Output/2026-05-31/video_001_processed.mp4",
  "status": "queued | processing | paused | done | failed | skipped",
  "progress": 0,
  "preset": "instagram-reel",
  "worker_id": 1,
  "retry_count": 0,
  "error_message": null,
  "started_at": null,
  "completed_at": null,
  "duration_seconds": null,
  "file_size_mb": 45.2
}
```

---

## Processing Presets

| Preset | Resolution | FPS | Codec | Target Platform |
|--------|-----------|-----|-------|-----------------|
| `instagram-reel` | 1080×1920 | 30 | H.264 | Instagram |
| `youtube-short` | 1080×1920 | 60 | H.264 | YouTube Shorts |
| `tiktok` | 1080×1920 | 30 | H.264 | TikTok |
| `twitter-video` | 1280×720 | 30 | H.264 | Twitter/X |
| `facebook-reel` | 1080×1920 | 30 | H.265 | Facebook |
| `custom` | User-defined | User-defined | User-defined | Any |

---

## Worker Configuration

```
Default Workers:    2 parallel
Maximum Workers:    8 (hardware dependent)
Auto-scale:         Enabled (based on CPU usage < 80%)
Priority Modes:     FIFO (default), Size ASC, Size DESC, Manual
Temp Directory:     C:/VideoReposter/Temp/
Output Directory:   C:/VideoReposter/Output/{YYYY-MM-DD}/
Log Directory:      C:/VideoReposter/Logs/processing/
```

---

## Error Handling

| Error Code | Meaning | Agent Action |
|------------|---------|-------------|
| `PROC_001` | Unsupported format | Skip file, log reason |
| `PROC_002` | Corrupt/unreadable file | Skip file, alert user |
| `PROC_003` | Worker crash / timeout | Auto-retry up to 3x |
| `PROC_004` | Disk space insufficient | Pause all, alert user |
| `PROC_005` | Output path not writable | Alert user, ask for new path |
| `PROC_006` | Codec not available | Fall back to H.264, notify user |

---

## Events Emitted

| Event | When | Listeners |
|-------|------|-----------|
| `queue:updated` | File added/removed | Dashboard UI |
| `worker:progress` | Every 500ms per video | Progress bar |
| `worker:error` | On failure | Error log, retry logic |
| `batch:complete` | All videos done | Analytics Agent, Notification |
| `video:done` | Single video done | Dashboard, output folder open |
| `video:failed` | After 3 retries | Dashboard, error log |

---

## Files Used by This Agent

```
Claude/Skills/batch-processing.md       ← Processing logic and preset specs
Claude/Worktree/processing-queue.md     ← Queue management workflow
Claude/Worktree/monitoring.md           ← Progress monitoring plan
Claude/Worktree/export-logs.md          ← Output and logging
```
