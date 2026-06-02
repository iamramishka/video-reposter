# 📦 Export & Logs Worktree

## Overview
This document defines the complete pipeline for saving processed videos to their output destination, exporting analytics data, and maintaining all system audit and processing logs.

---

## Output File Pipeline

```
VIDEO PROCESSING COMPLETE (per item)
  │
  ├── Step 1: VALIDATE output file
  │   ├── File exists at temp path?
  │   ├── File size > 0 bytes?
  │   ├── FFprobe can read output file?
  │   └── All checks pass? → continue
  │
  ├── Step 2: MOVE from temp to final output directory
  │   src:  C:/VideoReposter/Temp/{worker_id}/{item_id}.tmp.mp4
  │   dest: C:/VideoReposter/Output/{YYYY-MM-DD}/{original_name}_processed.mp4
  │
  ├── Step 3: HANDLE filename conflicts
  │   If file already exists at destination:
  │   → Append counter: filename_processed_2.mp4
  │
  ├── Step 4: UPDATE queue item
  │   { status: 'done', output_path, completed_at, duration_s, output_size_mb }
  │
  ├── Step 5: LOG output event
  │   → processing_events table in analytics.db
  │
  └── Step 6: CLEAN temp file
      → Delete from temp directory
```

---

## Output Directory Structure

```
C:/VideoReposter/
│
├── Output/
│   ├── 2026-05-30/
│   │   ├── video_001_processed.mp4
│   │   ├── video_002_processed.mp4
│   │   └── batch_summary_2026-05-30.json
│   └── 2026-05-31/
│       ├── video_003_processed.mp4
│       └── batch_summary_2026-05-31.json
│
├── Temp/
│   ├── worker_1/
│   └── worker_2/
│
├── Logs/
│   ├── processing/
│   │   ├── 2026-05-30.log
│   │   └── 2026-05-31.log
│   ├── license/
│   │   └── 2026-05-31.log
│   ├── analytics/
│   │   └── 2026-05-31.log
│   └── errors/
│       └── 2026-05-31.error.log
│
├── Reports/
│   ├── 2026-05-31_daily_report.pdf
│   ├── 2026-05-31_license_export.csv
│   └── 2026-05-31_processing_export.csv
│
├── Data/
│   └── analytics.db
│
└── Config/
    ├── config.json
    ├── paths.json
    └── presets.json
```

---

## Batch Summary JSON

After every batch completes, a summary file is written to the output folder:

```json
{
  "batch_id": "uuid-v4",
  "date": "2026-05-31",
  "started_at": "2026-05-31T18:00:00Z",
  "completed_at": "2026-05-31T18:45:00Z",
  "total_duration_seconds": 2700,
  "preset": "instagram-reel",
  "worker_count": 2,
  "results": {
    "total": 20,
    "done": 18,
    "failed": 1,
    "skipped": 1,
    "success_rate": 90.0
  },
  "data": {
    "total_input_mb": 2048.5,
    "total_output_mb": 1536.2,
    "compression_ratio": 0.75,
    "avg_processing_seconds": 135
  },
  "errors": [
    {
      "filename": "video_007.mp4",
      "error_code": "PROC_003",
      "error_message": "Worker timeout after 3 retries"
    }
  ],
  "output_directory": "C:/VideoReposter/Output/2026-05-31"
}
```

---

## Analytics Export Formats

### CSV — Processing Export
```
Filename: {date}_processing_export.csv
Columns:
  date, filename, preset, status, duration_seconds, 
  file_size_input_mb, file_size_output_mb, 
  error_code, worker_id, started_at, completed_at
```

### CSV — License Export
```
Filename: {date}_license_export.csv
Columns:
  license_key, plan, status, user_name, user_email,
  device_id, activated_at, expires_at, last_verified
```

### PDF — Daily Report
```
Header:    Video Reposter — Daily Report
           Generated: {timestamp}  |  Admin: {admin_name}

Section 1: Summary (key metrics table)
Section 2: Processing Statistics (bar chart: success vs failed per hour)
Section 3: License Overview (pie chart: active / expired / revoked)
Section 4: Error Log (table of all errors with codes and counts)
Section 5: System Performance (line chart: CPU/RAM over time)
Footer:    Page {n} of {total}  |  App v{version}  |  Report ID: {uuid}
```

---

## Log System

### Log Levels
```
ERROR   → Critical failures, exceptions, crashes
WARN    → Non-critical issues, retries, warnings
INFO    → Normal events (start, done, moved)
DEBUG   → Detailed step traces (for troubleshooting only)
```

### Log Rotation Policy
```
Max file size:    10 MB per log file
Rotation:         Daily (new file each day)
Retention:        30 days (older logs auto-deleted)
Compression:      Logs older than 7 days → gzipped
Archive:          Admin can manually export older logs as .zip
```

### Processing Log Format
```
[TIMESTAMP] [LEVEL] [COMPONENT] Message | key=value key=value

Examples:
[2026-05-31 18:05:00.000] INFO  [WORKER-1]  Processing started | item=abc123 file=video_001.mp4
[2026-05-31 18:05:23.450] INFO  [WORKER-1]  Processing done    | item=abc123 duration=23.4s size_out=38.4MB
[2026-05-31 18:05:23.500] INFO  [WORKER-1]  File moved         | dest=C:/VideoReposter/Output/...
[2026-05-31 18:06:00.000] ERROR [WORKER-2]  Worker timeout     | item=xyz456 retry=2 error=PROC_003
```

### License Log Format
```
[2026-05-31 18:00:01.200] INFO  [LICENSE]  Validate success  | key=VDRP-XXXX plan=pro expires=2027-01-01
[2026-05-31 18:00:01.250] INFO  [LICENSE]  Device confirmed  | device=sha256-abc... hostname=USER-PC
[2026-05-31 19:00:00.000] WARN  [LICENSE]  Expiry in 30d     | key=VDRP-XXXX expires=2026-06-30
```

---

## Temp Directory Cleanup

```
CLEANUP TRIGGERS:
  1. After each successful video move → delete that item's temp file
  2. On app startup → delete all orphaned temp files (> 24h old)
  3. On batch STOP → delete all partial temp files immediately
  4. Daily cleanup job → scan for any missed temp files

SAFETY:
  - Never delete temp files that are actively being written
  - Check file lock before deletion
  - Log all deletions at DEBUG level
```

---

## Error Log Export

The admin can export the error log at any time:
```
Format: CSV or TXT
Fields: timestamp, level, component, message, item_id, error_code
Filter: by date range, error code, component
Action: saved to C:/VideoReposter/Reports/error_export_{date}.csv
```

---

## Disk Usage Monitor & Auto-Clean

```
Trigger: Every 60 seconds

Check:
  Output dir size  → warn if > 100 GB
  Temp dir size    → warn if > 10 GB
  Log dir size     → auto-clean if > 2 GB (remove oldest logs)

Auto-clean rules (when disk < 5 GB free):
  1. Delete logs older than 7 days first
  2. Compress logs older than 3 days
  3. Notify admin: "Disk space low — cleaned {X} MB of old logs"
  4. Do NOT auto-delete output videos (admin must do this manually)
```
