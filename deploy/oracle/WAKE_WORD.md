# On-device custom-name wake listening

This upgrade is in the **Android APK**, not the VM API. It does not need a new
API key, Live pairing, or a VM configuration change.

## Enable

1. Install the new APK built from the updated GitHub source.
2. Open Vox → Settings → Hands-Free.
3. Enable **“Hey [your assistant name]” wake word**. Grant microphone and
   notification access. The old cloud-wake setting does not silently opt you
   into a new background microphone; enable this once explicitly.
4. Wait for the status to say **listening**.
5. Say **“Hey [name]”**, wait for the short vibration, then speak.

The wake phrase follows the name in Settings. The current model is English;
names must use 1–40 English letters, spaces, periods, apostrophes or hyphens.
Periods are ignored and hyphens are spoken as word separators. Very unusual
names/spellings may need pronunciation testing. Unsupported names are reported,
never silently replaced with “Hey Vox.”

Waking starts **Current voice** immediately, without a spoken greeting or a
Gemini Live token. Live remains separately selectable. End the current call to
return to wake detection.

## Android background setup and limits

- Use the **Background / battery setup** control to allow background/unrestricted
  battery use. Some manufacturers also require Auto-start permission.
- A microphone foreground service shows a permanent notification with
  **Resume** and **Stop**. Stop disables wake listening; returning to the app
  does not silently re-enable it.
- The native detector is designed to keep running with another app open and the
  screen off, but this is **not** Google's privileged low-power hotword hardware.
  It uses a partial CPU wake lock while actively listening and can use materially
  more battery. No battery/performance claim has been measured on a phone.
- Detection releases its microphone before normal voice capture or Live starts,
  and pauses during Vox recording, transcription, replies, TTS and call sessions.
- A phone/VoIP call or Android silencing the recorder produces a visible error;
  **Resume** after the other app/call releases audio. No tight retry loop or
  hidden alternative provider.
- Force-stop, reboot, permission revocation, OEM restrictions or process death
  can stop it. Open Vox to resume; there is no boot receiver or hidden restart.
- It does not bypass the lock screen or guarantee that Android will let a device
  action open an app while locked.
- The bubble is visual only. It no longer runs its own speech-recognition loop
  and is not required for the wake microphone.

## Privacy, assets and licensing

Idle wake-listening audio stays in a native PCM buffer and goes only to the
on-device detector. It is not saved or uploaded. Once activated, the existing
Current voice transcription/AI settings still apply; this does **not** make the
assistant's entire conversation offline.

The Apache-2.0 sherpa-onnx engine and English keyword model are downloaded with
pinned SHA-256 checksums during Android prebuild, then bundled in the APK.
No separate wake-model download or account is needed on the phone. The selected
quantized model files total about 6 MB before APK compression; native libraries
also increase APK size. Generated binaries live outside Git history.

The static engine libraries support ARMv7, ARM64 and x86_64. The upstream
“static” AAR's x86-only dynamic ONNX Runtime is removed from the generated AAR
to avoid colliding with Piper's runtime. A 32-bit x86 emulator is not supported
by this detector. Both phone ARM architectures remain supported.

License/attribution notices are included in the model assets. This adds no
subscription or cloud key requirement.

## Verification and open accuracy check

Local checks include:

```sh
node --test scripts/test-wake-word.mjs
pnpm --filter @workspace/mobile run typecheck
```

Native source compilation against Android, React Native and the actual sherpa
AAR is separate from a complete Gradle APK build. The GitHub Android workflow
must still build the release APK. JavaScript checks cannot verify native audio.

The Kotlin tokenizer has been checked against the pinned model's official
SentencePiece encodings for several names. The actual engine recognized its
supplied human recording and rejected it under a different keyword.

**The synthetic espeak “Hey Vox” checks did not trigger**, including after an
alternative model and sensitivity checks. That is not a passing recognition
test. Actual selected-name accuracy, accents, false activations, screen-off
behavior, audio handoff, battery usage and repeated app launches still require
real recordings / physical Android validation. Do not describe this upgrade as
Google-equivalent or production-verified on the strength of builds or the
supplied human fixture.

Optional diagnostic (Python `sherpa-onnx==2.0.1` and `sentencepiece`):

```sh
python3 scripts/test-wake-model.py /path/to/extracted/model
python3 scripts/test-wake-model.py /path/to/extracted/model --name Jarvis --wav /path/to/hey-jarvis.wav
```

The first command tests the official human fixture, **not recognition of your
selected name**. The second expects a mono PCM16 WAV recording that actually
says the chosen wake phrase and fails if it is not detected.
