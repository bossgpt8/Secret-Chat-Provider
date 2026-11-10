---
name: Vox assistant experience
description: The user's quality and latency priorities and the chosen chat-provider tradeoff.
---

Prioritize a capable, responsive conversation over adding more features or visual polish. The user wants a “very very powerful assistant” and says slow transcription, chat, and spoken responses make the existing features insufficient.

**Why:** The user explicitly compared the experience unfavorably with Gemini and asked for help improving the actual assistant, not just its feature list.

**How to apply:** Address answer quality and end-to-end speech latency together. Do not treat passing builds or the presence of streaming code as evidence of a fast, reliable native voice experience.

Use Gemini for regular chat, with Groq fallback, while preserving the existing free/self-hosted continuous-call policy.

**Why:** After discussing Gemini's possible API quota/usage charges and the Groq-only alternative, the user asked the agent to choose; the selected balance was Gemini regular chat and Groq call mode.

**How to apply:** Do not silently switch continuous calls to a paid realtime voice service. Validate a live model reply before declaring provider routing operational.
