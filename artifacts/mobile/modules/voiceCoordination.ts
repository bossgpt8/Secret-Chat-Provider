export type MicrophoneOwner = "current" | "live";
/** Serialize acknowledged wake-mic handoffs and reject competing voice modes. */
export class VoiceCoordinator {
  private owner: MicrophoneOwner | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private epoch = 0;
  private readonly pauseWake: (paused: boolean) => Promise<void>;
  constructor(pauseWake: (paused: boolean) => Promise<void>) { this.pauseWake = pauseWake; }
  acquire(owner: MicrophoneOwner): Promise<boolean> {
    const epoch = this.epoch;
    const request = this.chain.then(async () => {
      if (epoch !== this.epoch) return false;
      if (this.owner && this.owner !== owner) throw new Error("Close the other voice mode before using this microphone.");
      await this.pauseWake(true);
      if (epoch !== this.epoch) { await this.pauseWake(false); return false; }
      this.owner = owner;
      return true;
    });
    this.chain = request.catch(() => {});
    return request;
  }
  release(owner: MicrophoneOwner, cleanup: Promise<unknown> = Promise.resolve()): Promise<void> {
    const request = this.chain.then(async () => {
      await cleanup;
      if (this.owner !== owner) return;
      this.owner = null;
      await this.pauseWake(false);
    });
    this.chain = request.catch(() => {});
    return request;
  }
  cancelPending() { this.epoch++; }
}

/** At most one prepared phrase; errors are consumed later by the normal fallback. */
export class SpeechPrefetch<T> {
  private entry: { key: string; generation: number; value: Promise<{ value?: T; error?: unknown }> } | null = null;
  prepare(key: string, generation: number, generate: () => Promise<T>) {
    if (this.entry) return;
    this.entry = { key, generation, value: Promise.resolve().then(generate).then(value => ({ value }), error => ({ error })) };
  }
  take(key: string, generation: number) {
    if (!this.entry || this.entry.key !== key || this.entry.generation !== generation) return null;
    const value = this.entry.value;
    this.entry = null;
    return value;
  }
  clear() { this.entry = null; }
}
