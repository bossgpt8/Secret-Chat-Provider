---
name: Vox offline voice
description: Constraints and verification notes for the optional on-device Whisper and Piper voice paths.
---

Offline voice is an optional Android capability: native 16 kHz PCM recording feeds whisper.rn, while Piper uses downloaded ONNX weights and config; the existing cloud/phone paths remain the fallback.

**Why:** Audio-only offline support should not silently imply that the language model or chat backend is offline, and Expo's normal AAC/M4A recording is not the input format used by Whisper.cpp.

**How to apply:** Keep model selection and downloads explicit in Settings, preserve DownloadManager jobs by filename, and verify the generated Android project on a Java-enabled Android build/device before calling the feature production-ready. Piper pronunciation and smoothness require real-device listening; syntactically valid phoneme IDs do not establish audible quality. When maintaining Expo config plugins, keep the JavaScript entrypoint synchronized with the TypeScript source because prebuild executes the JavaScript file.

Do not automatically activate Piper in calls just because its model is downloaded; require an explicit Piper voice selection and use the lightweight Phone voice for local fallback.

**Why:** The user reported the app exiting with “Vox isn't responding” when Piper was used, and later reported repeated exits seconds after relaunching with Piper selected and downloaded. A downloaded model does not establish that the device can run it reliably alongside live audio and the UI.

**How to apply:** Keep Piper optional and session-only until its Android inference, playback, and repeated app launches are verified on a physical device. Do not re-enable automatic Piper startup on the strength of JavaScript fallbacks: process-fatal native failures bypass them. Do not equate successful TypeScript checks or a browser preview with native stability.

Piper's first use may spend substantial time creating the ONNX session before speech inference begins. Distinguish that cold start from synthesis with an already-loaded model; a longer cold-start budget does not prove native inference is healthy.

**Why:** The user showed the offline voice test timing out, while the native module already exposes whether its model session is loaded.

**How to apply:** Use a bounded, longer timeout only when the model is not loaded, keep the shorter timeout for warm synthesis, and verify the behavior on a physical Android device.

Unknown pronunciations should fall back to Phone for that phrase rather than inventing phonemes or disabling Piper for the rest of a healthy session.

**Why:** The user reported cracking speech even after Piper could run. Unsafe pronunciation guesses and actual engine failures need different recovery paths.

**How to apply:** Keep pronunciation limitations explicit and preserve session-wide shutdown for genuine native failures. Bundled pronunciation resources must have redistributable licenses.

Treat background audio-focus/playback denial separately from Piper inference failure.

**Why:** A device screenshot showed Expo rejecting background audio focus and Vox then permanently switching the selected voice to Phone. Playback availability does not establish that the Piper model failed.

**How to apply:** Allow the intended Android background reply path, release failed players, and keep playback-only fallback limited to that phrase. Preserve the native-failure safeguards and do not claim that this fixes wake recognition or lock-screen reliability.