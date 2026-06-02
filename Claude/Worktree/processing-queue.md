# 📋 Processing Queue Worktree

## Overview
This document defines the complete workflow for accepting, organizing, and executing the video processing queue — from file intake through transformation and output delivery.

---

## Queue Lifecycle

```
USER ACTION: Import Videos
│
├── [INPUT PHASE]
│   ├── Accept files via: drag-drop / file picker / folder watch
│   ├── Validate each file (format, integrity, size limit)
│   ├── Check for duplicates (by filename + hash)
│   └── Add valid files to queue with status: QUEUED
│
├── [CONFIGURATION PHASE]
│   ├── User selects preset (or custom settings)
│   ├── User sets output directory
│   ├── User sets worker count (1–8)
│   └── User sets priority order (FIFO / Size ASC / Size DESC / Manual)
│
├── [PROCESSING PHASE]
│   ├── User clicks START
│   ├── Processing Agent spawns workers
│   ├── Workers pick from queue (FIFO default)
│   ├── Each video: decode → transform → encode → write output
│   └── Queue item updated: PROCESSING → DONE or FAILED
│
└── [COMPLETION PHASE]
    ├── All items done → show completion summary
    ├── Failed items shown with error + retry option
    └── Output folder auto-opens (optional)
```

---

## Queue States per Item

```
QUEUED ──► PROCESSING ──► DONE
    │                 │
    │                 └──► FAILED ──► (retry) ──► PROCESSING
    │                                        └──► FAILED (final)
    └──► SKIPPED (validation failure at intake)

User controls:
    PROCESSING ──► PAUSED ──► PROCESSING
    PROCESSING ──► STOPPED ──► QUEUED (reset)
```

---

## Input Validation Rules

| Check | Rule | On Fail |
|-------|------|---------|
| File format | .mp4, .mov, .avi, .mkv, .webm, .flv | Skip + warn |
| File size | > 0 bytes, < 50 GB | Skip if 0, warn if > 50 GB |
| File readable | Can open for reading | Skip + error |
| Duplicate check | Same filename + same size | Skip with "duplicate" label |
| Codec readable | FFprobe can parse | Skip + "unreadable" label |

---

## Queue Data Structure

```json
{
  "queue_id": "session-uuid-v4",
  "created_at": "2026-05-31T18:00:00Z",
  "preset": "instagram-reel",
  "output_dir": "C:/VideoReposter/Output/2026-05-31",
  "priority_mode": "FIFO",
  "worker_count": 2,
  "status": "processing | paused | stopped | complete",
  "items": [
    {
      "id": "item-uuid",
      "filename": "video_001.mp4",
      "input_path": "C:/Users/Videos/video_001.mp4",
      "output_path": "C:/VideoReposter/Output/2026-05-31/video_001_processed.mp4",
      "status": "queued",
      "progress": 0,
      "retry_count": 0,
      "error_message": null,
      "duration_seconds": null,
      "file_size_mb": 45.2,
      "added_at": "2026-05-31T18:01:00Z",
      "started_at": null,
      "completed_at": null
    }
  ],
  "stats": {
    "total": 10,
    "queued": 8,
    "processing": 2,
    "done": 0,
    "failed": 0,
    "skipped": 0
  }
}
```

---

## Preset System

### Preset Configuration Schema
```json
{
  "id": "instagram-reel",
  "name": "Instagram Reel",
  "icon": "instagram.svg",
  "settings": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "video_codec": "libx264",
    "audio_codec": "aac",
    "video_bitrate": "4M",
    "audio_bitrate": "128k",
    "max_duration_s": 90,
    "watermark": null,
    "trim_silence": false,
    "normalize_audio": true
  }
}
```

### Built-in Presets
```
instagram-reel     → 1080×1920, 30fps, H.264, max 90s
youtube-short      → 1080×1920, 60fps, H.264, max 60s
tiktok             → 1080×1920, 30fps, H.264, max 180s
twitter-video      → 1280×720, 30fps, H.264, max 140s
facebook-reel      → 1080×1920, 30fps, H.265, max 90s
custom             → User-defined all settings
```

---

## Worker Assignment Logic

```
Available workers: N (default 2, max 8)
Queue mode: FIFO

For each available worker slot:
  1. Pick next QUEUED item from top of queue
  2. Lock item (prevent double-assignment)
  3. Assign item to worker
  4. Update item.status = PROCESSING
  5. Update item.worker_id = worker.id
  6. Start transformation

When worker completes:
  1. Update item.status = DONE
  2. Record duration, output path
  3. Worker picks next QUEUED item
  4. If queue empty → worker idles → emit: batch:complete
```

---

## Pause / Resume / Stop Behavior

### PAUSE
```
1. Signal all active workers to pause after current FFmpeg frame
2. Workers reach safe checkpoint → suspend
3. Queue status → PAUSED
4. UI: show "Paused" state, enable Resume button
5. Progress preserved exactly where paused
```

### RESUME
```
1. Signal all paused workers to resume
2. Workers continue from last checkpoint
3. Queue status → PROCESSING
4. UI: show "Processing" state
```

### STOP
```
1. Signal all workers to stop immediately
2. Kill FFmpeg processes
3. Delete partial temp output files
4. Reset all PROCESSING items → QUEUED
5. Queue status → STOPPED
6. UI: show "Stopped" — ready to restart
```

---

## FFmpeg Command Template

```bash
ffmpeg \
  -i "{input_path}" \
  -vf "scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2" \
  -c:v {video_codec} \
  -b:v {video_bitrate} \
  -c:a {audio_codec} \
  -b:a {audio_bitrate} \
  -r {fps} \
  -movflags +faststart \
  -y \
  "{output_path}"
```

---

## Performance Benchmarks (Target)

| Video Length | File Size | Processing Time (2 workers) |
|-------------|----------|----------------------------|
| 30 seconds | ~50 MB | ~20 seconds |
| 60 seconds | ~100 MB | ~40 seconds |
| 3 minutes | ~300 MB | ~2 minutes |
| 10 minutes | ~1 GB | ~6 minutes |
| 60 minutes | ~5 GB | ~35 minutes |
