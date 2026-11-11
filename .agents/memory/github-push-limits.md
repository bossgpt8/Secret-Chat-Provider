---
name: GitHub push permission limits
description: Workflow pushes need workflow scope; reconnecting the account authorization resolved an earlier rejection.
---

Application-source pushes can work even when `.github/workflows` updates are rejected for missing `workflow` scope. Reconnecting GitHub through Replit account settings resolved this rejection and a subsequent workflow push succeeded.

**Why:** Both an optional CI change and a requested ARM64 workflow change were rejected with this error. The ARM64 change pushed successfully after the user reconnected GitHub.

**How to apply:** Do not assume workflow pushes remain blocked: try required changes normally. If this specific rejection recurs, use supported authorization tooling or ask the user to reconnect GitHub in Replit account settings; never request credentials in chat. Do not add unrelated workflow changes to routine source pushes.
