export const PIPER_ATTEMPT_KEY = "@vox_piper_attempt";

export interface PiperReadiness {
  supported: boolean;
  reason?: string;
}

interface Storage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface Engine {
  getReadiness(): Promise<PiperReadiness>;
  synthesize(text: string, model: string, config: string): Promise<string>;
  unloadModel(): Promise<boolean>;
}

/** A native crash cannot be caught by JS. Never restore heavy inference on boot. */
export function restoreVoiceProvider(saved: string | null, interrupted: string | null) {
  const recovered = saved === "piper" || interrupted === "1";
  const provider = recovered ? "phone" :
    saved === "phone" || saved === "elevenlabs" || saved === "kokoro" ? saved : "kokoro";
  return { provider, recovered, interrupted: interrupted === "1" } as const;
}

/** One native attempt at a time, with a durable crash marker and session breaker. */
export function createPiperSafety(storage: Storage, engine: Engine, timeoutMs = 18000) {
  let busy = false;
  let blocked: string | undefined;
  return {
    async getReadiness(): Promise<PiperReadiness> {
      if (blocked) return { supported: false, reason: blocked };
      return engine.getReadiness();
    },
    async synthesize(text: string, model: string, config: string) {
      if (blocked) throw new Error(blocked);
      if (busy) throw new Error("Piper is already generating speech.");
      busy = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const readiness = await engine.getReadiness();
        if (!readiness.supported) throw new Error(readiness.reason || "Piper is unavailable on this device.");
        // If storage fails, do not enter native inference without recovery.
        await storage.setItem(PIPER_ATTEMPT_KEY, "1");
        const path = await Promise.race([
          engine.synthesize(text, model, config),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Piper timed out. Phone voice will be used.")), timeoutMs);
          }),
        ]);
        await storage.removeItem(PIPER_ATTEMPT_KEY);
        return path;
      } catch (error) {
        blocked = error instanceof Error ? error.message : "Piper failed. Phone voice will be used.";
        // Keep the marker on failure, including a late native completion after
        // timeout. Recovery clears it only after persisting Phone voice.
        void engine.unloadModel().catch(() => {});
        throw new Error(blocked);
      } finally {
        if (timer) clearTimeout(timer);
        busy = false;
      }
    },
  };
}
