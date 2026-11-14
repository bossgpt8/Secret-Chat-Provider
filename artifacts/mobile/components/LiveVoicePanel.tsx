import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Audio } from "expo-av";
import * as SecureStore from "expo-secure-store";
import { pairLiveDevice, createLiveToken, setBaseUrl } from "@workspace/api-client-react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { NativeLiveAudio } from "@/modules/NativeLiveAudio";
import { LiveSession, type LivePhase, type LiveSocket, type LiveTurn } from "@/modules/liveSession";
import { NativeScreenCapture } from "@/modules/NativeScreenCapture";
import { NativeOverlay } from "@/modules/NativeOverlay";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";

const PAIRING_KEY = "vox.live.pairing";
interface Props {
  getApiBase: () => Promise<string>;
  history: Array<{ role: string; content: string }>;
  executeTool: (name: string, params: Record<string, unknown>, signal: AbortSignal) => Promise<string | undefined>;
  onTurn: (turn: LiveTurn) => void;
  onClose: () => void;
}

export function LiveVoicePanel(props: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const latest = useRef(props); latest.current = props;
  const mounted = useRef(true);
  const client = useRef<LiveSession | null>(null);
  const request = useRef<AbortController | null>(null);
  const starting = useRef(false);
  const [phase, setPhase] = useState<LivePhase>("ended");
  const [detail, setDetail] = useState("Your current voice mode remains available.");
  const [paired, setPaired] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [expires, setExpires] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [visual, setVisual] = useState<"none" | "screen" | "camera">("none");
  const visualRef = useRef<"none" | "screen" | "camera">("none");
  const camera = useRef<CameraView | null>(null);
  const cameraReady = useRef(false);
  const [cameraPermission, requestCamera] = useCameraPermissions();
  const backgroundAllowed = useRef(false);
  const [sessionLimit, setSessionLimit] = useState(600);
  const active = phase === "connecting" || phase === "listening" || phase === "speaking";

  async function apiBase() {
    const base = (await latest.current.getApiBase()).replace(/\/+$/, "");
    const url = new URL(base);
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname)) {
      throw new Error("Use an HTTPS API URL before pairing Live mode.");
    }
    if (!base.endsWith("/api")) throw new Error("The API URL in Settings must end in /api.");
    setBaseUrl(base.slice(0, -4));
    return base;
  }
  async function storedPairing(base: string): Promise<string | null> {
    const stored = await SecureStore.getItemAsync(PAIRING_KEY);
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored);
      return parsed.base === base && Date.parse(parsed.expiresAt) > Date.now() &&
        typeof parsed.credential === "string" ? parsed.credential : null;
    } catch { return null; }
  }
  function report(error: unknown) {
    if (!mounted.current) return;
    void client.current?.stop(error instanceof Error ? error.message : "Live mode failed.", true);
    backgroundAllowed.current = false;
    void NativeOverlay.stopConversation();
    void stopVisual();
    setPhase("error");
    setDetail(error instanceof Error ? error.message : "Live mode failed. Current voice mode is still available.");
  }
  useEffect(() => {
    mounted.current = true;
    if (NativeLiveAudio.isAvailable) {
      void apiBase().then(storedPairing).then(token => {
        if (mounted.current) setPaired(Boolean(token));
      }).catch(report);
    }
    const subscription = AppState.addEventListener("change", state => {
      if (state !== "active" && visualRef.current === "camera") void stopVisual();
      if (state !== "active" && !backgroundAllowed.current) {
        request.current?.abort();
        void client.current?.stop("Live stopped because Vox left the foreground.");
      }
    });
    return () => {
      mounted.current = false;
      request.current?.abort();
      subscription.remove();
      void client.current?.stop();
      void NativeOverlay.stopConversation();
      if (visualRef.current === "screen") void NativeScreenCapture.stopCapture();
    };
  }, []);
  useEffect(() => {
    if (!active || visual === "none") return;
    let pending = false, cancelled = false;
    const timer = setInterval(() => {
      if (pending) return;
      pending = true;
      void (async () => {
        const jpeg = visual === "screen" ? await NativeScreenCapture.captureFrame() :
          cameraReady.current ? (await camera.current?.takePictureAsync({ base64: true, quality: 0.35, skipProcessing: true }))?.base64 : null;
        if (!cancelled && jpeg) client.current?.sendVideoFrame(jpeg);
      })().catch(error => {
        if (!cancelled) { setDetail(error instanceof Error ? error.message : "Visual sharing stopped."); void stopVisual(); }
      }).finally(() => { pending = false; });
    }, 1100);
    return () => { cancelled = true; clearInterval(timer); };
  }, [visual, active]);
  useEffect(() => NativeOverlay.onAction(action => {
    if (action === "end") { request.current?.abort(); void client.current?.stop(); }
    if (action === "mic") {
      setMuted(old => { const next = !old; void client.current?.setMuted(next).catch(report); return next; });
    }
    if (action === "screen") setDetail("Open Gemini Live in Vox and tap Share screen to grant screen capture.");
  }), []);
  async function stopVisual() {
    const previous = visualRef.current;
    visualRef.current = "none"; setVisual("none"); cameraReady.current = false;
    if (previous === "screen") await NativeScreenCapture.stopCapture();
  }
  async function shareScreen() {
    await stopVisual();
    if (!NativeScreenCapture.isAvailable) throw new Error("Screen sharing requires the updated Android APK.");
    if (await NativeScreenCapture.startCapture()) { visualRef.current = "screen"; setVisual("screen"); }
  }
  async function shareCamera() {
    await stopVisual();
    const permission = cameraPermission?.granted ? cameraPermission : await requestCamera();
    if (!permission.granted) throw new Error("Allow camera access to share your camera.");
    visualRef.current = "camera"; setVisual("camera");
  }
  async function shareImage() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, base64: true, quality: 0.6 });
    const image = result.assets?.[0]?.base64;
    if (!result.canceled && image && !client.current?.sendVideoFrame(image)) throw new Error("Image could not be sent. Try a smaller image while Live is connected.");
  }
  useEffect(() => {
    if (!expires || !active) return;
    const update = () => setSeconds(Math.max(0, Math.ceil((expires - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 500);
    return () => clearInterval(timer);
  }, [expires, active]);

  async function pair() {
    if (starting.current) return;
    starting.current = true; setBusy(true);
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const base = await apiBase();
      const result = await pairLiveDevice({ code: code.trim() }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      await SecureStore.setItemAsync(PAIRING_KEY, JSON.stringify({ base, ...result }));
      if (mounted.current) {
        setPaired(true); setCode(""); setPhase("ended");
        setDetail("Paired securely. Start Live when you are ready.");
      }
    } catch (error) {
      report(controller.signal.aborted ? new Error("Pairing timed out or was cancelled. Try again.") : error);
    }
    finally { clearTimeout(timeout); starting.current = false; if (mounted.current) setBusy(false); }
  }
  async function connect() {
    if (starting.current || !NativeLiveAudio.isAvailable) return;
    starting.current = true; setBusy(true);
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) throw new Error("Microphone permission is required. Open app settings to grant it.");
      const base = await apiBase();
      const credential = await storedPairing(base);
      if (!credential) { setPaired(false); throw new Error("Pair this device with the VM before starting Live."); }
      const token = await createLiveToken({ headers: { Authorization: `Bearer ${credential}` }, signal: controller.signal });
      if (controller.signal.aborted) return;
      await client.current?.stop();
      if (controller.signal.aborted) return;
      setMuted(false); setInput(""); setOutput(""); setExpires(Date.parse(token.expiresAt));
      setDetail("Speak naturally. You can interrupt Vox while it responds.");
      backgroundAllowed.current = await NativeOverlay.startConversation();
      setSessionLimit(token.sessionSeconds);
      const session = new LiveSession({
        audio: NativeLiveAudio,
        socket: url => {
          const socket = new WebSocket(url);
          socket.binaryType = "arraybuffer";
          return socket as unknown as LiveSocket;
        },
        onPhase: (next, message) => {
          if (!mounted.current) return;
          setPhase(next); if (message) setDetail(message);
          void NativeOverlay.setState(next === "speaking" ? "speaking" : next === "listening" ? "listening" : "idle");
          if (next === "ended" || next === "error") {
            backgroundAllowed.current = false; void NativeOverlay.stopConversation(); void stopVisual();
          }
        },
        onTranscript: (heard, spoken) => {
          if (mounted.current) { setInput(heard); setOutput(spoken); void NativeOverlay.setContent(spoken, true); }
        },
        onTurn: turn => latest.current.onTurn(turn),
        executeTool: (name, args, signal) => latest.current.executeTool(name, args, signal),
      });
      client.current = session;
      session.start(token.token, token.setup, token.expiresAt, latest.current.history);
    } catch (error) {
      if ((error as { status?: number })?.status === 401) {
        setPaired(false);
        await SecureStore.deleteItemAsync(PAIRING_KEY).catch(() => {});
      }
      if (!controller.signal.aborted) report(error);
      else if (mounted.current) report(new Error("Live connection was cancelled or timed out. Try again."));
    } finally {
      clearTimeout(timeout);
      starting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function close() {
    request.current?.abort();
    await client.current?.stop();
    await stopVisual();
    latest.current.onClose();
  }
  const button = (label: string, action: () => void, disabled = false, primary = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      disabled={disabled} onPress={action}
      style={{ padding: 15, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
        backgroundColor: primary ? colors.primary : colors.card, opacity: disabled ? 0.45 : 1 }}>
      <Text style={{ color: primary ? colors.background : colors.foreground, textAlign: "center", fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
  return (
    <Modal visible animationType="slide" onRequestClose={() => { void close(); }}>
      <View style={{ flex: 1, backgroundColor: colors.background,
        paddingTop: Platform.OS === "web" ? 67 : insets.top,
        paddingBottom: Platform.OS === "web" ? 34 : insets.bottom }}>
        <ScrollView contentContainerStyle={{ padding: 22, gap: 18 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: colors.foreground, fontSize: 28, fontWeight: "700" }}>Gemini Live</Text>
          <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>
            Real-time audio, separate from your current voice mode. Live does not use Piper or Whisper.
          </Text>
          <Text style={{ color: colors.mutedForeground, lineHeight: 20 }}>
            For reliable interruptions, use headphones if Vox hears its own speaker. Echo handling varies by phone.
          </Text>
          {!NativeLiveAudio.isAvailable ? (
            <Text style={{ color: colors.foreground, lineHeight: 22 }}>
              Install the updated Android APK to use Live audio. This native audio path is not available in Expo Go, iOS or the browser preview.
            </Text>
          ) : <>
            <View style={{ backgroundColor: colors.card, padding: 16, borderRadius: 14, gap: 8 }}>
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>Limited sessions · up to {Math.round(sessionLimit / 60)} minutes</Text>
              <Text style={{ color: colors.mutedForeground, lineHeight: 20 }}>
                Uses your Google API quota and may incur charges if billing is enabled. Free-tier audio may be used to improve Google products. There is no automatic paid-provider fallback. App limits are not a billing cap.
              </Text>
            </View>
            {!paired && <>
              <Text style={{ color: colors.foreground, lineHeight: 22 }}>
                Pair once using a short-lived code generated on your VM. Never enter your Gemini API key here.
              </Text>
              <TextInput testID="live-pairing-code" accessibilityLabel="VM Live pairing code"
                placeholder="VM pairing code" placeholderTextColor={colors.mutedForeground}
                value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false}
                secureTextEntry maxLength={32}
                style={{ color: colors.foreground, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 16 }} />
              {button("Pair this device", () => { void pair(); }, busy || code.trim().length < 12, true)}
            </>}
            <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground, fontSize: 20, fontWeight: "600" }}>
              {phase === "connecting" ? "Connecting…" : phase === "speaking" ? "Vox is speaking" :
                phase === "listening" ? muted ? "Microphone muted" : "Listening…" : "Live is stopped"}
              {active && expires ? ` · ${seconds}s` : ""}
            </Text>
            <Text style={{ color: phase === "error" ? colors.destructive : colors.mutedForeground, lineHeight: 22 }}>{detail}</Text>
            {!!input && <Text style={{ color: colors.foreground, lineHeight: 24 }}>You: {input}</Text>}
            {!!output && <Text style={{ color: colors.foreground, lineHeight: 24 }}>Vox: {output}</Text>}
            {busy && <ActivityIndicator color={colors.primary} />}
            {!active && paired && button(phase === "error" ? "Reconnect Live" : "Start Gemini Live", () => { void connect(); }, busy, true)}
            {active && <>
              {visual !== "none" && <Text accessibilityLiveRegion="polite" style={{ color: colors.primary }}>
                {visual === "screen" ? "Screen sharing is on · images sent to Google" : "Camera sharing is on · images sent to Google"}
              </Text>}
              {visual === "camera" && <CameraView ref={camera} facing="back"
                onCameraReady={() => { cameraReady.current = true; }}
                onMountError={() => { setDetail("Camera unavailable."); void stopVisual(); }}
                style={{ height: 180, borderRadius: 16 }} />}
              {visual === "none" ? <>
                {button("Share screen with Live", () => { void shareScreen().catch(error => setDetail(error instanceof Error ? error.message : "Screen sharing could not start.")); }, phase === "connecting")}
                {button("Share camera with Live", () => { void shareCamera().catch(error => setDetail(error instanceof Error ? error.message : "Camera sharing could not start.")); }, phase === "connecting")}
              </> : button("Stop visual sharing", () => { void stopVisual().catch(report); })}
              {button("Attach or crop an image", () => { void shareImage().catch(error => setDetail(error instanceof Error ? error.message : "Image could not be sent.")); }, phase === "connecting")}
              {button(muted ? "Unmute microphone" : "Mute microphone", () => {
                const next = !muted;
                void client.current?.setMuted(next).then(() => setMuted(next)).catch(report);
              }, phase === "connecting")}
              {button("Interrupt and listen", () => { void client.current?.interrupt().catch(report); }, phase === "connecting")}
              {button("End Live session", () => { request.current?.abort(); void client.current?.stop(); })}
            </>}
            {button("Open app permissions", () => { void Linking.openSettings(); }, active)}
            {paired && !active && button("Forget this phone’s pairing", () => {
              void SecureStore.deleteItemAsync(PAIRING_KEY).then(() => setPaired(false)).catch(report);
            })}
          </>}
          {button("Back to current voice mode", () => { void close(); })}
        </ScrollView>
      </View>
    </Modal>
  );
}
