# 📡 Monitoring Worktree

## Overview
This document defines how the system monitors active video processing in real-time, tracks worker health, surfaces errors, and keeps the dashboard data live and accurate.

---

## Monitoring Architecture

```
Processing Workers
        │
        │ emit events every 500ms
        ▼
┌─────────────────────┐
│  Event Bus (IPC)    │  ← All agents communicate here
└──────────┬──────────┘
           │
     ┌─────┴──────┐
     │            │
     ▼            ▼
┌─────────┐  ┌──────────────┐
│Dashboard│  │Analytics     │
│   UI    │  │Agent (DB)    │
└─────────┘  └──────────────┘
```

---

## Real-Time Dashboard Updates

### Data Refreshed Every 500ms (Progress)
```
Per-video progress bar: {item_id} → {progress}%
Active workers count: {active} / {total}
Current queue position: Item {n} of {total}
ETA calculation: avg_rate × remaining_files
```

### Data Refreshed Every 5s (Stats Panel)
```
Total processed today:    {count}
Total failed today:       {count}
Success rate:             {percent}%
Data processed today:     {GB}
Current throughput:       {MB/s}
Estimated time remaining: {HH:MM:SS}
```

---

## Progress Calculation

```
Per-video progress:
  FFmpeg reports: frame={n} fps={x} time={HH:MM:SS.ms} ...
  Progress% = (current_time_seconds / total_duration_seconds) × 100

Overall batch progress:
  Batch% = (completed_items / total_items) × 100
  OR
  Weighted% = sum(item_progress × item_weight) / total_weight
  (weight = file_size_mb for size-weighted progress)

ETA:
  avg_processing_rate = total_completed_mb / elapsed_seconds
  remaining_mb = sum(file_size_mb for all queued items)
  eta_seconds = remaining_mb / avg_processing_rate
```

---

## Worker Health Monitoring

### Worker Status Checks (Every 10s)
```
For each worker:
  1. Check last heartbeat timestamp
  2. If no heartbeat for > 30s → worker considered stalled
  3. Check FFmpeg process PID still alive
  4. If PID dead but status = PROCESSING → worker crashed
  5. Trigger auto-recovery for crashed workers
```

### Worker States
```
IDLE        → Ready, waiting for queue item
BUSY        → Actively processing a video
PAUSED      → Suspended by user
STALLED     → No progress for > 5 min (auto-detected)
CRASHED     → Process died unexpectedly
```

### Auto-Recovery Flow
```
Worker STALLED detected
  │
  ├── Attempt 1: Send wake signal to worker
  │     Wait 30s for response
  │
  ├── No response → Kill worker, restart fresh
  │     Re-queue the video item it was working on
  │     retry_count++
  │
  └── If retry_count > 3 → Mark video as FAILED
       Emit: video:failed { id, error: 'WORKER_STALL' }
       Log to analytics DB
```

---

## Event Types (Event Bus)

| Event | Emitted By | Payload | Consumed By |
|-------|-----------|---------|-------------|
| `worker:progress` | Processing Worker | `{item_id, progress, fps, eta}` | Dashboard |
| `worker:heartbeat` | Processing Worker | `{worker_id, timestamp}` | Monitor |
| `worker:stall` | Monitor | `{worker_id, item_id}` | Processing Agent |
| `worker:crash` | Monitor | `{worker_id, error}` | Processing Agent |
| `video:done` | Processing Worker | `{item_id, duration, size}` | Analytics, Dashboard |
| `video:failed` | Processing Agent | `{item_id, error_code, retry}` | Analytics, Dashboard |
| `batch:complete` | Processing Agent | `{total, done, failed, duration}` | Analytics, Notifications |
| `alert:stall` | Monitor | `{item_id, worker_id}` | Dashboard (warning) |
| `alert:disk-low` | Monitor | `{free_gb, path}` | Dashboard (urgent) |
| `alert:high-errors` | Analytics Agent | `{error_rate, batch_id}` | Dashboard (warning) |

---

## Disk Space Monitor

```
Check interval: Every 60 seconds
Check path: Output directory drive

Thresholds:
  > 10 GB free    → Green (OK)
  5–10 GB free    → Yellow (warn in status bar)
  2–5 GB free     → Orange (banner warning)
  < 2 GB free     → Red (pause processing, urgent alert)
  < 500 MB free   → Stop processing, error dialog

Alert format:
  "⚠️ Low disk space: Only {X} GB remaining on C:\\
   Processing paused. Free up space to continue."
```

---

## Performance Metrics Tracked in Real Time

```
CPU Usage:
  - Read from OS every 5s
  - Display as gauge: 0–100%
  - Warn if > 90% for > 30s

RAM Usage:
  - Read from process memory every 5s
  - Display as MB used / total
  - Warn if > 85% of system RAM

GPU Usage (if hardware encoding):
  - Query via NVML / WMIC every 5s
  - Display if GPU encoding active

Network I/O:
  - Only relevant for license server calls
  - Show last ping time to license server

Processing Speed:
  - MB/s throughput per active worker
  - Shown in dashboard stats bar
```

---

## Log Format (Per Video)

```
[2026-05-31 18:05:00.000] START  | item_id=abc123 | file=video_001.mp4 | worker=1
[2026-05-31 18:05:00.500] PROG   | item_id=abc123 | progress=2% | fps=30 | eta=00:01:18
[2026-05-31 18:05:01.000] PROG   | item_id=abc123 | progress=5% | fps=31 | eta=00:01:14
...
[2026-05-31 18:06:23.100] DONE   | item_id=abc123 | duration=83.1s | size_out=38.4MB
[2026-05-31 18:06:23.100] MOVED  | item_id=abc123 | output=C:/VideoReposter/Output/...
```

---

## Dashboard Monitoring Panel Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  PROCESSING MONITOR                           [Pause] [Stop]    │
├──────────────────────────────────────────────────────────────────┤
│  Overall Progress: ████████████░░░░░░░░░░░░░░  47%              │
│  ETA: 00:04:32     Speed: 12.4 MB/s     Workers: 2/2 active    │
├───────────────────┬──────────────────────────────────────────────┤
│  QUEUE (12 items) │  ACTIVE WORKERS                             │
│                   │  Worker 1: video_005.mp4   ████░░░ 62%      │
│  ✅ video_001     │  Worker 2: video_006.mp4   ██░░░░░ 28%      │
│  ✅ video_002     ├──────────────────────────────────────────────┤
│  ✅ video_003     │  TODAY'S STATS                              │
│  ✅ video_004     │  Processed: 4    Failed: 0    Rate: 100%    │
│  ⚙️  video_005    │  Data: 184 MB    Avg time: 01:23            │
│  ⚙️  video_006    ├──────────────────────────────────────────────┤
│  ⏳ video_007     │  SYSTEM                                     │
│  ⏳ video_008     │  CPU: ████████░░ 78%    RAM: 3.2 / 16 GB   │
│  ⏳ video_009     │  Disk: 42.3 GB free ✅                      │
└───────────────────┴──────────────────────────────────────────────┘
```
