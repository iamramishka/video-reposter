import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendProcessingLog, getProcessingLogPath, trimProcessingLogs } from "../src/main/processingLog.js";

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

  it("trims log files older than the retention window and returns the count deleted", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vr-trim-"));
    try {
      const logDir = path.join(dir, "Logs", "processing");
      mkdirSync(logDir, { recursive: true });

      const today = new Date().toISOString().slice(0, 10);
      const old = "2020-01-01";
      writeFileSync(path.join(logDir, `${today}_processing.log`), "today\n");
      writeFileSync(path.join(logDir, `${old}_processing.log`), "old\n");
      writeFileSync(path.join(logDir, "not-a-log.txt"), "ignored\n");

      const deleted = trimProcessingLogs(dir, 30);
      expect(deleted).toBe(1);

      const remaining = readFileSync(path.join(logDir, `${today}_processing.log`), "utf8");
      expect(remaining).toBe("today\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns 0 when the log directory does not exist", () => {
    expect(trimProcessingLogs("/nonexistent/path", 30)).toBe(0);
  });
});
