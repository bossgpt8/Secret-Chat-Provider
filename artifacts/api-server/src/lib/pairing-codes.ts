import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { verifyPairingCode } from "./live-access";

/** One VM process; durable across systemd restarts. Never store the raw code. */
export function consumePairingCode(code: string, secret: string, now = Date.now(),
  directory = process.env.VOX_STATE_DIR || join(homedir(), ".local", "state", "vox")): boolean {
  if (!verifyPairingCode(code, secret, now)) return false;
  const normalized = code.replace(/[\s-]/g, "").toUpperCase();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, "used-pairing-codes.json");
  const old: Record<string, number> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const entries = Object.fromEntries(Object.entries(old).filter(([, expiry]) => expiry > now));
  const key = createHmac("sha256", secret).update(`used:${normalized}`).digest("hex");
  if (entries[key]) return false;
  entries[key] = now + 10 * 60000;
  writeFileSync(`${file}.tmp`, JSON.stringify(entries), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
  return true;
}
