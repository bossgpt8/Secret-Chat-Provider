---
name: Vox Oracle VM hosting target
description: User wants to run the Vox server on their free Oracle VM with 2 vCPUs and 12 GB RAM.
---

The user's intended hosting target for the Vox server is a free Oracle VM with 2 vCPUs and 12 GB of RAM.

The Vox API is intended to run on the Oracle VM. Kokoro is currently not running on that VM; its current hosting status/location is unconfirmed. Neon is the selected PostgreSQL target; other AI/search/image services remain external unless the user says otherwise. Replit-managed PostgreSQL is not reachable from Oracle.

The user directed Vox to start fresh on Neon: do not copy Replit database contents into Neon. Keep the Replit database and its connection unchanged.

**Why:** The user chose Oracle for the API, clarified that Kokoro is not running on their VM, corrected an outdated Azure hosting assumption, and selected Neon; the Replit-managed database cannot be used by an Oracle-hosted API.

**How to apply:** Refer to Oracle VM as the intended API host, but don't assume Kokoro is deployed there or elsewhere, and don't refer to Azure as current. Configure Oracle to use the fresh Vox Neon database, and do not import Replit rows into it.
