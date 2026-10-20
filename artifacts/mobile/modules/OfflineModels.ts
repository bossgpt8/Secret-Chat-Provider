import { NativeEventEmitter, NativeModules, Platform } from "react-native";

export type OfflineModelKind = "stt" | "tts";

export interface OfflineModelDefinition {
  id: string;
  kind: OfflineModelKind;
  label: string;
  description: string;
  fileName: string;
  url: string;
  sizeLabel: string;
  configFileName?: string;
  configUrl?: string;
}

/**
 * Only models with redistributable/free weights are listed here.
 * The UI presents these through dropdowns rather than a long list.
 */
export const OFFLINE_MODELS: OfflineModelDefinition[] = [
  {
    id: "whisper-tiny-en",
    kind: "stt",
    label: "Whisper Tiny (English)",
    description: "Smallest Whisper option. Fastest downloads and responses; best for short commands.",
    fileName: "ggml-tiny.en-q5_1.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en-q5_1.bin",
    sizeLabel: "~31 MB",
  },
  {
    id: "whisper-base-en",
    kind: "stt",
    label: "Whisper Base (English)",
    description: "A stronger balance of accuracy and speed for everyday voice conversations.",
    fileName: "ggml-base.en-q5_1.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin",
    sizeLabel: "~57 MB",
  },
  {
    id: "piper-lessac-medium",
    kind: "tts",
    label: "Piper English — Lessac",
    description: "Natural offline English voice with a compact CPU-friendly model.",
    fileName: "en_US-lessac-medium.onnx",
    url: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
    sizeLabel: "~63 MB",
    configFileName: "en_US-lessac-medium.onnx.json",
    configUrl: "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json",
  },
];

export interface DownloadProgress {
  downloadId: number;
  fileName: string;
  downloadedBytes: number;
  totalBytes: number;
  progress: number;
  /** Android DownloadManager status: pending, running, paused, successful, failed */
  status: number;
}

export interface DownloadComplete {
  downloadId: number;
  path: string;
  success: boolean;
  reason: number;
}

const { VoxDownloadModule, VoxPiperModule, VoxPcmRecorderModule } = NativeModules;
const downloadEmitter =
  Platform.OS === "android" && VoxDownloadModule
    ? new NativeEventEmitter(VoxDownloadModule)
    : null;
const pcmEmitter =
  Platform.OS === "android" && VoxPcmRecorderModule
    ? new NativeEventEmitter(VoxPcmRecorderModule)
    : null;

export const NativeOfflineModels = {
  isAvailable: Platform.OS === "android" && !!VoxDownloadModule,

  async startDownload(
    model: OfflineModelDefinition,
    onProgress?: (event: DownloadProgress) => void,
    onComplete?: (event: DownloadComplete) => void,
  ): Promise<{ downloadId: number; alreadyExists: boolean; path?: string }> {
    if (!VoxDownloadModule) throw new Error("Offline model downloads require an Android build.");
    const progressSub = onProgress
      ? downloadEmitter?.addListener("onVoxDownloadProgress", onProgress)
      : undefined;
    const completeSub = onComplete
      ? downloadEmitter?.addListener("onVoxDownloadComplete", onComplete)
      : undefined;
    try {
      const result = await VoxDownloadModule.startDownload(
        model.url,
        model.fileName,
        model.label,
      );
      return result;
    } finally {
      // The download itself continues after this call. The settings screen
      // owns long-lived listeners when it needs progress after enqueueing.
      progressSub?.remove();
      completeSub?.remove();
    }
  },

  onProgress(callback: (event: DownloadProgress) => void): () => void {
    if (!downloadEmitter) return () => {};
    const sub = downloadEmitter.addListener("onVoxDownloadProgress", callback);
    return () => sub.remove();
  },

  onComplete(callback: (event: DownloadComplete) => void): () => void {
    if (!downloadEmitter) return () => {};
    const sub = downloadEmitter.addListener("onVoxDownloadComplete", callback);
    return () => sub.remove();
  },

  async cancelDownload(downloadId: number): Promise<boolean> {
    if (!VoxDownloadModule) return false;
    return VoxDownloadModule.cancelDownload(downloadId);
  },

  async isDownloaded(fileName: string): Promise<boolean> {
    if (!VoxDownloadModule) return false;
    return VoxDownloadModule.isModelDownloaded(fileName);
  },

  async getPath(fileName: string): Promise<string | null> {
    if (!VoxDownloadModule) return null;
    return VoxDownloadModule.getModelPath(fileName);
  },

  async deleteModel(fileName: string): Promise<boolean> {
    if (!VoxDownloadModule) return false;
    return VoxDownloadModule.deleteModel(fileName);
  },
};

export const NativePiper = {
  isAvailable: Platform.OS === "android" && !!VoxPiperModule,

  async synthesize(text: string, modelPath: string, configPath: string): Promise<string> {
    if (!VoxPiperModule) throw new Error("Piper is only available in an Android build.");
    return VoxPiperModule.synthesize(text, modelPath, configPath);
  },

  async unloadModel(): Promise<boolean> {
    if (!VoxPiperModule) return false;
    return VoxPiperModule.unloadModel();
  },
};

export const NativePcmRecorder = {
  isAvailable: Platform.OS === "android" && !!VoxPcmRecorderModule,

  async start(): Promise<boolean> {
    if (!VoxPcmRecorderModule) return false;
    return VoxPcmRecorderModule.start();
  },

  async stop(): Promise<string | null> {
    if (!VoxPcmRecorderModule) return null;
    return VoxPcmRecorderModule.stop();
  },

  async cancel(): Promise<void> {
    if (!VoxPcmRecorderModule) return;
    return VoxPcmRecorderModule.cancel();
  },

  onLevel(callback: (event: { level: number }) => void): () => void {
    if (!pcmEmitter) return () => {};
    const sub = pcmEmitter.addListener("onVoxPcmLevel", callback);
    return () => sub.remove();
  },
};

export async function transcribeWithWhisper(
  modelPath: string,
  audioPath: string,
  language = "en",
): Promise<string> {
  // Dynamic import keeps Expo/web bundles from evaluating whisper.rn's native
  // JSI bindings when an Android offline model is not being used.
  const { initWhisper } = await import("whisper.rn");
  const context = await initWhisper({ filePath: modelPath });
  try {
    const { promise } = context.transcribe(
      audioPath.startsWith("file://") ? audioPath : `file://${audioPath}`,
      {
        language,
        maxThreads: 4,
        translate: false,
        printProgress: false,
      },
    );
    const result = await promise;
    return result.result.trim();
  } finally {
    await context.release();
  }
}
