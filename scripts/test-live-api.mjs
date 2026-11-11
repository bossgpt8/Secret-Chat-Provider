import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pairingCode, issueLiveCredential } from "../artifacts/api-server/src/lib/live-access.ts";
const require = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url));
const express = require("express");
process.env.GEMINI_API_KEY = "dummy-google-key";
process.env.SESSION_SECRET = "dummy-live-secret";
const stateDir = mkdtempSync(join(tmpdir(), "vox-live-test-"));
process.env.VOX_STATE_DIR = stateDir;
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:9/test";
const { default: router } = await import("../artifacts/api-server/src/routes/live.ts");
const { pool } = await import("../lib/db/src/index.ts");
const nativeFetch = globalThis.fetch;
const app = express(); app.use(express.json());
app.use((req, _res, next) => { req.log = { info() {}, warn() {}, error() {} }; next(); });
app.use("/api", router);
const server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
const base = `http://127.0.0.1:${server.address().port}/api/live/`;
const post = (path, body, credential) => nativeFetch(base + path, {
  method: "POST", headers: { "Content-Type": "application/json", ...(credential && { Authorization: `Bearer ${credential}` }) },
  body: body ? JSON.stringify(body) : undefined,
});
after(async () => {
  rmSync(stateDir, { recursive: true, force: true });
  globalThis.fetch = nativeFetch;
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await pool.end();
});
let pairedCredential = "";
const code = pairingCode("dummy-live-secret");
test("pairing rejects invalid input and never exposes a Google key", async () => {
  globalThis.fetch = async () => assert.fail("Pairing must not call Google");
  assert.equal((await post("pair", { code: "bad" })).status, 400);
  const response = await post("pair", { code });
  assert.equal(response.status, 200);
  const result = await response.json(); pairedCredential = result.credential;
  assert.ok(result.expiresAt); assert.doesNotMatch(JSON.stringify(result), /dummy-google-key|dummy-live-secret/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("a pairing code cannot be replayed", async () => {
  assert.equal((await post("pair", { code })).status, 401);
});
test("token minting requires a valid Live-only credential", async () => {
  globalThis.fetch = async () => assert.fail("Unauthorized requests must not reach Google");
  assert.equal((await post("token")).status, 401);
});
test("Google tokens are single-use, short-lived and locked to audio configuration", async () => {
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/auth_tokens");
    const config = JSON.parse(options.body);
    assert.equal(config.uses, 1);
    assert.ok(Date.parse(config.expireTime) - Date.now() <= 120000);
    assert.deepEqual(config.bidiGenerateContentSetup.generationConfig.responseModalities, ["AUDIO"]);
    assert.ok(config.bidiGenerateContentSetup.tools[0].functionDeclarations.length > 0);
    return Response.json({ name: "short-lived-ephemeral-token" });
  };
  const response = await post("token", undefined, pairedCredential);
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.sessionSeconds, 120);
  assert.equal(value.token, "short-lived-ephemeral-token");
  assert.doesNotMatch(JSON.stringify(value), /dummy-google-key|dummy-live-secret/);
  assert.equal(calls, 1);
});
test("Google quota failure is reported without falling back to a paid model", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ error: {} }, { status: 429 }); };
  const response = await post("token", undefined, pairedCredential);
  assert.equal(response.status, 429); assert.equal(calls, 1);
});
test("unreachable Google service gives an actionable error", async () => {
  globalThis.fetch = async () => { throw new Error("network failure"); };
  const response = await post("token", undefined, pairedCredential);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /current voice/);
});
test("Live can be disabled on the VM without removing the existing mode", async () => {
  process.env.GEMINI_LIVE_ENABLED = "false";
  const response = await post("token", undefined, issueLiveCredential("dummy-live-secret").credential);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Current voice mode still works/);
});
