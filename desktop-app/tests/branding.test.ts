import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { productName, productTagline } from "../src/shared/branding.js";

describe("customer-facing branding", () => {
  it("uses Video Reposter as the product name and keeps batch processing descriptive", () => {
    expect(productName).toBe("Video Reposter");
    expect(productTagline).toBe("Batch Process Videos with Ease");
  });

  it("uses the product name in desktop and admin document titles", () => {
    const desktopHtml = readFileSync(path.resolve("index.html"), "utf8");
    const adminHtml = readFileSync(path.resolve("../admin-dashboard/index.html"), "utf8");

    expect(desktopHtml).toContain("<title>Video Reposter</title>");
    expect(adminHtml).toContain("<title>Video Reposter Admin</title>");
    expect(desktopHtml).not.toContain("Video Batch Processor");
  });
});
