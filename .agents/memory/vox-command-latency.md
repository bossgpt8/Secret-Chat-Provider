---
name: Device-command latency
description: Product expectations and safety boundaries for immediate device commands.
---

Device commands such as turning on the torch and opening WhatsApp/apps must respond immediately.

**Why:** The user explicitly said “all those things like on torch open whatsapp, open apps should respond immediately.” Waiting for an AI response for a deterministic device action defeats Vox's purpose as a fast voice assistant.

**How to apply:** Execute clear commands on the phone, online or offline, before optional spoken confirmation. Do not gate the action on chat, context collection, persistence, or cloud speech. Opening an installed app must not silently substitute a guessed website.

Use finalized speech, not speculative recognition partials, for execution.

**Why:** Speech recognizers revise partial transcripts; acting before the user finishes can execute a negated or incomplete command.

**How to apply:** Optimize dispatch after recognition without promising zero recognition or Android startup latency. Questions, negations and compound requests should not accidentally trigger the simple-command path.
