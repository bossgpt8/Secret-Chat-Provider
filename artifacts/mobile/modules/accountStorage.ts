import AsyncStorage from "@react-native-async-storage/async-storage";

// Deliberate allowlist: never back up notifications, recordings, permissions,
// credentials, pairing, API URLs, or device identifiers.
export const CLOUD_KEYS = [
  "@vox_assistant_name", "@vox_conversations", "@vox_phone_voice_id",
  "@vox_el_voice_id", "@vox_kokoro_voice_id", "@vox_speech_rate",
  "@vox_tts_provider", "@vox_theme", "@vox_personality",
  "@vox_quick_chips", "@vox_speech_language",
] as const;
const listeners = new Set<() => void>();
export const canonicalEntries = (entries: Record<string, string>) =>
  JSON.stringify(Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))));
export const onAccountStorageChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
let activeScope = "guest";
export function setStorageScope(scope: string) { activeScope = scope; }
export function accountKey(key: string, scope: string) {
  return scope === "guest" ? key : `@vox_account:${scope}:${key}`;
}
export async function readAccountEntries(scope: string): Promise<Record<string, string>> {
  const values = await AsyncStorage.multiGet(CLOUD_KEYS.map(key => accountKey(key, scope)));
  return Object.fromEntries(values.flatMap(([, value], index) => value === null ? [] : [[CLOUD_KEYS[index], value]]));
}
export async function writeAccountEntries(scope: string, entries: Record<string, string>) {
  const pairs = CLOUD_KEYS.filter(key => entries[key] !== undefined).map(key => [accountKey(key, scope), entries[key]] as [string, string]);
  await AsyncStorage.multiSet(pairs);
  await AsyncStorage.multiRemove(CLOUD_KEYS.filter(key => entries[key] === undefined).map(key => accountKey(key, scope)));
}
// Capture the scope before every asynchronous write. An old account's pending
// write must never land in the account that just signed in.
export function scopedStorage(scope: string) {
  const privateKeys = new Set<string>([...CLOUD_KEYS, "@vox_user_profile", "@vox_notes", "@vox_todos", "@vox_favorites"]);
  const map = (key: string) => privateKeys.has(key) ? accountKey(key, scope) : key;
  const notify = () => { if (scope === activeScope) listeners.forEach(fn => fn()); };
  return {
    getItem: (key: string) => AsyncStorage.getItem(map(key)),
    multiGet: async (keys: string[]) => (await AsyncStorage.multiGet(keys.map(map))).map(([, value], i) => [keys[i], value] as [string, string | null]),
    setItem: async (key: string, value: string) => { await AsyncStorage.setItem(map(key), value); if (CLOUD_KEYS.includes(key as typeof CLOUD_KEYS[number])) notify(); },
    removeItem: async (key: string) => { await AsyncStorage.removeItem(map(key)); notify(); },
    multiSet: async (pairs: [string, string][]) => { await AsyncStorage.multiSet(pairs.map(([key, value]) => [map(key), value])); notify(); },
    multiRemove: async (keys: string[]) => { await AsyncStorage.multiRemove(keys.map(map)); notify(); },
  };
}
