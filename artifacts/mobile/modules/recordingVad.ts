/** End a hands-free turn only after captured speech is followed by steady silence. */
export class SpeechSilenceDetector {
  private hasSpeech = false;
  private silenceStartedAt: number | null = null;

  constructor(
    private readonly speechThreshold = 0.008,
    private readonly silenceDurationMs = 1000,
  ) {}

  update(rms: number, nowMs: number): boolean {
    if (!Number.isFinite(rms) || rms < 0 || !Number.isFinite(nowMs)) return false;
    if (rms >= this.speechThreshold) {
      this.hasSpeech = true;
      this.silenceStartedAt = null;
      return false;
    }
    if (!this.hasSpeech) return false;
    if (this.silenceStartedAt === null) {
      this.silenceStartedAt = nowMs;
      return false;
    }
    return nowMs - this.silenceStartedAt >= this.silenceDurationMs;
  }
}
