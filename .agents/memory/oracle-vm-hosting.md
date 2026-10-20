---
name: Vox Oracle VM hosting target
description: User wants to run the Vox server on their free Oracle VM with 2 vCPUs and 12 GB RAM.
---

The user's intended hosting target for the Vox server is a free Oracle VM with 2 vCPUs and 12 GB of RAM.

The confirmed deployment split is a lightweight Vox API on Oracle, with PostgreSQL and AI/TTS/search/image services hosted externally. Neon is the selected PostgreSQL target. Replit-managed PostgreSQL is not reachable from Oracle.

The user directed Vox to start fresh on Neon: do not copy Replit database contents into Neon. Keep the Replit database and its connection unchanged.

**Why:** The user chose to keep external services outside the VM and selected Neon; the Replit-managed database cannot be used by an Oracle-hosted API.

**How to apply:** Keep the Oracle VM focused on the API. Configure Oracle to use the fresh Vox Neon database, and do not import Replit rows into it.
