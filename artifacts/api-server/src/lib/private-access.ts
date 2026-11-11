import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export const validDeviceId = (id: unknown): id is string =>
  typeof id === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(id);
const signature = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(`vox-private-v1:${payload}`).digest("base64url");

export function issueDeviceCredential(deviceId: string, secret: string, now = Date.now()) {
  if (!validDeviceId(deviceId)) throw new Error("Invalid device identifier");
  const expiresAt = new Date(now + 30 * 86400000).toISOString();
  const payload = Buffer.from(JSON.stringify({ sub: deviceId, exp: Date.parse(expiresAt) })).toString("base64url");
  return { credential: `${payload}.${signature(payload, secret)}`, expiresAt };
}
export function verifyDeviceCredential(token: string, secret: string, now = Date.now()): string | null {
  if (token.length > 1024) return null;
  const [payload, signed, extra] = token.split(".");
  if (!payload || !signed || extra) return null;
  const expected = Buffer.from(signature(payload, secret)), actual = Buffer.from(signed);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    return validDeviceId(value.sub) && typeof value.exp === "number" && value.exp > now ? value.sub : null;
  } catch { return null; }
}
export function authenticatedDevice(req: Request): string | null {
  const secret = process.env.SESSION_SECRET || process.env.GEMINI_API_KEY;
  if (!secret) return null;
  return verifyDeviceCredential((req.headers.authorization || "").replace(/^Bearer /, ""), secret);
}
export function requirePrivateDevice(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  const device = authenticatedDevice(req);
  if (!device) {
    res.status(401).json({ error: "Pair this phone in Settings → Assistant quality to access private cloud data." });
    return;
  }
  const claims = [req.headers["x-device-id"], req.body?.deviceId, req.query.deviceId];
  if (claims.some(requested => requested !== undefined && requested !== device)) {
    res.status(403).json({ error: "This credential belongs to another device." }); return;
  }
  // Bind every existing handler to the verified identity, never an arbitrary caller ID.
  req.headers["x-device-id"] = device;
  res.locals.deviceId = device;
  next();
}
