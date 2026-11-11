import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useAssistant } from "@/context/AssistantContext";
import { NativeWakeWord } from "@/modules/NativeWakeWord";

/** Root-level lifecycle; do not depend on visiting the Settings or Chat tab. */
export function useWakeWordService() {
  const { isLoading, assistantName, wakeWordEnabled, setWakeWordEnabled } = useAssistant();
  const initialized = useRef(false);
  useEffect(() => {
    if (isLoading || !NativeWakeWord.isAvailable || initialized.current) return;
    initialized.current = true;
    // Old cloud-wake settings do not silently opt users into a new background mic.
    void NativeWakeWord.status().then(async status => {
      if (!wakeWordEnabled || !status.enabled) {
        if (wakeWordEnabled) await setWakeWordEnabled(false);
        if (status.running) await NativeWakeWord.stop();
      } else if (!status.running && AppState.currentState === "active") {
        await NativeWakeWord.startForName(assistantName);
      }
    }).catch(() => {});
  }, [isLoading, assistantName, wakeWordEnabled, setWakeWordEnabled]);

  useEffect(() => {
    if (!isLoading) void NativeWakeWord.setName(assistantName);
  }, [isLoading, assistantName]);

  useEffect(() => {
    if (!NativeWakeWord.isAvailable) return;
    const unsubscribe = NativeWakeWord.onStatus(status => {
      if (!status.enabled) void setWakeWordEnabled(false);
    });
    const sub = AppState.addEventListener("change", state => {
      if (state === "active") {
        // Respect notification Stop. Never restart just because Settings says on.
        void NativeWakeWord.status().then(status => {
          if (!status.enabled) void setWakeWordEnabled(false);
        });
      }
    });
    return () => { unsubscribe(); sub.remove(); };
  }, [setWakeWordEnabled]);
}
