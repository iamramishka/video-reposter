import { statfs } from "node:fs/promises";

export type DiskSpaceInfo = {
  freeGb: number;
  totalGb: number;
  freePercent: number;
  warn: boolean;
};

const WARN_FREE_GB = 1.0;

export async function checkDiskSpace(targetPath: string): Promise<DiskSpaceInfo> {
  const stats = await statfs(targetPath);
  const freeGb = (stats.bfree * stats.bsize) / 1e9;
  const totalGb = (stats.blocks * stats.bsize) / 1e9;
  const freePercent = totalGb > 0 ? (freeGb / totalGb) * 100 : 100;
  return {
    freeGb: Math.round(freeGb * 10) / 10,
    totalGb: Math.round(totalGb * 10) / 10,
    freePercent: Math.round(freePercent),
    warn: freeGb < WARN_FREE_GB
  };
}
