# Conversation upgrade

These source changes do not edit your VM environment or deploy themselves.
Keep the existing `GEMINI_API_KEY` in the VM's service environment. Do not
copy the VM key into chat or Git.

## Update the API

After the changes have been committed and pushed to GitHub, run from your VM checkout:

```sh
bash scripts/update-vox-api.sh
node scripts/check-vox-chat.mjs http://127.0.0.1:8081/api/
```

Use your service's actual port if it differs from the updater's default of 8081.
The updater is for an existing systemd installation. Existing container
installations should use their usual rebuild/restart procedure instead.
The check sends one short Gemini chat request and reports first-text and
completion times. It uses the API server's existing environment; it never
reads or prints a key. This is text latency, not a measurement of microphone
or speaker latency.

Regular chat tries Gemini first, then configured Groq, Ollama and OpenRouter.
Continuous calls use only Groq or Ollama, preserving the free/self-hosted policy.
Set `GEMINI_CHAT_MODEL` in the VM environment if your Google project requires
a different available model. The default is `gemini-3.8-flash`.
Calls require a working `GROQ_API_KEY` or `OLLAMA_URL`; a Gemini key alone does
not enable continuous calls under this policy.

## Update the Android app

Build and install a new APK using the existing Android Build workflow.
JavaScript changes alone cannot update the Kotlin speech module in an old APK.
Expo Go does not include Vox's custom Android modules.

In the installed APK, verify:

1. The microphone shows partial words while speaking, then sends finalized
   recognition directly to chat without a separate Whisper upload.
2. A long answer starts speaking in useful chunks before generation finishes.
3. During a call, speak to interrupt, or use **Tap to interrupt** if the phone's
   recognition service cannot recognize speech reliably during playback.
4. The interrupted answer stops and the next question gets its own answer.
5. Torch/app commands act locally. Denied permissions or missing apps report
   failure, not success. SMS opens a composer; notification replies require confirmation.
6. Search, battery, weather and notification tools return actual results.

The selected offline Whisper mode still transcribes a finished local recording.
Neither this update nor a Gemini text API makes the app a full-duplex
speech-to-speech model. Android speech services, device echo handling, the VM's
network and provider quotas all affect real latency.
The playback-echo filter is best-effort: it cannot provide hardware echo
cancellation, and repeated words may need the manual interruption control.

Use `[voice-timing]` device logs to compare speech end, API start, first model
text and first playback. These logs contain timings and a trace ID, not audio
or transcript text. Pair them with the API's `[obs]` logs using the trace ID.
Do not claim measured voice speed or native stability until these checks
have been completed on a physical phone.

## Offline regression checks

```sh
node --test scripts/test-assistant-stream.mjs scripts/test-device-commands.mjs scripts/test-voice-camera.mjs
scripts/node_modules/.bin/tsx --test scripts/test-chat-router.mjs
```

Provider requests in the router tests are mocked. They do not prove that a
particular VM credential, Google model or Android device is working.
