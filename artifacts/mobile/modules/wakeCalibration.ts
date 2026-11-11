import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { NativeWakeWord } from "./NativeWakeWord";
import type { WakeTrial } from "./qualityTypes";

type Environment = WakeTrial["environment"];
interface Snapshot { active: boolean; environment: Environment; deadlineMs: number; trials: WakeTrial[]; detail: string }
const KEY = "@vox_wake_trials";
const listeners = new Set<() => void>();
let snapshot: Snapshot = { active: false, environment: "quiet", deadlineMs: 0, trials: [], detail: "No recognition measurements yet." };
let hydrated: Promise<void> | null = null;
let initialCount = 0;
let startedAt = 0;
let trialName = "";
let ignoredWindow: [number, number] = [0, 0];
let timer: ReturnType<typeof setTimeout> | null = null;
let finishing: Promise<void> | null = null;
const publish = (value: Partial<Snapshot>) => { snapshot = { ...snapshot, ...value }; listeners.forEach(listener => listener()); };
function hydrate() {
  return hydrated ??= AsyncStorage.getItem(KEY).then(value => {
    const parsed: unknown = value ? JSON.parse(value) : [];
    if (!Array.isArray(parsed)) throw new Error("Stored wake measurements are invalid. Clear them before testing.");
    const trials = parsed.filter((v): v is WakeTrial =>
      ["quiet", "noise", "screen-off"].includes(v?.environment) &&
      typeof v.assistantName === "string" &&
      [v.hits, v.misses, v.falseWakes].every(n => Number.isSafeInteger(n) && n >= 0)).slice(-30);
    publish({ trials });
  });
}
async function record(environment: Environment, kind: "hits" | "misses" | "falseWakes", assistantName: string) {
  const trials = [...snapshot.trials];
  const index = trials.findIndex(trial => trial.environment === environment && trial.assistantName === assistantName);
  const trial = index < 0 ? { environment, assistantName, hits: 0, misses: 0, falseWakes: 0 } : trials[index];
  const updated = { ...trial, [kind]: trial[kind] + 1 };
  if (index < 0) trials.push(updated); else trials[index] = updated;
  await AsyncStorage.setItem(KEY, JSON.stringify(trials.slice(-30)));
  publish({ trials: trials.slice(-30) });
}
export const getWakeCalibration = () => snapshot;
export function subscribeWakeCalibration(listener: () => void) {
  listeners.add(listener);
  void hydrate().catch(error => publish({ detail: String(error) }));
  return () => { listeners.delete(listener); };
}
export const isWakeCalibrating = (detectedAt = Date.now()) => snapshot.active ||
  (detectedAt >= ignoredWindow[0] && detectedAt <= ignoredWindow[1]);
export async function beginWakeTrial(environment: Environment) {
  if (snapshot.active || finishing) throw new Error("Finish the current wake trial first.");
  if (!NativeWakeWord.isAvailable) throw new Error("Wake calibration needs the updated Android APK.");
  await hydrate();
  const status = await NativeWakeWord.status();
  if (!status.enabled || status.state !== "listening") throw new Error("Enable the wake listener and wait for Listening before testing.");
  if (typeof status.detections !== "number" || !status.assistantName) throw new Error("Install the updated APK with native wake measurements first.");
  trialName = status.assistantName;
  initialCount = status.detections;
  startedAt = Date.now();
  publish({ active: true, environment, deadlineMs: startedAt + (environment === "screen-off" ? 30000 : 10000),
    detail: "Say the configured wake phrase once. Conversation opening is suppressed during this trial." });
  timer = setTimeout(() => { void finishWakeTrial().catch(error => publish({ detail: String(error) })); }, snapshot.deadlineMs - startedAt);
}
export function finishWakeTrial(): Promise<void> {
  if (finishing) return finishing;
  if (!snapshot.active) return Promise.resolve();
  finishing = (async () => {
    const deadline = Math.min(snapshot.deadlineMs, Date.now());
    ignoredWindow = [startedAt, deadline];
    if (timer) clearTimeout(timer);
    timer = null;
    try {
      const status = await NativeWakeWord.status();
      if (!status.enabled || status.state === "error") throw new Error("Wake listening was interrupted; this trial was not counted.");
      if (status.assistantName !== trialName) throw new Error("The assistant name changed; this trial was not counted.");
      const hit = (status.detections ?? 0) > initialCount && (status.lastDetectionAt ?? 0) >= startedAt &&
        (status.lastDetectionAt ?? Infinity) <= deadline;
      await record(snapshot.environment, hit ? "hits" : "misses", trialName);
      publish({ detail: hit ? "The native detector heard this trial." : "No matching detection occurred within this trial." });
      // A detection pauses the engine for normal conversation handoff. Resume only
      // if calibration caused that pause; never override an error or user Stop.
      if ((status.detections ?? 0) > initialCount && status.state === "paused") await NativeWakeWord.start();
    } finally { publish({ active: false }); }
  })().finally(() => { finishing = null; });
  return finishing;
}
export async function markFalseWake(environment: Environment) {
  if (snapshot.active) throw new Error("Finish the expected-wake trial before marking an unwanted activation.");
  const status = await NativeWakeWord.status();
  if (!status.assistantName) throw new Error("Install the updated APK before recording wake measurements.");
  await hydrate(); await record(environment, "falseWakes", status.assistantName);
}
export async function clearWakeTrials() {
  if (snapshot.active) throw new Error("Finish the current trial first.");
  await AsyncStorage.removeItem(KEY);
  hydrated = Promise.resolve(); publish({ trials: [], detail: "Measurements cleared." });
}
NativeWakeWord.onWake(detectedAt => {
  if (snapshot.active && detectedAt >= startedAt && detectedAt <= snapshot.deadlineMs) {
    void finishWakeTrial().catch(error => publish({ detail: String(error) }));
  }
});
AppState.addEventListener("change", state => {
  if (state === "active" && snapshot.active && Date.now() >= snapshot.deadlineMs) {
    void finishWakeTrial().catch(error => publish({ detail: String(error) }));
  }
});
