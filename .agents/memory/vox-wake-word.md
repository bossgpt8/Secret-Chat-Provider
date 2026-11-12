---
name: Wake-word expectations
description: Custom-name wake behavior, Android limits, and the evidence needed before claiming reliability.
---

The wake phrase must follow the assistant name the user sets, not remain fixed to “Hey Vox.”

**Why:** When asked for a recording, the user corrected the fixed-name assumption: “it might not be hey vox it depends on the name I set right?”

**How to apply:** Preserve custom-name wake phrases when changing detectors or renaming settings. If a language/name cannot be supported, explain it explicitly; never silently listen for the product name instead.

Treat wake recognition accuracy and screen-off reliability as separate from successful code compilation and model loading.

**Why:** The chosen open-vocabulary engine recognized its official human fixture but did not recognize robotic espeak “Hey Vox” samples, even with alternative-model and sensitivity checks. That fixture does not prove the user's wake phrase works.

**How to apply:** Use real recordings of the selected name and physical Android evidence before claiming reliable detection, low battery use, or Google-equivalent behavior. Do not repeatedly tune to one synthetic voice or conceal a failed accuracy diagnostic behind passing build checks.

Evaluate microphone level conditioning before lowering wake confidence thresholds.

**Why:** A real user-provided wake recording was missed by the shipped model but recognized after amplification with the same model, tokenizer and confidence settings. “Listening” establishes that capture started, not that quiet speech is being recognized.

**How to apply:** Keep correction bounded, avoid boosting near-silence, and limit peaks. Check real wake recordings and unrelated speech together. A successful recording test is not evidence of physical-device or lock-screen reliability.

Inspect native runtime contents before combining optional audio engines.

**Why:** A sherpa Android AAR labeled “static” still bundled a dynamic ONNX Runtime for x86, risking conflicts with Piper's different runtime; ARMv7, ARM64 and x86_64 were self-contained.

**How to apply:** Verify actual packaged ABIs and dynamic library dependencies when upgrading native audio binaries rather than relying on their artifact names.
