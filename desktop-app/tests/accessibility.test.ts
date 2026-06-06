import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("desktop action accessibility", () => {
  const appSource = readFileSync(path.resolve("src/renderer/App.tsx"), "utf8");
  const styles = readFileSync(path.resolve("src/renderer/styles.css"), "utf8");

  it("labels copy, retry, remove, and open-output actions", () => {
    expect(appSource).toContain('aria-label={`Copy ${label.toLowerCase()}`}');
    expect(appSource).toContain('aria-label={`Retry ${item.name}`}');
    expect(appSource).toContain('aria-label={`Remove ${item.name} from queue`}');
    expect(appSource).toContain('aria-label={`Open output folder for ${item.name}`}');
    expect(appSource).toContain(">Open Output</button>");
    expect(appSource).toContain("if (!navigator.clipboard?.writeText) return;");
  });

  it("shows a visible keyboard focus state on interactive controls", () => {
    expect(styles).toContain("button:focus-visible");
    expect(styles).toContain("input:focus-visible");
    expect(styles).toContain("outline: 3px solid #f59e0b");
  });

  it("gives first-time customers action-oriented empty states", () => {
    expect(appSource).toContain("Create your first video batch");
    expect(appSource).toContain("> Create New Batch</button>");
    expect(appSource).toContain("Add videos to begin");
    expect(appSource).toContain("No processing history yet");
    expect(appSource).not.toContain("Finished jobs will appear here.");
  });
});
