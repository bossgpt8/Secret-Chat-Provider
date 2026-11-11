# Optional Gemini Live mode

Vox keeps both voice modes:

- **Current voice**: existing Groq/self-hosted call mode and the selected local voice.
- **Gemini Live**: microphone PCM sent continuously to Google, with streamed audio
  playback. It does not load Piper or wait for a separate Whisper transcription.

Use the radio icon in the chat header to choose either mode. Live currently
requires the updated Android APK; Expo Go, the browser and iOS do not include
the new custom audio bridge.

## Update and pair

1. Push/pull the source and update your VM using its existing update procedure.
   For the existing systemd installation:

   ```sh
   bash scripts/update-vox-api.sh
   ```

2. Keep `GEMINI_API_KEY` in the VM's environment, not in the APK. Generate a
   pairing code using **exactly the same environment as the API service**:

   ```sh
   node scripts/create-live-pairing-code.mjs
   ```

   If the service environment is in the repository's documented env file rather
   than already exported in your terminal, use:

   ```sh
   node --env-file=deploy/oracle/.env scripts/create-live-pairing-code.mjs
   ```

   Substitute your actual service env-file path if different. The script prints
   a short-lived code, never the Gemini key. Don't post that code in chat.

3. Install the updated APK. Choose **Gemini Live**, enter the code in its pairing
   field, and tap **Pair this device**. Each code is one-use within the running
   API process and expires after approximately 5–10 minutes. Generate another
   code if it has expired or was already used.
4. Tap **Start Gemini Live**, grant microphone permission, and speak.

No additional API key is required if your existing Google project supports the
configured Live model. Access and quota are verified when the VM requests a
session token. Rejected access/quota is shown in the app, not silently routed
to another paid provider.

## Security and usage controls

- Paired credentials are restricted to Live token issuance, expire after seven
  days, and are stored in Android SecureStore. Re-pair after expiry.
- Pairing/token responses are `no-store`. The permanent key is never returned
  to the phone. Google tokens are single-use, expire after two minutes and are
  locked server-side to the selected model, audio settings and tool list.
- The signing secret is the VM's `SESSION_SECRET`, if present, otherwise a
  purpose-separated HMAC using its existing Gemini key. The CLI and API must use
  the same environment. Rotating that secret invalidates existing pairings.
- Rate limits apply to pairing and token issuance. Default limits are 20 token
  requests per paired credential and 60 total per UTC day **per API process**,
  including failed Google requests. These counters and pairing replay tracking
  reset on API restart; they are not a durable account-wide billing cap.
- Sessions stop at two minutes, on app backgrounding, or on errors. Reconnect is
  manual and starts another limited session. Pending microphone audio is not
  replayed after reconnect. Finished and interrupted transcripts remain in chat.
- Device actions are validated locally. Tool cancellations stop pending work
  where possible; actions already dispatched to Android cannot always be undone.

Google determines free-tier availability, quota and billing for your project.
If billing is enabled, Live audio may be charged. Google may use free-tier
content to improve its products. This feature cannot guarantee free usage or a
zero-dollar bill; use your Google project controls as well.

Optional VM configuration:

```dotenv
GEMINI_LIVE_MODEL=gemini-2.5-flash-native-audio-preview-12-2025
GEMINI_LIVE_ENABLED=true
```

Set `GEMINI_LIVE_ENABLED=false` to disable only Live. Current voice remains.
There is no automatic model/provider fallback in Live mode.

## Verification

The offline tests mock Google and the native audio interface. They verify
pairing/authentication, token constraints, stream lifecycle, backpressure,
transcripts, interruption, cancellation and truthful tool results:

```sh
node --test scripts/test-live-session.mjs
scripts/node_modules/.bin/tsx --test scripts/test-live-api.mjs
```

The Android GitHub build must compile the native module. A physical phone must
still verify actual microphone capture, playback, echo handling, interruption,
background cleanup and switching back to Current voice. Use headphones if the
phone's speaker is being recognized as input. No physical-device performance
or VM-provider success is implied by passing mocked tests.
