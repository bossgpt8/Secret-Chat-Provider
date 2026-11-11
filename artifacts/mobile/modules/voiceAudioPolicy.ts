/** Android voice replies must survive opening another app. Do not opt iOS into background recording. */
export function voiceAudioMode(platform: string, recording = false) {
  return {
    allowsRecordingIOS: recording,
    playsInSilentModeIOS: true,
    staysActiveInBackground: platform === "android",
  };
}

export class PiperSynthesisFailure extends Error {
  readonly code?: string;
  constructor(error: unknown) {
    const nativeError = error as { message?: unknown; code?: unknown } | null;
    super(typeof nativeError?.message === "string" ? nativeError.message : "Piper synthesis failed.");
    this.name = "PiperSynthesisFailure";
    this.code = typeof nativeError?.code === "string" ? nativeError.code : undefined;
  }
}

/** Tag only inference/prefetch errors, never Audio.Sound or audio-focus errors. */
export async function synthesizePiperOrThrow(synthesize: () => Promise<string>): Promise<string> {
  try {
    return await synthesize();
  } catch (error) {
    throw new PiperSynthesisFailure(error);
  }
}

export function shouldDisablePiper(error: unknown): boolean {
  return error instanceof PiperSynthesisFailure && error.code !== "ERR_PIPER_PRONUNCIATION";
}
