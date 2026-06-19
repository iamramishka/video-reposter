import { describe, expect, it } from "vitest";
import { buildProcessingTelemetryPayload, isProcessingTelemetryPayload } from "../src/shared/telemetry";

describe("processing telemetry payloads", () => {
  it("builds valid complete and failed telemetry payloads", () => {
    expect(buildProcessingTelemetryPayload({
      jobId: "job-1",
      status: "complete",
      preset: "instagram-reel",
      elapsedMs: 1234.4,
      throughputMbPerMin: 42,
      inputSizeBytes: 60000000
    })).toEqual({
      jobId: "job-1",
      status: "complete",
      preset: "instagram-reel",
      elapsedMs: 1234,
      throughputMbPerMin: 42,
      inputSizeBytes: 60000000
    });

    expect(buildProcessingTelemetryPayload({
      jobId: "job-2",
      status: "failed",
      preset: "custom",
      elapsedMs: 100,
      errorCode: "processing_failed"
    })).toEqual({
      jobId: "job-2",
      status: "failed",
      preset: "custom",
      elapsedMs: 100,
      errorCode: "processing_failed"
    });
  });

  it("rejects malformed telemetry payloads", () => {
    expect(buildProcessingTelemetryPayload({ jobId: "", status: "complete", preset: "x", elapsedMs: 1 })).toBeNull();
    expect(buildProcessingTelemetryPayload({ jobId: "x", status: "stopped", preset: "x", elapsedMs: 1 })).toBeNull();
    expect(buildProcessingTelemetryPayload({ jobId: "x", status: "complete", preset: "", elapsedMs: 1 })).toBeNull();
    expect(buildProcessingTelemetryPayload({ jobId: "x", status: "complete", preset: "x", elapsedMs: -1 })).toBeNull();
    expect(isProcessingTelemetryPayload({ jobId: "x", status: "complete", preset: "x", elapsedMs: 1 })).toBe(true);
  });
});
