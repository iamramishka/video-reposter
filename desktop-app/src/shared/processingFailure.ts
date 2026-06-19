export type ProcessingFailureCode = "component_unavailable" | "invalid_video" | "output_folder" | "processing_failed";

export type ProcessingRecovery = "reinstall_support" | "replace_video" | "choose_output" | "retry_support";

export type ProcessingFailure = {
  code: ProcessingFailureCode;
  message: string;
  technicalMessage: string;
  retryable: boolean;
  recovery: ProcessingRecovery;
};

export type HardwareAccelerationInfo = {
  available: boolean;
  encoders: Array<"h264_nvenc" | "h264_amf" | "h264_qsv">;
  message: string;
  technicalMessage?: string;
};

export type ProcessingAvailability = {
  available: boolean;
  message: string;
  technicalMessage?: string;
  hardwareAcceleration?: HardwareAccelerationInfo;
  failure?: ProcessingFailure;
};

export type ProcessingFailureResult = {
  ok: false;
  message: string;
  failure: ProcessingFailure;
};

export const processingFailureMessages = {
  componentUnavailable: "Video processing is unavailable. Reinstall Video Reposter or contact support.",
  invalidVideo: "This video could not be read. Remove it and choose a supported video file.",
  outputFolder: "The output folder could not be used. Choose another output folder and try again.",
  processingFailed: "Video processing failed. Try again. If it keeps failing, contact support."
} as const;

export function componentUnavailableFailure(technicalMessage: string): ProcessingFailure {
  return {
    code: "component_unavailable",
    message: processingFailureMessages.componentUnavailable,
    technicalMessage,
    retryable: false,
    recovery: "reinstall_support"
  };
}

export function invalidVideoFailure(technicalMessage: string): ProcessingFailure {
  return {
    code: "invalid_video",
    message: processingFailureMessages.invalidVideo,
    technicalMessage,
    retryable: false,
    recovery: "replace_video"
  };
}

export function outputFolderFailure(technicalMessage: string): ProcessingFailure {
  return {
    code: "output_folder",
    message: processingFailureMessages.outputFolder,
    technicalMessage,
    retryable: true,
    recovery: "choose_output"
  };
}

export function processingFailedFailure(technicalMessage: string): ProcessingFailure {
  return {
    code: "processing_failed",
    message: processingFailureMessages.processingFailed,
    technicalMessage,
    retryable: true,
    recovery: "retry_support"
  };
}

export function classifyProcessingFailure(technicalMessage: string): ProcessingFailure {
  return isMissingComponentMessage(technicalMessage)
    ? componentUnavailableFailure(technicalMessage)
    : processingFailedFailure(technicalMessage);
}

export function isMissingComponentMessage(message: string) {
  return /enoent|not found|was not found|cannot find|no such file|spawn .* failed/i.test(message);
}
