import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const SLOT_MS = 5 * 60 * 1000;
export class LiveSessionBudget {
  private day = "";
  private counts = new Map<string, number>();
  take(subject: string, now = Date.now()): boolean {
    const day = new Date(now).toISOString().slice(0, 10);
    if (this.day !== day) { this.day = day; this.counts.clear(); }
    const perDevice = this.counts.get(subject) || 0;
    const total = this.counts.get("*") || 0;
    if (perDevice >= 20 || total >= 60) return false;
    this.counts.set(subject, perDevice + 1);
    this.counts.set("*", total + 1);
    return true;
  }
}
const sign = (secret: string, text: string) =>
  createHmac("sha256", secret).update(`vox-live-v1:${text}`).digest("base64url");
const equal = (a: string, b: string) => {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export function pairingCode(secret: string, now = Date.now(), nonce = randomBytes(4).toString("hex")): string {
  const signature = createHmac("sha256", secret)
    .update(`vox-live-pair:${Math.floor(now / SLOT_MS)}:${nonce.toUpperCase()}`).digest("hex").slice(0, 16);
  return `${nonce}${signature}`.toUpperCase();
}

export function verifyPairingCode(code: string, secret: string, now = Date.now()): boolean {
  const normalized = code.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-F0-9]{24}$/.test(normalized)) return false;
  return [now, now - SLOT_MS].some(time => equal(normalized, pairingCode(secret, time, normalized.slice(0, 8))));
}

export function issueLiveCredential(secret: string, now = Date.now()) {
  const expiresAt = new Date(now + 7 * 86400000).toISOString();
  const payload = Buffer.from(JSON.stringify({
    sub: randomUUID(), exp: Date.parse(expiresAt), scope: "vox-live",
  })).toString("base64url");
  return { credential: `${payload}.${sign(secret, payload)}`, expiresAt };
}

export function verifyLiveCredential(token: string, secret: string, now = Date.now()): string | null {
  if (token.length > 1024) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !equal(signature, sign(secret, payload))) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    return value.scope === "vox-live" && typeof value.sub === "string" &&
      typeof value.exp === "number" && value.exp > now ? value.sub : null;
  } catch { return null; }
}
