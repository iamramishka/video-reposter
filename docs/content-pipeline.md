# Content Pipeline

This is the current desktop processing flow used by UI verification and release checks.

## Flow

1. Intake: user selects files or folders; supported extensions are defined in `desktop-app/src/shared/processing.ts`.
2. Validation: desktop main process probes selected media with `ffprobe-static`.
3. Preset selection: renderer state chooses platform output settings from the shared preset list.
4. Transform build: `buildFfmpegArgs` creates deterministic FFmpeg arguments for scaling, flips, rotation, color, sharpness, audio, codec, bitrate, and duration.
5. Execution: `ProcessingService` launches `ffmpeg-static`, streams progress from stderr, and emits structured updates.
6. Failure handling: user-safe messages are shown in the UI; technical details stay in structured failure metadata.
7. Output: finished files are written to the requested output path and recorded in processing history/logs.

## Regression Target

Prefer golden argument tests for FFmpeg command generation. Do not require real media processing in unit tests unless the test is explicitly marked as an integration or release verification test.
