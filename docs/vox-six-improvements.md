# Vox voice, overlay, and account rollout

## What changed

- Standard replies release spoken sentences/clauses earlier; a short settling
  timer releases sentence punctuation even when a following token is delayed.
- Standard Call continues using local speech (selected Piper or Phone for cloud
  selections), avoiding cloud speech charges. Ordinary chat retains the selected
  ElevenLabs/Kokoro voice. Piper preloads the selected model during call setup,
  through the same memory checks and durable crash marker as synthesis.
- The native bubble opens an actual compact overlay, not the full Activity.
  The panel supports text, captions, minimize/expand, microphone mute/resume,
  end call, and entry points for screen and camera/image context.
- Explicit calls have a microphone foreground service with a visible End call
  notification. Android restrictions still apply; force-stop cannot be bypassed.
- Gemini Live remains a separate opt-in. It supports microphone audio, opt-in
  screen frames, camera frames, and attached/cropped images. Visual sharing
  stops on session end; camera sharing stops when leaving the foreground.
  Frames are sampled no faster than once per 1.1 seconds, without overlapping captures.
- Wake listening exposes microphone input level and retries temporary mic
  failures with bounded backoff. It does not lower detection thresholds blindly,
  bypass Android privacy controls, or claim unverified recognition accuracy.
- Settings keeps existing options behind searchable destinations.
- Account screens provide Google/email auth, verification, password reset,
  sign-out, explicit guest import, cloud deletion, and account deletion.

## Oracle / Neon deployment prerequisites

Workspace provisioning does **not** configure the Oracle machine or rebuild the
installed APK. Before enabling cloud accounts on the existing Oracle API:

1. Install the updated server dependencies using the committed lockfile.
2. Apply `scripts/migrations/vox-account-cloud.sql` to the existing Neon database.
   This is additive. Do not copy Replit development rows to Neon.
3. Configure the corresponding Clerk secret/publishable key pair on the VM via
   the server's secure configuration. Never commit keys or put the secret key in
   the APK. The mobile build needs only the matching public publishable key.
4. Enable/verify Google and email login and allow the mobile callback scheme
   (`vox://account`; the old `mobile://` scheme remains registered). Production Clerk
   credentials/users are separate from workspace development credentials/users.
5. Restart the API, rebuild the Android APK including the new config plugin
   sources, and verify authentication against the intended Oracle API.
6. Gemini Live also requires the VM's Gemini access and a supported model.
   `GEMINI_LIVE_MODEL` overrides the default; session length is configurable via
   `GEMINI_LIVE_SESSION_SECONDS` (120–900 seconds, default 600).

No paid-provider fallback has been added. Live uses Google's quota; app session
limits are not billing caps. Selected images are sent to the chosen analysis
provider, or Google during explicitly enabled Live visual sharing, but are not
included in automatic account sync. AI image generation/editing is a separate
provider capability: attachment and local crop do not imply Gemini-app image
editing.

## Sync privacy and conflicts

Only conversations and explicitly allowlisted preferences are synced. Raw audio,
unshared photos/screenshots, notifications, personal-message inbox, API keys, device IDs,
permissions, downloaded model files, notes and to-dos are not uploaded.

Guest data remains local until the user explicitly imports it. Signed-in data
uses a separate local namespace per Clerk user, including local-only profile,
notes, to-dos, and favorites. Signing out restores the guest workspace, not the
previous account's chats.

The API obtains identity from a verified Clerk session, never a user-supplied
user ID. Writes use an atomic revision comparison. Conflicts preserve the local
copy and require an explicit merge; that merge can restore deleted chats and
chooses the newer version of a same-ID conversation. Erasing cloud data leaves a
revision tombstone to prevent an old phone silently recreating it. Local synced
data is cleared too, with confirmation.

## Compatibility

SDK 54 is retained. React/React DOM 19.1.4 and React Native 0.81.6 are paired:
RN 0.81.5 hardcodes renderer 19.1.0 and crashes with React 19.1.4. Clerk's current
React dependencies require the patched React release. Expo's older exact-version
recommendations are excluded for these matched security patch releases.

Reanimated 3.19.5 remains intentional for this app's existing legacy native
architecture; upgrading to Reanimated 4 as part of auth would break that build.
These deliberate exceptions are in `expo.install.exclude`, not a claim that all
SDK/package combinations are interchangeable.

## Native acceptance checks still required

- Ten normal-volume voice turns, two interruptions, mute/unmute and End call.
- Phone/Piper start latency; Piper cold/warm load and low-memory fallback.
- Overlay while another app is open, keyboard, captions and dragging/minimizing.
- Screen-off wake recognition for the selected name with real speech and noise;
  background battery management and microphone contention recovery.
- Live PCM audio, speaker echo, headset routing, background call notification,
  screen consent, camera consent, visual stop, quota failure and expiration.
- Google callback on a rebuilt APK and two-account/two-device cloud isolation.
