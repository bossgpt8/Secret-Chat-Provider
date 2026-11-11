import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import {
  pairPrivateDevice as pair, listPrivateMemory as list,
  savePrivateMemory as save, updatePrivateMemory as update, deletePrivateMemory as remove,
  extractPrivateMemory as extract,
} from "@workspace/api-client-react";
import type { PrivateMemory, QualitySnapshot, VoiceDiagnostic } from "./qualityTypes";

const AUTH = "vox.private.pairing";
const MEMORY = "@vox_memory_opt_in";
const AUTOMATIC = "@vox_automatic_memory_opt_in";
const listeners = new Set<() => void>();
const memoryListeners = new Set<() => void>();
let diagnostics: VoiceDiagnostic[] = [];
const changed = (memory = false) => {
  listeners.forEach(listener => listener());
  if (memory) memoryListeners.forEach(listener => listener());
};
export const subscribeQuality = (listener: () => void) => {
  listeners.add(listener); return () => { listeners.delete(listener); };
};
export const subscribeMemory = (listener: () => void) => {
  memoryListeners.add(listener); return () => { memoryListeners.delete(listener); };
};
function normalizeBase(raw: string) {
  const base = raw.replace(/\/+$/, "");
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash) throw new Error("Use an API URL without embedded credentials, query strings or fragments.");
  if (url.protocol !== "https:" && !(url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname))) {
    throw new Error("Use an HTTPS API URL in Settings before pairing.");
  }
  if (!base.endsWith("/api")) throw new Error("The API URL must end in /api.");
  return base;
}
export async function loadQualitySettings(raw: string, deviceId: string): Promise<QualitySnapshot> {
  const [memory, automatic] = await AsyncStorage.multiGet([MEMORY, AUTOMATIC]);
  const result: QualitySnapshot = {
    paired: false, memoryEnabled: memory[1] === "true", automaticMemory: memory[1] === "true" && automatic[1] === "true",
  };
  if (Platform.OS === "web" || !deviceId) return result;
  const stored = await SecureStore.getItemAsync(AUTH);
  if (!stored) return result;
  try {
    const value = JSON.parse(stored);
    if (value.base === normalizeBase(raw) && value.deviceId === deviceId &&
        typeof value.credential === "string" && Date.parse(value.expiresAt) > Date.now()) {
      result.paired = true; result.expiresAt = value.expiresAt;
    }
  } catch { /* Invalid or old pairing is visibly treated as unpaired. */ }
  return result;
}
export async function privateHeaders(raw: string, deviceId: string): Promise<Record<string, string>> {
  if (Platform.OS === "web") return {};
  if (!(await loadQualitySettings(raw, deviceId)).paired) return {};
  const value = JSON.parse((await SecureStore.getItemAsync(AUTH))!);
  return { Authorization: `Bearer ${value.credential}`, "X-Device-Id": deviceId };
}
async function requestOptions(raw: string, deviceId: string) {
  const base = normalizeBase(raw);
  const headers = await privateHeaders(base, deviceId);
  if (!headers.Authorization) throw new Error("Pair this phone with your VM to use private cloud memory.");
  return { headers, signal: AbortSignal.timeout(15000), baseUrl: base.slice(0, -4) };
}
export async function pairPrivateDevice(raw: string, deviceId: string, code: string) {
  if (Platform.OS === "web") throw new Error("Pairing requires the installed app's secure credential storage.");
  const base = normalizeBase(raw);
  const options = { signal: AbortSignal.timeout(15000), baseUrl: base.slice(0, -4) };
  const value = await pair({ deviceId, code: code.trim() }, options);
  await SecureStore.setItemAsync(AUTH, JSON.stringify({ base, deviceId, ...value }));
  changed(true);
}
export async function forgetPrivatePairing() {
  if (Platform.OS !== "web") await SecureStore.deleteItemAsync(AUTH);
  await setMemoryPreferences(false, false);
}
export async function setMemoryPreferences(memoryEnabled: boolean, automaticMemory: boolean) {
  await AsyncStorage.multiSet([[MEMORY, String(memoryEnabled)], [AUTOMATIC, String(memoryEnabled && automaticMemory)]]);
  changed(true);
}
export async function listPrivateMemory(base: string, deviceId: string): Promise<PrivateMemory[]> {
  return (await list(await requestOptions(base, deviceId))).facts;
}
export async function savePrivateMemory(base: string, deviceId: string, fact: string, id?: string) {
  const options = await requestOptions(base, deviceId);
  if (id) await update(id, { fact }, options); else await save({ fact }, options);
  changed(true);
}
export async function deletePrivateMemory(base: string, deviceId: string, id: string) {
  await remove(id, await requestOptions(base, deviceId)); changed(true);
}
export async function extractAutomaticMemory(base: string, deviceId: string, userMessage: string, assistantMessage: string) {
  const prefs = await loadQualitySettings(base, deviceId);
  if (!prefs.paired || !prefs.memoryEnabled || !prefs.automaticMemory) return;
  const value = await extract({ userMessage: userMessage.slice(0, 8000),
    assistantMessage: assistantMessage.slice(0, 16000), automaticMemory: true }, await requestOptions(base, deviceId));
  if (value.facts.length) changed(true);
}
export function recordVoiceDiagnostic(id: string, stage: string, elapsedMs: number) {
  // Never retain transcripts, prompts, phone numbers, credentials or raw audio.
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;
  const at = Date.now();
  diagnostics = [...diagnostics, { id: `${id}:${stage}:${at}`, stage, elapsedMs: Math.round(elapsedMs), at }].slice(-120);
  changed();
}
export const getVoiceDiagnostics = () => diagnostics;
export function clearVoiceDiagnostics() { diagnostics = []; changed(); }
