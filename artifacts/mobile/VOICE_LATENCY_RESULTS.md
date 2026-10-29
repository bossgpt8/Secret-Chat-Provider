# Vox voice-response latency

## Instrumentation

On Android, each native-recognizer voice turn writes privacy-safe stage events to the app log with the `[voice-timing]` prefix. Events contain a random trace ID and timing numbers only; transcripts, prompts, responses, device IDs, and credentials are not logged.

The API emits the first text delta with `modelFirstTokenMs`, measured from the start of the upstream model request. Its existing `[obs] chat` entry records that value and the matching trace ID. The API source must be deployed to `https://vox.bossbot.me/api` for the server-side timing and trace correlation to appear.

The first-audible timestamp uses Android speech's `onStart` callback or the audio player's first `isPlaying` status. This is the app's playback-start signal, not a microphone measurement of sound pressure at the speaker.

## Real-device results

**Status: not measured.** This workspace has no Android SDK tools, emulator, connected device, or installed APK. The Android-device run against the Oracle-hosted API therefore could not be performed here. No latency values or slowest stage are claimed until real-device logs are collected.

| Stage interval | Result |
| --- | --- |
| Speech finalization → API request start | Pending Android run |
| API request start → first model token (client-observed) | Pending Android run |
| API request start → first model token (API-measured) | Pending API deployment and Android run |
| First model token → first audio playback start | Pending Android run |
| Speech finalization → first audio playback start | Pending Android run |

## Collection procedure

1. Install an Android build that includes the updated native recognizer and set the app's API URL to `https://vox.bossbot.me/api`.
2. Ensure the updated API server is deployed there, use a speech output provider, and make five short voice requests in a quiet environment.
3. Collect the app's `[voice-timing]` events and API `[obs] chat` logs. Match them by `traceId`; redact unrelated logs before sharing.
4. For each turn, compare the three interval durations above. Report the median and range across five turns, and identify the slowest interval by its median.

The client-observed first-token interval includes network delivery; the API-measured value isolates the upstream model's time to first text. Their difference helps separate backend/model wait from delivery delay.
