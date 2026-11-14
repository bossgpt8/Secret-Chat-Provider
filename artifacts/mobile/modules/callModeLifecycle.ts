/** One terminal callback per utterance; cancelled generations cannot restart a call. */
export function createSpeechCompletion(
  generation: number,
  currentGeneration: () => number,
  complete: () => void,
) {
  let finished = false;
  return () => {
    if (finished || generation !== currentGeneration()) return;
    finished = true;
    complete();
  };
}

export interface CallResumeState {
  enabled: boolean;
  liveOpen: boolean;
  busy: boolean;
  starting: boolean;
  nativeActive: boolean;
  nativeMode: "turn" | "barge";
  recording: boolean;
}

/** Decide only after reply/transcription settles, including late barge-in startup. */
export function callModeResumeAction(state: CallResumeState) {
  if (!state.enabled || state.liveOpen) return "stop";
  if (state.busy || state.starting) return "wait";
  if (state.nativeActive && state.nativeMode === "barge") return "cleanup-barge";
  if (state.nativeActive || state.recording) return "listening";
  return "start";
}
