---
name: Vox offline voice
description: Constraints and verification notes for the optional on-device Whisper and Piper voice paths.
---

Offline voice is an optional Android capability: native 16 kHz PCM recording feeds whisper.rn, while Piper uses downloaded ONNX weights and config; the existing cloud/phone paths remain the fallback.

**Why:** Audio-only offline support should not silently imply that the language model or chat backend is offline, and Expo's normal AAC/M4A recording is not the input format used by Whisper.cpp.

**How to apply:** Keep model selection and downloads explicit in Settings, preserve DownloadManager jobs by filename, and verify the generated Android project on a Java-enabled Android build/device before calling the feature production-ready. Piper pronunciation needs real-device validation because the current bridge uses a lightweight custom phonemizer. When maintaining Expo config plugins, keep the JavaScript entrypoint synchronized with the TypeScript source because prebuild executes the JavaScript file.