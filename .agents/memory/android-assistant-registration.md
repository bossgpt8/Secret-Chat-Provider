---
name: Android assistant registration
description: Expo intent-filter prefixing and limits of default-assistant registration.
---

In this project's Expo version, Android intent-filter action/category values need short names, not fully qualified Android constants. Validate the generated manifest rather than assuming source configuration means Android can resolve the app.

**Why:** Prebuild automatically added the standard namespace even to fully qualified names, producing doubled action/category prefixes. The user reported Vox missing from the system's default-assistant chooser.

**How to apply:** Check actual generated MainActivity filters for the exact Android ASSIST action and DEFAULT category after native configuration changes. Assistant-role eligibility is separate from accessibility permission, custom wake detection, and privileged Google-style always-on hardware support; do not promise those from registration alone.
