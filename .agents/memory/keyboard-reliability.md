---
name: Keyboard reliability
description: Why keyboard animation must have one owner and retain legacy-native compatibility.
---

Keep keyboard displacement and composer spacing under one coordinated animation, not competing Android resize, React Native padding and post-show layout changes.

**Why:** The user supplied a recording and clarified that the keyboard repeatedly moved up and down while typing, not that Gemini replies were slow.

**How to apply:** Preserve focus/input identity across keystrokes and interpolate navigation clearance with the keyboard animation. A browser screenshot does not verify native IME stability.

Do not switch Android architecture merely to adopt a newer animation library.

**Why:** Vox's existing custom native build uses the legacy architecture. Reanimated 4 requires the New Architecture; the keyboard repair selected Reanimated 3 for compatibility rather than risking the voice/native integration with an architecture migration.

**How to apply:** Reassess keyboard-controller/Reanimated compatibility during deliberate Expo or architecture upgrades. Native keyboard dependencies require a rebuilt APK; the custom legacy build and Expo Go's bundled native versions are not interchangeable.
