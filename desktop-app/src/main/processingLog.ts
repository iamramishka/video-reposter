import { appendFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";

export function getProcessingLogPath(userDataPath: string) {
  const logDir = path.join(userDataPath, "Logs", "processing");
  mkdirSync(logDir, { recursive: true });
  return path.join(logDir, `${new Date().toISOString().slice(0, 10)}_processing.log`);
}

export function appendProcessingLog(userDataPath: string, message: string) {
  const logPath = getProcessingLogPath(userDataPath);
  appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`, "utf8");
  return logPath;
}

export function trimProcessingLogs(userDataPath: string, keepDays: number): number {
  const logDir = path.join(userDataPath, "Logs", "processing");
  if (!existsSync(logDir)) return 0;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - keepDays);
  let deleted = 0;
  for (const file of readdirSync(logDir)) {
    const match = /^(\d{4}-\d{2}-\d{2})_processing\.log$/.exec(file);
    if (!match?.[1]) continue;
    if (new Date(match[1]) < cutoff) {
      unlinkSync(path.join(logDir, file));
      deleted++;
    }
  }
  return deleted;
}
