---
name: Mobile notification verification
description: Boundaries of browser verification for the Android notification inbox.
---

Verify notification capture and reply delivery on an installed native Android build, not Expo Go or the browser.

**Why:** Browser verification reaches the Android-only notice, not the inbox. Attempts to patch Metro's native-notification exports and platform in browser memory were reset during navigation and did not exercise reply handling.

**How to apply:** Use pure helper tests for classification/search and screenshots for the web notice. Clearly label populated inbox, reply-draft races and native delivery as unverified unless actually exercised on Android; do not add production mock routes to bypass this boundary.
