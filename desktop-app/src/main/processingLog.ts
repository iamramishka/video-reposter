import { appendFileSync, mkdirSync } from "node:fs";
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
