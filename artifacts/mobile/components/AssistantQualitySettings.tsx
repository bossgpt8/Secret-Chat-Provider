import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Switch, Text, TextInput, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import {
  clearVoiceDiagnostics, deletePrivateMemory, forgetPrivatePairing, getVoiceDiagnostics, listPrivateMemory,
  loadQualitySettings, pairPrivateDevice, savePrivateMemory, setMemoryPreferences, subscribeQuality, subscribeMemory,
} from "@/modules/assistantQuality";
import type { PrivateMemory, QualitySnapshot, VoiceDiagnostic } from "@/modules/qualityTypes";

interface Props { getApiBase: () => Promise<string>; deviceId: string }

const isWeb = Platform.OS === "web";
const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export function AssistantQualitySettings({ getApiBase, deviceId }: Props) {
  const colors = useColors();
  const [snapshot, setSnapshot] = useState<QualitySnapshot | null>(null);
  const [loadError, setLoadError] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [pairError, setPairError] = useState("");
  const [memories, setMemories] = useState<PrivateMemory[] | null>(null);
  const [memLoading, setMemLoading] = useState(false);
  const [memError, setMemError] = useState("");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [diagVersion, setDiagVersion] = useState(0);
  const refreshVersion = useRef(0);
  const running = useRef(false);

  const subscribe = useCallback((cb: () => void) => subscribeQuality(() => { setDiagVersion(v => v + 1); cb(); }), []);
  useSyncExternalStore(subscribe, () => diagVersion, () => diagVersion);
  const diagnostics: VoiceDiagnostic[] = getVoiceDiagnostics().slice(-12).reverse();

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    setSnapshot(null); setMemories(null);
    setLoadError("");
    try {
      const base = await getApiBase();
      const snap = await loadQualitySettings(base, deviceId);
      if (version !== refreshVersion.current) return;
      setSnapshot(snap);
      if (snap.paired) {
        setMemLoading(true); setMemError("");
        try { const values = await listPrivateMemory(base, deviceId); if (version === refreshVersion.current) setMemories(values); }
        catch (e) { if (version === refreshVersion.current) setMemError(errMsg(e, "Could not load memories.")); }
        finally { if (version === refreshVersion.current) setMemLoading(false); }
      } else setMemories(null);
    } catch (e) { if (version === refreshVersion.current) setLoadError(errMsg(e, "Could not load assistant settings.")); }
  }, [getApiBase, deviceId]);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeMemory(() => void refresh());
    return () => { refreshVersion.current++; unsubscribe(); };
  }, [refresh]);

  async function run(action: () => Promise<void>, onError: (m: string) => void, fallback: string) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try { await action(); await refresh(); }
    catch (e) { onError(errMsg(e, fallback)); }
    finally { running.current = false; setBusy(false); }
  }

  const pair = () => {
    const trimmed = code.trim();
    if (!trimmed) { setPairError("Enter the one-time pairing code."); return; }
    setPairError("");
    void run(async () => { await pairPrivateDevice(await getApiBase(), deviceId, trimmed); setCode(""); }, setPairError, "Pairing failed.");
  };
  const forget = () => Alert.alert("Forget VM pairing?", "Private cloud memory will be unavailable until you pair again. Local chat history stays on this phone.", [
    { text: "Cancel", style: "cancel" },
    { text: "Forget", style: "destructive", onPress: () => void run(forgetPrivatePairing, setPairError, "Could not forget pairing.") },
  ]);
  const setPrefs = (memoryEnabled: boolean, automatic: boolean) =>
    void run(() => setMemoryPreferences(memoryEnabled, memoryEnabled && automatic), setMemError, "Could not update memory preferences.");
  const add = () => {
    const fact = draft.trim(); if (!fact) return;
    void run(async () => { await savePrivateMemory(await getApiBase(), deviceId, fact); setDraft(""); }, setMemError, "Could not save memory.");
  };
  const saveEdit = () => {
    const fact = editText.trim(); if (!fact || !editingId) return;
    const id = editingId;
    void run(async () => { await savePrivateMemory(await getApiBase(), deviceId, fact, id); setEditingId(null); }, setMemError, "Could not update memory.");
  };
  const remove = (m: PrivateMemory) => Alert.alert("Delete memory?", `"${m.fact}" will be removed from saved memory. Existing chat messages are not deleted.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: () => void run(async () => deletePrivateMemory(await getApiBase(), deviceId, m.id), setMemError, "Could not delete memory.") },
  ]);

  const title = { color: colors.foreground, fontSize: 15, fontWeight: "600" as const };
  const muted = { color: colors.mutedForeground, fontSize: 13, lineHeight: 19 };
  const link = { color: colors.primary, fontWeight: "600" as const, paddingVertical: 8 };
  const input = { borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, color: colors.foreground, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 };
  const err = { color: colors.destructive, fontSize: 13 };
  const track = { false: colors.muted, true: colors.primary + "80" };

  const paired = !!snapshot?.paired;
  const expiry = snapshot?.expiresAt ? new Date(snapshot.expiresAt).toLocaleString() : null;

  return (
    <View testID="assistant-quality-settings" style={{ padding: 16, gap: 16 }}>
      <Text style={muted}>
        Older chat history on this phone is preserved. Private cloud data (memory) now requires pairing with your VM.
      </Text>

      <View style={{ gap: 8 }}>
        <Text style={title}>Private VM pairing</Text>
        {!snapshot && !loadError && <ActivityIndicator color={colors.primary} accessibilityLabel="Loading pairing status" />}
        {!!loadError && (
          <View style={{ gap: 4 }}>
            <Text testID="quality-load-error" style={err}>{loadError}</Text>
            <Pressable testID="quality-retry" accessibilityRole="button" onPress={() => void refresh()}><Text style={link}>Retry</Text></Pressable>
          </View>
        )}
        {snapshot && (
          <Text testID="pairing-status" accessibilityLiveRegion="polite" style={{ color: paired ? colors.accent : colors.mutedForeground, fontSize: 13 }}>
            {paired ? `Paired${expiry ? ` · expires ${expiry}` : ""}` : "Not paired"}
          </Text>
        )}
        {isWeb ? (
          <Text testID="pairing-unavailable-web" style={muted}>Pairing is unavailable on web because credentials cannot be stored securely here. Use the Android app.</Text>
        ) : snapshot && !paired ? (
          <View style={{ gap: 8 }}>
            <Text style={muted}>Run the create-live-pairing-code script on your VM and enter the one-time code. It is used once and is not an API key.</Text>
            <TextInput testID="pairing-code-input" accessibilityLabel="One-time pairing code" value={code} onChangeText={setCode}
              placeholder="Pairing code" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" autoCorrect={false}
              editable={!busy} onSubmitEditing={pair} style={input} />
            <Pressable testID="pairing-submit" accessibilityRole="button" accessibilityLabel="Pair device" disabled={busy} onPress={pair}>
              <Text style={[link, busy && { opacity: 0.5 }]}>{busy ? "Pairing…" : "Pair device"}</Text>
            </Pressable>
          </View>
        ) : paired ? (
          <Pressable testID="pairing-forget" accessibilityRole="button" accessibilityLabel="Forget VM pairing" disabled={busy} onPress={forget}>
            <Text style={{ color: colors.destructive, fontWeight: "600", paddingVertical: 8 }}>Forget pairing</Text>
          </Pressable>
        ) : null}
        {!!pairError && <Text testID="pairing-error" style={err}>{pairError}</Text>}
      </View>

      {snapshot && (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}><Text style={title}>Remember things I tell it</Text><Text style={muted}>Stored privately on your paired VM.</Text></View>
            <Switch testID="memory-toggle" accessibilityLabel="Enable memory" value={snapshot.memoryEnabled} disabled={busy || !paired}
              onValueChange={v => setPrefs(v, snapshot.automaticMemory)} trackColor={track}
              thumbColor={snapshot.memoryEnabled ? colors.primary : colors.mutedForeground} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}><Text style={title}>Automatic memory</Text><Text style={muted}>Let Vox save useful facts without asking. Requires memory.</Text></View>
            <Switch testID="automatic-memory-toggle" accessibilityLabel="Enable automatic memory" value={snapshot.memoryEnabled && snapshot.automaticMemory}
              disabled={busy || !paired || !snapshot.memoryEnabled} onValueChange={v => setPrefs(true, v)} trackColor={track}
              thumbColor={snapshot.automaticMemory ? colors.primary : colors.mutedForeground} />
          </View>
        </View>
      )}

      {paired && (
        <View style={{ gap: 8 }}>
          <Text style={title}>Saved memories</Text>
          {memLoading && <ActivityIndicator color={colors.primary} accessibilityLabel="Loading memories" />}
          {!!memError && (
            <View style={{ gap: 4 }}>
              <Text testID="memory-error" style={err}>{memError}</Text>
              <Pressable testID="memory-retry" accessibilityRole="button" onPress={() => void refresh()}><Text style={link}>Retry</Text></Pressable>
            </View>
          )}
          {memories && memories.length === 0 && !memLoading && <Text testID="memory-empty" style={muted}>Nothing saved yet.</Text>}
          {memories?.map(m => (
            <View key={m.id} testID={`memory-item-${m.id}`} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: colors.radius, padding: 12, gap: 6 }}>
              {editingId === m.id ? (
                <>
                  <TextInput testID={`memory-edit-input-${m.id}`} accessibilityLabel="Edit memory" value={editText} onChangeText={setEditText} multiline style={input} editable={!busy} />
                  <View style={{ flexDirection: "row", gap: 16 }}>
                    <Pressable testID={`memory-edit-save-${m.id}`} accessibilityRole="button" disabled={busy} onPress={saveEdit}><Text style={link}>Save</Text></Pressable>
                    <Pressable testID={`memory-edit-cancel-${m.id}`} accessibilityRole="button" onPress={() => setEditingId(null)}><Text style={[link, { color: colors.mutedForeground }]}>Cancel</Text></Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={{ color: colors.foreground, fontSize: 14 }}>{m.fact}</Text>
                  <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
                    {!!m.category && <Text style={[muted, { flex: 1 }]}>{m.category}</Text>}
                    <Pressable testID={`memory-edit-${m.id}`} accessibilityRole="button" accessibilityLabel={`Edit memory ${m.fact}`} disabled={busy}
                      onPress={() => { setEditingId(m.id); setEditText(m.fact); }}><Text style={link}>Edit</Text></Pressable>
                    <Pressable testID={`memory-delete-${m.id}`} accessibilityRole="button" accessibilityLabel={`Delete memory ${m.fact}`} disabled={busy}
                      onPress={() => remove(m)}><Text style={{ color: colors.destructive, fontWeight: "600", paddingVertical: 8 }}>Delete</Text></Pressable>
                  </View>
                </>
              )}
            </View>
          ))}
          <TextInput testID="memory-add-input" accessibilityLabel="New memory" value={draft} onChangeText={setDraft} placeholder="Add something to remember"
            placeholderTextColor={colors.mutedForeground} editable={!busy} onSubmitEditing={add} style={input} />
          <Pressable testID="memory-add" accessibilityRole="button" accessibilityLabel="Add memory" disabled={busy || !draft.trim()} onPress={add}>
            <Text style={[link, (!draft.trim() || busy) && { opacity: 0.5 }]}>Add memory</Text>
          </Pressable>
        </View>
      )}

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={[title, { flex: 1 }]}>Recent voice timings</Text>
          {diagnostics.length > 0 && (
            <Pressable testID="diagnostics-clear" accessibilityRole="button" accessibilityLabel="Clear voice diagnostics"
              onPress={() => { clearVoiceDiagnostics(); setDiagVersion(v => v + 1); }}><Text style={link}>Clear</Text></Pressable>
          )}
        </View>
        {diagnostics.length === 0 ? (
          <Text testID="diagnostics-empty" style={muted}>No voice turns recorded yet. Talk to Vox to see stage timings.</Text>
        ) : diagnostics.map(d => (
          <View key={d.id} testID={`diagnostic-${d.id}`} style={{ flexDirection: "row", gap: 8 }}>
            <Text style={{ color: colors.foreground, fontSize: 13, flex: 1 }}>{d.stage}</Text>
            <Text style={{ color: colors.foreground, fontSize: 13, fontVariant: ["tabular-nums"] }}>{`${Math.round(d.elapsedMs)} ms`}</Text>
            <Text style={[muted, { width: 72, textAlign: "right" }]}>{new Date(d.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
          </View>
        ))}
        <Text style={muted}>These are raw timings measured on this device. They do not prove real-phone reliability; no real-phone tests are established by them.</Text>
      </View>
    </View>
  );
}

export default AssistantQualitySettings;
