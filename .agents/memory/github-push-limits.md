---
name: GitHub push permission limits
description: The current GitHub OAuth connection can push source but rejects workflow changes.
---

The GitHub OAuth grant has permitted application-source pushes but rejected changes to `.github/workflows` for missing `workflow` scope.

**Why:** An otherwise valid app upgrade was rejected solely because it also added optional CI test steps.

**How to apply:** Do not add unrelated workflow changes to routine source pushes. If a required workflow update is requested, resolve authorization through supported connection tooling or the GitHub editor; never ask for credentials in chat. For an optional workflow improvement, preserve the existing workflow and deliver the source upgrade without it.
