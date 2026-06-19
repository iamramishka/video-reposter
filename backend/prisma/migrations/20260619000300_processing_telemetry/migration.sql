CREATE TABLE "ProcessingTelemetry" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "preset" TEXT NOT NULL,
    "elapsedMs" INTEGER NOT NULL,
    "throughputMbPerMin" DOUBLE PRECISION,
    "inputSizeBytes" DOUBLE PRECISION,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessingTelemetry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProcessingTelemetry_jobId_key" ON "ProcessingTelemetry"("jobId");
CREATE INDEX "ProcessingTelemetry_status_idx" ON "ProcessingTelemetry"("status");
CREATE INDEX "ProcessingTelemetry_preset_idx" ON "ProcessingTelemetry"("preset");
CREATE INDEX "ProcessingTelemetry_errorCode_idx" ON "ProcessingTelemetry"("errorCode");
CREATE INDEX "ProcessingTelemetry_createdAt_idx" ON "ProcessingTelemetry"("createdAt");
