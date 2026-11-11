import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { consumePairingCode } from "../artifacts/api-server/src/lib/pairing-codes.ts";
import { pairingCode, issueLiveCredential } from "../artifacts/api-server/src/lib/live-access.ts";
import { issueDeviceCredential, verifyDeviceCredential, requirePrivateDevice } from "../artifacts/api-server/src/lib/private-access.ts";

test("pairing replay protection survives another consumer instance without storing a raw code", async () => {
  const directory = mkdtempSync(join(tmpdir(), "vox-pairing-test-"));
  try {
    const now = Date.now(), code = pairingCode("synthetic-secret", now);
    assert.equal(consumePairingCode(code, "synthetic-secret", now, directory), true);
    const another = await import(`../artifacts/api-server/src/lib/pairing-codes.ts?instance=${now}`);
    assert.equal(another.consumePairingCode(code, "synthetic-secret", now + 1000, directory), false);
    const saved = readFileSync(join(directory, "used-pairing-codes.json"), "utf8");
    assert.ok(!saved.includes(code));
    assert.equal(consumePairingCode("wrong-code", "synthetic-secret", now, directory), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("private credentials cannot be substituted with Live credentials", () => {
  const live = issueLiveCredential("synthetic-secret");
  assert.equal(verifyDeviceCredential(live.credential, "synthetic-secret"), null);
});
test("every claimed device identity must match the paired owner", () => {
  process.env.SESSION_SECRET = "synthetic-secret";
  const { credential } = issueDeviceCredential("device-owned-123", "synthetic-secret");
  for (const claim of ["header", "body", "query"]) {
    let status;
    const req = { headers: { authorization: `Bearer ${credential}`, "x-device-id": "device-owned-123" }, body: {}, query: {} };
    if (claim === "header") req.headers["x-device-id"] = "other-device-456";
    else req[claim].deviceId = "other-device-456";
    const res = { setHeader() {}, locals: {}, status(value) { status = value; return this; }, json() {} };
    requirePrivateDevice(req, res, () => assert.fail("must deny a foreign claim"));
    assert.equal(status, 403);
  }
});
test("a verified owner is bound into legacy data handlers", () => {
  process.env.SESSION_SECRET = "synthetic-secret";
  const { credential } = issueDeviceCredential("device-owned-123", "synthetic-secret");
  const req = { headers: { authorization: `Bearer ${credential}` }, query: {}, body: {} };
  const res = { setHeader() {}, locals: {}, status() { assert.fail("valid owner denied"); } };
  let entered = false;
  requirePrivateDevice(req, res, () => { entered = true; });
  assert.equal(entered, true);
  assert.equal(res.locals.deviceId, "device-owned-123");
  assert.equal(req.headers["x-device-id"], "device-owned-123");
});
