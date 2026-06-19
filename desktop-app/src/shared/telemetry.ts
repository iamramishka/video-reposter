export type ProcessingTelemetryStatus = "complete" | "failed";

export type ProcessingTelemetryPayload = {
  jobId: string;
  status: ProcessingTelemetryStatus;
  preset: string;
  elapsedMs: number;
  throughputMbPerMin?: number;
  inputSizeBytes?: number;
  errorCode?: string;
};

export function buildProcessingTelemetryPayload(input: {
  jobId?: string;
  status?: string;
  preset?: string;
  elapsedMs?: number;
  throughputMbPerMin?: number;
  inputSizeBytes?: number;
  errorCode?: string;
}): ProcessingTelemetryPayload | null {
  if (!input.jobId?.trim()) return null;
  if (input.status !== "complete" && input.status !== "failed") return null;
  if (!input.preset?.trim()) return null;
  const elapsedMs = input.elapsedMs;
  if (elapsedMs === undefined || !Number.isFinite(elapsedMs) || elapsedMs < 0) return null;

  const payload: ProcessingTelemetryPayload = {
    jobId: input.jobId.trim(),
    status: input.status,
    preset: input.preset.trim(),
    elapsedMs: Math.round(elapsedMs)
  };

  if (input.throughputMbPerMin !== undefined && Number.isFinite(input.throughputMbPerMin) && input.throughputMbPerMin >= 0) {
    payload.throughputMbPerMin = input.throughputMbPerMin;
  }
  if (input.inputSizeBytes !== undefined && Number.isFinite(input.inputSizeBytes) && input.inputSizeBytes >= 0) {
    payload.inputSizeBytes = Math.round(input.inputSizeBytes);
  }
  if (input.status === "failed" && input.errorCode?.trim()) {
    payload.errorCode = input.errorCode.trim();
  }

  return payload;
}

export function isProcessingTelemetryPayload(value: unknown): value is ProcessingTelemetryPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as ProcessingTelemetryPayload;
  return Boolean(buildProcessingTelemetryPayload(payload));
}
