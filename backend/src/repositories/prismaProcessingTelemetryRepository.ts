import type { PrismaClient } from "@prisma/client";
import type { ProcessingTelemetryRecord, ProcessingTelemetryRepository } from "../types.js";

export class PrismaProcessingTelemetryRepository implements ProcessingTelemetryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(input: Parameters<ProcessingTelemetryRepository["create"]>[0]): Promise<ProcessingTelemetryRecord> {
    return this.prisma.processingTelemetry.upsert({
      where: { jobId: input.jobId },
      update: {
        status: input.status,
        preset: input.preset,
        elapsedMs: input.elapsedMs,
        throughputMbPerMin: input.throughputMbPerMin ?? null,
        inputSizeBytes: input.inputSizeBytes ?? null,
        errorCode: input.errorCode ?? null
      },
      create: {
        jobId: input.jobId,
        status: input.status,
        preset: input.preset,
        elapsedMs: input.elapsedMs,
        throughputMbPerMin: input.throughputMbPerMin ?? null,
        inputSizeBytes: input.inputSizeBytes ?? null,
        errorCode: input.errorCode ?? null
      }
    }) as Promise<ProcessingTelemetryRecord>;
  }

  listRecent(limit: number): Promise<ProcessingTelemetryRecord[]> {
    return this.prisma.processingTelemetry.findMany({
      take: limit,
      orderBy: { createdAt: "desc" }
    }) as Promise<ProcessingTelemetryRecord[]>;
  }
}
