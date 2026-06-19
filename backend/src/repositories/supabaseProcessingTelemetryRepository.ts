import type { ProcessingTelemetryRecord, ProcessingTelemetryRepository, ProcessingTelemetryStatus } from "../types.js";
import { dateFromSupabase, SupabaseRestClient } from "./supabaseRestClient.js";

type TelemetryRow = {
  id: string;
  jobId: string;
  status: ProcessingTelemetryStatus;
  preset: string;
  elapsedMs: number;
  throughputMbPerMin: number | null;
  inputSizeBytes: number | null;
  errorCode: string | null;
  createdAt: string;
};

export class SupabaseProcessingTelemetryRepository implements ProcessingTelemetryRepository {
  constructor(private readonly client: SupabaseRestClient) {}

  async create(input: Parameters<ProcessingTelemetryRepository["create"]>[0]): Promise<ProcessingTelemetryRecord> {
    const existing = await this.client.getOne<TelemetryRow>("ProcessingTelemetry", { select: "*", jobId: `eq.${input.jobId}` });
    const body = {
      jobId: input.jobId,
      status: input.status,
      preset: input.preset,
      elapsedMs: input.elapsedMs,
      throughputMbPerMin: input.throughputMbPerMin ?? null,
      inputSizeBytes: input.inputSizeBytes ?? null,
      errorCode: input.errorCode ?? null
    };
    const row = existing
      ? await this.client.update<TelemetryRow>("ProcessingTelemetry", { jobId: `eq.${input.jobId}` }, body)
      : await this.client.create<TelemetryRow>("ProcessingTelemetry", { ...body, createdAt: new Date().toISOString() });
    return toTelemetryRecord(row);
  }

  async listRecent(limit: number): Promise<ProcessingTelemetryRecord[]> {
    const rows = await this.client.get<TelemetryRow[]>("ProcessingTelemetry", {
      select: "*",
      order: "createdAt.desc",
      limit
    });
    return rows.map(toTelemetryRecord);
  }
}

function toTelemetryRecord(row: TelemetryRow): ProcessingTelemetryRecord {
  return {
    id: row.id,
    jobId: row.jobId,
    status: row.status,
    preset: row.preset,
    elapsedMs: row.elapsedMs,
    throughputMbPerMin: row.throughputMbPerMin,
    inputSizeBytes: row.inputSizeBytes,
    errorCode: row.errorCode,
    createdAt: dateFromSupabase(row.createdAt) ?? new Date(row.createdAt)
  };
}
