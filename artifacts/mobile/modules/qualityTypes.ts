export interface QualitySnapshot {
  paired: boolean;
  expiresAt?: string;
  memoryEnabled: boolean;
  automaticMemory: boolean;
}
export interface PrivateMemory {
  id: string;
  fact: string;
  category: string;
}
export interface VoiceDiagnostic {
  id: string;
  stage: string;
  elapsedMs: number;
  at: number;
}
export interface WakeTrial {
  assistantName: string;
  environment: "quiet" | "noise" | "screen-off";
  hits: number;
  misses: number;
  falseWakes: number;
}
