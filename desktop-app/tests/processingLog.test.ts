import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendProcessingLog, getProcessingLogPath } from "../src/main/processingLog.js";

describe("processing log", () => {
  it("creates a dated processing log and appends entries", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vr-log-"));
    try {
      const logPath = appendProcessingLog(dir, "Started queue");
      appendProcessingLog(dir, "Processing complete");

      expect(logPath).toBe(getProcessingLogPath(dir));
      const content = readFileSync(logPath, "utf8");
      expect(content).toContain("Started queue");
      expect(content).toContain("Processing complete");
      expect(logPath).toContain(`${new Date().toISOString().slice(0, 10)}_processing.log`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
