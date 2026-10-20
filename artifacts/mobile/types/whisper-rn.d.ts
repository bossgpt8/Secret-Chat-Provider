declare module "whisper.rn" {
  interface TranscribeResult {
    result: string;
    isAborted?: boolean;
  }

  interface WhisperContext {
    transcribe(
      filePath: string,
      options?: {
        language?: string;
        maxThreads?: number;
        translate?: boolean;
        printProgress?: boolean;
      },
    ): {
      promise: Promise<TranscribeResult>;
      stop: () => Promise<void>;
    };
    release(): Promise<void>;
  }

  export function initWhisper(options: { filePath: string }): Promise<WhisperContext>;
}