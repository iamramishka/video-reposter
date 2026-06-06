import { describe, expect, it } from "vitest";
import {
  classifyProcessingFailure,
  componentUnavailableFailure,
  invalidVideoFailure,
  outputFolderFailure,
  processingFailedFailure
} from "../src/shared/processingFailure";

describe("processing failure classification", () => {
  it("marks missing processing components as non-retryable", () => {
    const failure = classifyProcessingFailure("spawn ffmpeg ENOENT");

    expect(failure).toEqual(expect.objectContaining({
      code: "component_unavailable",
      retryable: false,
      recovery: "reinstall_support"
    }));
    expect(failure.message).not.toContain("ENOENT");
  });

  it("defines retry behavior for customer recovery actions", () => {
    expect(componentUnavailableFailure("missing").retryable).toBe(false);
    expect(invalidVideoFailure("bad input").retryable).toBe(false);
    expect(outputFolderFailure("permission denied").retryable).toBe(true);
    expect(processingFailedFailure("exit code 1").retryable).toBe(true);
  });
});
