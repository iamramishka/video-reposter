import { z } from "zod";
import type { ProcessingTelemetryRecord, ProcessingTelemetryRepository } from "../types.js";

export const processingTelemetrySchema = z.object({
  jobId: z.string().min(1).max(160),
  status: z.enum(["complete", "failed"]),
  preset: z.string().min(1).max(120),
  elapsedMs: z.number().int().nonnegative(),
  throughputMbPerMin: z.number().nonnegative().optional(),
  inputSizeBytes: z.number().nonnegative().optional(),
  errorCode: z.string().min(1).max(120).optional()
}).superRefine((value, ctx) => {
  if (value.status === "failed" && !value.errorCode) {
    ctx.addIssue({ code: "custom", path: ["errorCode"], message: "errorCode is required when status is failed" });
  }
});

export class ProcessingTelemetryService {
  constructor(private readonly repository: ProcessingTelemetryRepository) {}

  async record(input: z.infer<typeof processingTelemetrySchema>) {
    await this.repository.create({
      jobId: input.jobId,
      status: input.status,
      preset: input.preset,
      elapsedMs: input.elapsedMs,
      throughputMbPerMin: input.throughputMbPerMin ?? null,
      inputSizeBytes: input.inputSizeBytes ?? null,
      errorCode: input.status === "failed" ? input.errorCode ?? "UNKNOWN" : null
    });
  }

  async analytics() {
    const records = await this.repository.listRecent(10_000);
    const completed = records.filter((record) => record.status === "complete");
    const failed = records.filter((record) => record.status === "failed");
    const averageElapsedMs = average(records.map((record) => record.elapsedMs));
    const averageThroughputMbPerMin = average(completed.map((record) => record.throughputMbPerMin).filter((value): value is number => typeof value === "number"));

    return {
      total: records.length,
      complete: completed.length,
      failed: failed.length,
      average_elapsed_ms: averageElapsedMs,
      average_throughput_mb_per_min: averageThroughputMbPerMin,
      presets: countBy(records, (record) => record.preset),
      top_error_codes: topErrors(failed),
      recent: records.slice(0, 20).map(toResponse)
    };
  }
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function countBy(records: ProcessingTelemetryRecord[], key: (record: ProcessingTelemetryRecord) => string) {
  return records.reduce<Record<string, number>>((counts, record) => {
    const value = key(record);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function topErrors(records: ProcessingTelemetryRecord[]) {
  return Object.entries(countBy(records.filter((record) => record.errorCode), (record) => record.errorCode ?? "UNKNOWN"))
    .map(([error_code, count]) => ({ error_code, count }))
    .sort((a, b) => b.count - a.count || a.error_code.localeCompare(b.error_code))
    .slice(0, 10);
}

function toResponse(record: ProcessingTelemetryRecord) {
  return {
    id: record.id,
    job_id: record.jobId,
    status: record.status,
    preset: record.preset,
    elapsed_ms: record.elapsedMs,
    throughput_mb_per_min: record.throughputMbPerMin,
    input_size_bytes: record.inputSizeBytes,
    error_code: record.errorCode,
    created_at: record.createdAt.toISOString()
  };
}
