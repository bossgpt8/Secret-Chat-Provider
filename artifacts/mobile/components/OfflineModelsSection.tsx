import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import { useAssistant } from "@/context/AssistantContext";
import {
  NativeOfflineModels,
  NativePiper,
  OFFLINE_MODELS,
  type DownloadProgress,
  type OfflineModelDefinition,
} from "@/modules/OfflineModels";

type ColorSet = {
  background: string;
  card: string;
  border: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  primary: string;
  destructive: string;
  accent: string;
};

const STATUS_PENDING = 1;
const STATUS_RUNNING = 2;
const STATUS_PAUSED = 4;

function formatBytes(value: number): string {
  if (!value || value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function OfflineModelsSection({ colors }: { colors: ColorSet }) {
  const {
    offlineSttModelId,
    setOfflineSttModelId,
    offlineTtsModelId,
    setOfflineTtsModelId,
    setTtsProvider,
  } = useAssistant();
  const [openMenu, setOpenMenu] = useState<"stt" | "tts" | null>(null);
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Record<string, DownloadProgress>>({});
  const [activeIds, setActiveIds] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [testingPiper, setTestingPiper] = useState(false);

  const sttModels = useMemo(() => OFFLINE_MODELS.filter((m) => m.kind === "stt"), []);
  const ttsModels = useMemo(() => OFFLINE_MODELS.filter((m) => m.kind === "tts"), []);

  useEffect(() => {
    if (!NativeOfflineModels.isAvailable) return;
    let alive = true;
    Promise.all(OFFLINE_MODELS.map(async (model) => [model.id, await NativeOfflineModels.isDownloaded(model.fileName)] as const))
      .then((entries) => {
        if (alive) setDownloaded(Object.fromEntries(entries));
      })
      .catch(() => {});

    const removeProgress = NativeOfflineModels.onProgress((event) => {
      const model = OFFLINE_MODELS.find((m) => m.fileName === event.fileName);
      if (!model) return;
      setProgress((prev) => ({ ...prev, [model.id]: event }));
    });
    const removeComplete = NativeOfflineModels.onComplete((event) => {
      setActiveIds((prev) => {
        const next = { ...prev };
        for (const [id, value] of Object.entries(next)) {
          if (value === event.downloadId) delete next[id];
        }
        return next;
      });
      const model = OFFLINE_MODELS.find((m) => m.fileName === event.path.split("/").pop());
      if (model && event.success) setDownloaded((prev) => ({ ...prev, [model.id]: true }));
    });
    return () => {
      alive = false;
      removeProgress();
      removeComplete();
    };
  }, []);

  async function waitForFile(model: OfflineModelDefinition): Promise<boolean> {
    if (!NativeOfflineModels.isAvailable) return false;
    if (await NativeOfflineModels.isDownloaded(model.fileName)) return true;

    return new Promise<boolean>(async (resolve) => {
      let settled = false;
      let downloadId: number | null = null;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        remove();
        resolve(value);
      };
      const remove = NativeOfflineModels.onComplete((event) => {
        if (downloadId === null || event.downloadId !== downloadId) return;
        finish(event.success);
      });
      try {
        const result = await NativeOfflineModels.startDownload(model);
        if (result.alreadyExists) finish(true);
        else {
          downloadId = result.downloadId;
          setActiveIds((prev) => ({ ...prev, [model.id]: result.downloadId }));
        }
      } catch {
        finish(false);
      }
    });
  }

  async function download(model: OfflineModelDefinition) {
    if (!NativeOfflineModels.isAvailable) {
      Alert.alert("Android build required", "Offline model downloads are available in the installed Android build, not the web preview.");
      return;
    }
    if (busy[model.id]) return;
    setBusy((prev) => ({ ...prev, [model.id]: true }));
    Haptics.selectionAsync();
    try {
      const mainOk = await waitForFile(model);
      if (!mainOk) throw new Error("The download did not complete.");

      if (model.configFileName && model.configUrl) {
        const configModel: OfflineModelDefinition = {
          ...model,
          id: `${model.id}-config`,
          fileName: model.configFileName,
          url: model.configUrl,
          configFileName: undefined,
          configUrl: undefined,
        };
        // Piper is usable only when its ONNX config arrives too.
        const configOk = await waitForFile(configModel);
        if (!configOk) throw new Error("The voice configuration download did not complete.");
      }

      setDownloaded((prev) => ({ ...prev, [model.id]: true }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert("Download paused or failed", "Vox will keep the partial download when Android can resume it. Check your connection and try again.");
    } finally {
      setBusy((prev) => ({ ...prev, [model.id]: false }));
    }
  }

  function selectedLabel(kind: "stt" | "tts") {
    const id = kind === "stt" ? offlineSttModelId : offlineTtsModelId;
    return OFFLINE_MODELS.find((m) => m.id === id)?.label ?? `Choose a ${kind === "stt" ? "Whisper" : "Piper"} model`;
  }

  function choose(model: OfflineModelDefinition) {
    setOpenMenu(null);
    if (model.kind === "stt") setOfflineSttModelId(model.id);
    else {
      setOfflineTtsModelId(model.id);
      // Selecting an offline voice should not leave the app silently using
      // Kokoro/ElevenLabs. The user can still switch providers in Voice Output.
      setTtsProvider("piper");
    }
  }

  async function testPiperVoice() {
    const model = OFFLINE_MODELS.find((item) => item.id === offlineTtsModelId && item.kind === "tts");
    if (!model?.configFileName) {
      Alert.alert("Choose a Piper voice", "Select a downloaded Piper voice from the Offline voice dropdown first.");
      return;
    }
    if (!NativePiper.isAvailable) {
      Alert.alert("Android build required", "Piper voice playback is available in the installed Android build, not Expo Go or the web preview.");
      return;
    }
    setTestingPiper(true);
    try {
      const modelPath = await NativeOfflineModels.getPath(model.fileName);
      const configPath = await NativeOfflineModels.getPath(model.configFileName);
      if (!modelPath || !configPath) throw new Error("The ONNX voice or its configuration is not downloaded.");
      const wavPath = await NativePiper.synthesize(
        "Hello. This is Vox speaking with the downloaded Piper voice, completely offline.",
        modelPath,
        configPath,
      );
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: wavPath.startsWith("file://") ? wavPath : `file://${wavPath}` },
        { shouldPlay: true, volume: 1 },
      );
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          setTestingPiper(false);
        }
      });
    } catch (error) {
      setTestingPiper(false);
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert("Piper could not speak", message || "The native Piper synthesis failed. Rebuild the Android app after installing the latest Vox changes.");
    }
  }

  function ModelPicker({ kind, models }: { kind: "stt" | "tts"; models: OfflineModelDefinition[] }) {
    return (
      <View style={[styles.block, { borderBottomColor: colors.border }]}>
        <Text style={[styles.label, { color: colors.foreground }]}>
          {kind === "stt" ? "Offline speech recognition" : "Offline voice"}
        </Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          {kind === "stt"
            ? "Whisper runs on the phone and turns your recording into text without uploading audio."
            : "Piper generates speech on the phone. It uses a downloaded voice and does not need the cloud."}
        </Text>
        <Pressable
          style={[styles.picker, { backgroundColor: colors.background, borderColor: colors.border }]}
          onPress={() => setOpenMenu(openMenu === kind ? null : kind)}
        >
          <Text numberOfLines={1} style={[styles.pickerText, { color: colors.foreground }]}>{selectedLabel(kind)}</Text>
          <Ionicons name={openMenu === kind ? "chevron-up" : "chevron-down"} size={15} color={colors.mutedForeground} />
        </Pressable>
        {openMenu === kind && (
          <View style={[styles.menu, { backgroundColor: colors.background, borderColor: colors.border }]}>
            {models.map((model) => {
              const selected = (kind === "stt" ? offlineSttModelId : offlineTtsModelId) === model.id;
              return (
                <Pressable key={model.id} style={[styles.option, { borderBottomColor: colors.border }]} onPress={() => choose(model)}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: colors.foreground }]}>{model.label}</Text>
                    <Text style={[styles.description, { color: colors.mutedForeground }]}>{model.description}</Text>
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={19} color={colors.primary} />}
                </Pressable>
              );
            })}
          </View>
        )}
        {models.map((model) => {
          const event = progress[model.id];
          const isBusy = !!busy[model.id];
          const isDownloaded = downloaded[model.id];
          const pct = event ? Math.round(event.progress * 100) : 0;
          const paused = event?.status === STATUS_PAUSED;
          return (
            <View key={model.id} style={styles.downloadRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.description, { color: colors.mutedForeground }]}>
                  {model.label} · {model.sizeLabel}
                </Text>
                {isBusy && (
                  <>
                    <View style={[styles.track, { backgroundColor: colors.muted }]}>
                      <View style={[styles.fill, { width: `${Math.max(2, pct)}%`, backgroundColor: colors.primary }]} />
                    </View>
                    <Text style={[styles.progressText, { color: paused ? colors.accent : colors.mutedForeground }]}>
                      {paused ? "Waiting for connection — Android will resume automatically" : event?.totalBytes ? `${formatBytes(event.downloadedBytes)} of ${formatBytes(event.totalBytes)}` : "Starting download…"}
                    </Text>
                  </>
                )}
              </View>
              <Pressable
                style={[styles.downloadButton, { backgroundColor: isDownloaded ? colors.primary + "18" : colors.primary }]}
                onPress={() => isDownloaded ? Alert.alert("Model downloaded", "This model is ready for offline use.") : download(model)}
                disabled={isBusy}
              >
                {isBusy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: isDownloaded ? colors.primary : "#fff", fontSize: 12, fontWeight: "600" }}>{isDownloaded ? "Ready" : "Download"}</Text>}
              </Pressable>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.intro, { borderBottomColor: colors.border }]}>
        <Ionicons name="cloud-offline-outline" size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.foreground }]}>Offline voice models</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            Download once over Wi-Fi or mobile data. Android pauses and resumes interrupted downloads instead of starting over.
          </Text>
        </View>
      </View>
      {Platform.OS === "web" && (
        <Text style={[styles.webNote, { color: colors.accent }]}>Install the Android build to download and run these models on-device.</Text>
      )}
      <ModelPicker kind="stt" models={sttModels} />
      <ModelPicker kind="tts" models={ttsModels} />
      <View style={[styles.testRow, { borderTopColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.foreground }]}>Test offline Piper</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            This plays a short local sentence without contacting the server.
          </Text>
        </View>
        <Pressable
          style={[styles.downloadButton, { backgroundColor: colors.primary }]}
          onPress={testPiperVoice}
          disabled={testingPiper}
        >
          {testingPiper ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Test</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  block: { padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 14, fontWeight: "600" },
  description: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  picker: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  pickerText: { flex: 1, fontSize: 13 },
  menu: { borderWidth: 1, borderRadius: 10, marginTop: 6, overflow: "hidden" },
  option: { flexDirection: "row", alignItems: "center", gap: 10, padding: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  downloadRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 13 },
  downloadButton: { minWidth: 66, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 9 },
  track: { height: 5, borderRadius: 3, marginTop: 7, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  progressText: { fontSize: 10, marginTop: 4 },
  webNote: { padding: 12, fontSize: 12, lineHeight: 17 },
  testRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderTopWidth: StyleSheet.hairlineWidth },
});