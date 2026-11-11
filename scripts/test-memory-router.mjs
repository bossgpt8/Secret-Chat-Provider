import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { issueDeviceCredential, requirePrivateDevice } from "../artifacts/api-server/src/lib/private-access.ts";
const require = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url));
const express = require("express");
process.env.GEMINI_API_KEY = "synthetic-gemini";
process.env.SESSION_SECRET = "synthetic-memory-secret";
process.env.GROQ_API_KEY = "";
process.env.OPENROUTER_API_KEY = "";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:9/test";
const { default: router } = await import("../artifacts/api-server/src/routes/memory.ts");
const { pool } = await import("../lib/db/src/index.ts");
const nativeFetch = globalThis.fetch;
const app = express(); app.use(express.json());
app.use((req, _res, next) => { req.log = { error() {} }; next(); });
app.use("/api", requirePrivateDevice, router);
const server = await new Promise(resolve => { const value = app.listen(0, "127.0.0.1", () => resolve(value)); });
const token = issueDeviceCredential("device-memory-test", "synthetic-memory-secret").credential;
const post = (path, body, method = "POST") => nativeFetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
  method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
});
after(async () => { globalThis.fetch = nativeFetch; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await pool.end(); });
test("automatic memory requires explicit consent", async () => {
  globalThis.fetch = async () => assert.fail("must not call provider without consent");
  assert.equal((await post("/memory/extract", { userMessage: "Hello", assistantMessage: "Hi", automaticMemory: false })).status, 400);
});
test("a Gemini-only VM can run opt-in extraction without Groq", async () => {
  let called = false;
  globalThis.fetch = async (url, options) => {
    assert.match(url, /generativelanguage\.googleapis\.com/);
    assert.equal(JSON.parse(options.body).stream, false);
    called = true;
    return new Response(JSON.stringify({ choices: [{ message: { content: "[]" } }] }), { status: 200 });
  };
  const response = await post("/memory/extract", { userMessage: "Hello", assistantMessage: "Hi", automaticMemory: true });
  assert.equal(response.status, 200);
  assert.equal(called, true);
  assert.deepEqual(await response.json(), { facts: [] });
});
test("failed extraction is an explicit error, not a fake empty-memory success", async () => {
  globalThis.fetch = async () => new Response("provider unavailable", { status: 503 });
  assert.equal((await post("/memory/extract", { userMessage: "Hello", assistantMessage: "Hi", automaticMemory: true })).status, 502);
});
test("manual memory does not store obvious passwords or API tokens", async () => {
  assert.equal((await post("/memory", { fact: "My password is synthetic-do-not-store" })).status, 400);
  assert.equal((await post("/memory/fixture", { fact: "API key: synthetic-do-not-store" }, "PATCH")).status, 400);
});
