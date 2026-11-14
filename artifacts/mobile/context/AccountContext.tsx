import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { ClerkProvider, useAuth, useClerk } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { useQueryClient } from "@tanstack/react-query";
import { getAccountCloud, saveAccountCloud, deleteAccountCloud, setAuthTokenGetter } from "@workspace/api-client-react";
import { onAccountStorageChange, readAccountEntries, writeAccountEntries, setStorageScope, canonicalEntries } from "../modules/accountStorage";

interface AccountState {
  configured: boolean; userId: string | null; isLoaded: boolean;
  syncStatus: string; lastSyncedAt: string | null; error: string | null;
  syncNow: () => Promise<void>; importGuest: () => Promise<void>;
  deleteCloud: () => Promise<void>; signOut: () => Promise<void>;
  mergeCloud: () => Promise<void>;
  storageScope: string; storageEpoch: number;
}
const noop = async () => { throw new Error("Sign in to use cloud sync."); };
const guest: AccountState = { configured: false, userId: null, isLoaded: true,
  syncStatus: "Guest · saved on this phone", lastSyncedAt: null, error: null,
  syncNow: noop, importGuest: noop, mergeCloud: noop, deleteCloud: noop, signOut: async () => {},
  storageScope: "guest", storageEpoch: 0 };
const AccountContext = createContext<AccountState>(guest);
export const useAccount = () => useContext(AccountContext);
const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

function ConnectedAccount({ children }: { children: React.ReactNode }) {
  const { userId, isLoaded, getToken } = useAuth();
  const { signOut: clerkSignOut } = useClerk();
  const cache = useQueryClient();
  const scope = userId || "guest";
  const [syncStatus, setStatus] = useState(guest.syncStatus);
  const [lastSyncedAt, setLast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storageEpoch, setEpoch] = useState(0);
  const [hydratedScope, setHydratedScope] = useState<string | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const baseline = useRef<string | null>(null);
  const revision = useRef(0);
  const initialized = useRef(false);
  const latestScope = useRef(scope); latestScope.current = scope;
  const syncing = useRef<() => Promise<void>>(noop);
  const metaKey = (s: string) => `@vox_sync_meta:${s}`;
  useEffect(() => {
    if (Platform.OS !== "web") setAuthTokenGetter(() => getToken());
    return () => { if (Platform.OS !== "web") setAuthTokenGetter(null); };
  }, [getToken]);
  async function options() {
    const custom = await AsyncStorage.getItem("@vox_custom_api_url");
    const raw = custom || process.env.EXPO_PUBLIC_API_URL ||
      (Platform.OS === "web" ? `${window.location.origin}/api` : "https://vox.bossbot.me/api");
    const url = new URL(raw);
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname)) throw new Error("Cloud sync requires an HTTPS API URL.");
    if (url.username || url.password || url.search || url.hash || !url.pathname.replace(/\/$/, "").endsWith("/api")) throw new Error("Set a valid API server URL ending in /api.");
    const token = Platform.OS === "web" ? null : await getToken();
    return {
      baseUrl: raw.replace(/\/api\/?$/, ""), credentials: "include" as const,
      headers: { "X-Vox-Account": userId || "", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    };
  }
  async function syncNow() {
    if (!userId) throw new Error("Sign in to sync.");
    if (busy.current) throw new Error("A cloud operation is already running. Please wait.");
    const ownScope = scope, ownGeneration = generation.current;
    const valid = () => ownGeneration === generation.current && ownScope === latestScope.current;
    busy.current = true; setStatus("Syncing…"); setError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const opts = { ...await options(), signal: controller.signal };
      const local = await readAccountEntries(ownScope);
      const localText = canonicalEntries(local);
      const remote = await getAccountCloud(opts);
      if (!valid()) return;
      const firstRead = !initialized.current;
      if (firstRead) {
        const meta = await AsyncStorage.getItem(metaKey(ownScope));
        const parsed = meta ? JSON.parse(meta) : null;
        revision.current = parsed?.revision ?? 0;
        baseline.current = parsed?.baseline ?? JSON.stringify({});
        initialized.current = true;
      }
      const dirty = localText !== baseline.current;
      if (remote.revision !== revision.current) {
        if (dirty || !firstRead) throw new Error("Cloud data changed on another phone. Local changes are safe. Use Resolve cloud conflict to merge; nothing was overwritten.");
        await writeAccountEntries(ownScope, remote.entries);
        if (!valid()) return;
        baseline.current = canonicalEntries(remote.entries);
        revision.current = remote.revision;
        if (canonicalEntries(remote.entries) !== localText) setEpoch(value => value + 1);
      } else if (dirty) {
        const saved = await saveAccountCloud({ revision: remote.revision, entries: local }, opts);
        if (!valid()) return;
        baseline.current = localText;
        revision.current = saved.revision;
      }
      await AsyncStorage.setItem(metaKey(ownScope), JSON.stringify({ revision: revision.current, baseline: baseline.current }));
      if (!valid()) return;
      const time = new Date().toISOString();
      setLast(time); setStatus("Synced");
    } catch (e) {
      if (valid()) { setError(e instanceof Error ? e.message : "Cloud sync failed. Local data is safe."); setStatus("Not synced · retry available"); }
      throw e;
    } finally { clearTimeout(timeout); if (valid()) busy.current = false; }
  }
  syncing.current = syncNow;
  useEffect(() => {
    generation.current++; busy.current = false; initialized.current = false; baseline.current = null; revision.current = 0;
    setStorageScope(scope); cache.clear(); setError(null); setLast(null);
    setStatus(userId ? "Loading cloud copy…" : guest.syncStatus);
    if (!isLoaded || !userId) return;
    const ownScope = scope;
    void syncing.current().catch(() => {}).finally(() => {
      if (ownScope === latestScope.current) setHydratedScope(ownScope);
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onAccountStorageChange(() => {
      setStatus("Changes saved locally");
      clearTimeout(timer);
      timer = setTimeout(() => { void syncing.current().catch(() => {}); }, 3000);
    });
    const network = NetInfo.addEventListener(state => {
      if (state.isConnected && !busy.current) void syncing.current().catch(() => {});
    });
    const foreground = AppState.addEventListener("change", state => {
      if (state === "active" && !busy.current) void syncing.current().catch(() => {});
    });
    const interval = setInterval(() => { if (!busy.current && AppState.currentState === "active") void syncing.current().catch(() => {}); }, 60000);
    return () => { clearTimeout(timer); clearInterval(interval); off(); network(); foreground.remove(); generation.current++; };
  }, [scope, isLoaded]);
  async function importGuest() {
    if (!userId || busy.current) throw new Error("Wait for sync to finish before merging.");
    // Fetch/check revision before modifying the local account copy.
    await syncNow();
    const own = scope;
    const [local, imported] = await Promise.all([readAccountEntries(own), readAccountEntries("guest")]);
    const merged = { ...imported, ...local };
    const conversations = new Map<string, { id: string; updatedAt: number }>();
    for (const item of [...JSON.parse(imported["@vox_conversations"] || "[]"), ...JSON.parse(local["@vox_conversations"] || "[]")]) {
      const old = conversations.get(item.id);
      if (!old || item.updatedAt >= old.updatedAt) conversations.set(item.id, item);
    }
    merged["@vox_conversations"] = JSON.stringify([...conversations.values()].sort((a, b) => b.updatedAt - a.updatedAt));
    if (own !== latestScope.current) throw new Error("Account changed. Merge cancelled.");
    await writeAccountEntries(own, merged); setEpoch(value => value + 1);
    await syncNow();
  }
  async function deleteCloud() {
    if (!userId || busy.current) throw new Error("Wait for sync to finish before erasing.");
    busy.current = true;
    const own = scope;
    try {
      await deleteAccountCloud(await options());
      if (own !== latestScope.current) return;
      await writeAccountEntries(own, {});
      const erased = await getAccountCloud(await options());
      revision.current = erased.revision; baseline.current = canonicalEntries({});
      initialized.current = true;
      await AsyncStorage.setItem(metaKey(own), JSON.stringify({ revision: revision.current, baseline: baseline.current }));
      setEpoch(value => value + 1); setLast(null); setStatus("Cloud data erased"); setError(null);
    } finally { busy.current = false; }
  }
  async function mergeCloud() {
    if (!userId || busy.current) throw new Error("Wait for the current operation to finish.");
    busy.current = true;
    const own = scope;
    try {
      const opts = await options();
      const remote = await getAccountCloud(opts);
      const local = await readAccountEntries(own);
      const merged = { ...remote.entries, ...local };
      const byId = new Map<string, { id: string; updatedAt: number }>();
      for (const c of [...JSON.parse(remote.entries["@vox_conversations"] || "[]"), ...JSON.parse(local["@vox_conversations"] || "[]")]) {
        const previous = byId.get(c.id);
        if (!previous || c.updatedAt >= previous.updatedAt) byId.set(c.id, c);
      }
      merged["@vox_conversations"] = JSON.stringify([...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt));
      if (own !== latestScope.current) throw new Error("Account changed. Merge cancelled.");
      const saved = await saveAccountCloud({ revision: remote.revision, entries: merged }, opts);
      if (own !== latestScope.current) return;
      await writeAccountEntries(own, merged);
      revision.current = saved.revision; baseline.current = canonicalEntries(merged); initialized.current = true;
      await AsyncStorage.setItem(metaKey(own), JSON.stringify({ revision: revision.current, baseline: baseline.current }));
      setEpoch(value => value + 1); setError(null); setLast(new Date().toISOString()); setStatus("Synced");
    } finally { busy.current = false; }
  }
  return <AccountContext.Provider value={{ configured: true, userId: userId || null, isLoaded: Boolean(isLoaded && (!userId || hydratedScope === scope)),
    syncStatus, lastSyncedAt, error, syncNow, importGuest, deleteCloud,
    mergeCloud,
    signOut: async () => { generation.current++; await clerkSignOut(); cache.clear(); },
    storageScope: scope, storageEpoch }}>{children}</AccountContext.Provider>;
}
export function AccountProvider({ children }: { children: React.ReactNode }) {
  if (!publishableKey) return <AccountContext.Provider value={guest}>{children}</AccountContext.Provider>;
  return <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}
    proxyUrl={process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined}>
    <ConnectedAccount>{children}</ConnectedAccount>
  </ClerkProvider>;
}
