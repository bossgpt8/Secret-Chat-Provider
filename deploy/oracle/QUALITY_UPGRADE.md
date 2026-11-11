# Vox quality upgrade: rollout and honest verification

This keeps **Current** voice (including the existing free/self-hosted continuous-call policy) and separately opt-in **Gemini Live**. It does not claim Google-level background privileges, measured wake accuracy, natural-sounding Piper on every phone, or fully offline chat.

## What's included

- A serialized microphone handoff between wake listening, Current capture and Live; cancellation-aware cleanup, no stale audio auto-start, and explicit microphone errors.
- Single-phrase Piper prefetch while the current phrase plays. BSD-licensed CMUdict pronunciations with vowel stress replace guessed word pronunciations; numbers/currency are normalized. Unknown pronunciations fall back to Phone voice **for that phrase**. Native cancellation, the single worker, memory/64-bit checks, watchdog and startup crash recovery remain.
- Low-risk `run_action_plan` requests contain up to five ordered steps. Results come from the phone, stop at the first failure and distinguish completed steps from those not attempted. Consequential actions are excluded. Ambiguous contact numbers require selection; USSD/control strings are rejected.
- Private memory pairing, explicit opt-in, relevant fact selection, confirmed “remember/forget” tools, and add/correct/delete controls. Automatic memory is separately opt-in and works with a Gemini-only VM; no-provider/provider failures return errors rather than pretending no facts were found. Secret-like facts are rejected with best-effort checks, not a promise to detect every possible sensitive string.
- Actual bounded local timing samples and wake hit/miss/manual false-activation counts, not synthetic scores. Wake counts are separated by assistant name and environment.

Local chat history is not deleted or migrated. Existing cloud conversations/facts remain associated with their existing device IDs; a paired credential now proves ownership before access. Old clients without pairing cannot read or change private cloud data. Normal chat does not require private-data pairing.

## 1. Update the existing VM first

For your existing systemd setup:

```sh
cd ~/apps/vox-api
bash scripts/update-vox-api.sh
```

The updater uses a safe fast-forward, frozen dependency installation, API build, systemd restart and health check. It does not reset local changes. Its default health URL is `http://127.0.0.1:8081/api/healthz`; override `VOX_HEALTH_URL` only if your service uses a different port. Container installations keep their existing rebuild/restart procedure instead.

The API needs a **persistent writable** state directory for one-time pairing-code replay protection. Its default is the service user's `~/.local/state/vox`; optional `VOX_STATE_DIR` selects another directory. Do not share it between multiple replicas: this implementation is for one VM process. If systemd protects the service user's home, configure a persistent directory writable by that service user rather than running the API as root. Pairing fails closed if it cannot record code consumption.

Keep the API port private behind Caddy. Forwarded client addresses are trusted only from local/private proxy hops, never indiscriminately from public clients.

Keep `SESSION_SECRET` stable when available; otherwise the Gemini key signs credentials. Rotation invalidates existing pairings. Never share the contents of `/etc/vox-api.env`.

## 2. Install a new APK and pair private data

Native changes and the pronunciation assets **require a newly built APK**, not only an over-the-air JavaScript update.

Generate a fresh one-use code on your VM with its actual service environment:

```sh
cd ~/apps/vox-api
sudo node --env-file=/etc/vox-api.env scripts/create-live-pairing-code.mjs
```

Use Node 22.18+ (or Node 24+) for the TypeScript-importing helper scripts.
In Vox, set your HTTPS VM API URL, then open **Settings → Assistant quality → Private VM pairing** and enter that code. Private credentials are device-bound, stored with SecureStore and expire after 30 days. Web preview cannot securely pair. Reinstalling/clearing app storage changes the device ID; do not clear storage expecting it to recover the old device's cloud data.

The code works for **either private-data pairing or Live pairing once**, not both. Generate another fresh code for the other panel. Private pairing does not start a paid Live session. “Forget pairing” removes this phone's credential and opts out of memory; it is not remote token revocation or a cloud-data deletion.

Enable memory only if wanted. Automatic extraction is off by default. Review, correct or delete stored facts; enabling memory does not make every prior conversation an automatic memory.

## 3. Automated checks

In the full development checkout with workspace dependencies:

```sh
node scripts/check-assistant-release.mjs
```

Provider router tests use mocked traffic and synthetic credentials, not paid Google calls. Kotlin pronunciation checks and Android native compilation/prebuild checks are separate from this portable Node runner.

An optional real-database integration check against a running **development** API:

```sh
VOX_TEST_API=http://127.0.0.1:8081/api \
  node --env-file=/etc/vox-api.env scripts/check-private-data.mjs
```

This creates randomly identified test devices, facts and a conversation, checks memory create/read/edit/delete, conversation ownership and denied foreign access, then deletes only its own test records. It never displays the credential or key. Do not mistake this for testing the installed app's SecureStore or native audio.

## 4. Required physical-phone sign-off

These are **not verified by the web preview or source tests**:

1. **Current voice:** five normal turns; interrupt playback; stop during transcription/inference; retry after a denied microphone permission and a network failure. No stale phrase should play after stopping.
2. **Mode changes:** Current → Live → Current, including failed Live connection. Confirm only one microphone capture owns the input. Test phone calls, headphones/Bluetooth changes and background/foreground transitions separately.
3. **Piper:** known words, numbers, acronyms and an uncommon name; listen for crackling, stress and phrase gaps. Stop mid-phrase, switch voice, and repeatedly relaunch the app. Restarts intentionally use Phone voice. Valid phoneme IDs/native compilation do not prove audible quality.
4. **Wake phrase:** use the selected assistant name, not hardcoded “Hey Vox.” In Settings' wake trials, measure quiet, noisy and screen-off attempts. A trial suppresses normal command handling; finish it before chatting. Say only the wake phrase. Keep a separate timed no-wake observation window and manually mark unwanted activations; counts without observation duration do not establish a false-positive rate. Changing the name keeps measurements separate. OS battery restrictions still matter.
5. **Actions:** “Turn on the flashlight and set brightness to 20 percent.” Deny a permission in a separate trial; ensure later steps aren't reported as completed. Choose between duplicate contact names; cancel the choice. Calls/messages must not be included in low-risk batches.
6. **Memory:** pair, enable, add, correct, delete and explicitly cancel a confirmation. Disable memory and ensure a subsequent reply does not use it. Turn automatic memory on separately. Verify Settings and subsequent turns refresh after a confirmed voice memory change.
7. **Diagnostics:** inspect actual speech-finalized → request → first-token → audible timing. Compare the same mode, device, network and voice provider before/after; do not compare cloud text timing with end-to-end speech timing.

Save the observed outcomes before declaring this release device-verified.
