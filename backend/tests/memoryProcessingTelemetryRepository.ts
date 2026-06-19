import crypto from "node:crypto";
import type { ProcessingTelemetryRecord, ProcessingTelemetryRepository } from "../src/types.js";

export class MemoryProcessingTelemetryRepository implements ProcessingTelemetryRepository {
  records = new Map<string, ProcessingTelemetryRecord>();

  async create(input: Parameters<ProcessingTelemetryRepository["create"]>[0]) {
    const existing = this.records.get(input.jobId);
    const record: ProcessingTelemetryRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      jobId: input.jobId,
      status: input.status,
      preset: input.preset,
      elapsedMs: input.elapsedMs,
      throughputMbPerMin: input.throughputMbPerMin ?? null,
      inputSizeBytes: input.inputSizeBytes ?? null,
      errorCode: input.errorCode ?? null,
      createdAt: existing?.createdAt ?? new Date()
    };
    this.records.set(input.jobId, record);
    return record;
  }

  async listRecent(limit: number) {
    return [...this.records.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}
