// Run with: scripts/node_modules/.bin/tsx --test scripts/test-chat-router.mjs
// All provider traffic is mocked. These dummy credentials never leave this process.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url));
const express = require("express");
process.env.GEMINI_API_KEY = "test-gemini";
process.env.GROQ_API_KEY = "test-groq";
process.env.OPENROUTER_API_KEY = "";
process.env.OLLAMA_URL = "";
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:9/test";
const { default: router } = await import("../artifacts/api-server/src/routes/chat.ts");
const { pool } = await import("../lib/db/src/index.ts");
const nativeFetch = globalThis.fetch;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.log = { info() {}, warn() {}, error() {} }; next(); });
app.use("/api", router);
const server = await new Promise(resolve => {
  const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
});
const url = `http://127.0.0.1:${server.address().port}/api/chat`;
const payload = { messages: [{ role: "user", content: "Hello" }], clientMemoryProvided: true };
const request = (extra = {}, signal) => nativeFetch(url, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...payload, ...extra }), signal,
});
const sse = (...events) => new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n");
const text = (content) => sse({ choices: [{ delta: { content } }] });
after(async () => {
  globalThis.fetch = nativeFetch;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test("regular chat streams Gemini first and uses the VM's configurable model", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    const body = JSON.parse(options.body);
    assert.match(body.model, /^gemini-/);
    assert.equal(body.stream, true);
    assert.ok(body.tools.length > 0);
    assert.ok(options.signal);
    return text("Hello from Gemini.");
  };
  assert.match(await (await request()).text(), /Hello from Gemini/);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /generativelanguage/);
});
test("continuous calls stay on Groq and never use Gemini", async () => {
  globalThis.fetch = async (url, options) => {
    assert.match(url, /groq/);
    assert.equal(JSON.parse(options.body).model, "openai/gpt-oss-20b");
    return text("Call response.");
  };
  assert.match(await (await request({ callMode: true })).text(), /Call response/);
});
test("provider rejection falls back once before any user-facing output", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return calls.length === 1 ? Response.json({ error: {} }, { status: 429 }) : text("Fallback answer.");
  };
  assert.match(await (await request()).text(), /Fallback answer/);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /groq/);
});
test("tool-only responses send every action without fabricated success or a confirmation AI call", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return sse(
      { choices: [{ delta: { tool_calls: [
        { index: 0, function: { name: "flashlight", arguments: '{"on":true}' } },
        { index: 1, function: { name: "open_app", arguments: '{"app":"Maps"}' } },
      ] } }] },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    );
  };
  const result = await (await request()).text();
  assert.equal((result.match(/"tool_call"/g) || []).length, 2);
  assert.doesNotMatch(result, /executed|turning on|success/i);
  assert.equal(calls, 1);
});
test("mid-response failure never starts a second model or repeats an action", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Partial answer"}}]}\n\n'));
        setTimeout(() => controller.error(new Error("disconnected")), 5);
      },
    }));
  };
  const result = await (await request()).text();
  assert.match(result, /Partial answer/);
  assert.match(result, /interrupted/);
  assert.equal(calls, 1);
});
test("closing the mobile request aborts the provider request", async () => {
  let resolveAborted;
  const upstreamAborted = new Promise(resolve => { resolveAborted = resolve; });
  globalThis.fetch = async (_url, options) => {
    options.signal.addEventListener("abort", resolveAborted, { once: true });
    return new Response(new ReadableStream());
  };
  const controller = new AbortController();
  await request({}, controller.signal);
  controller.abort();
  await Promise.race([upstreamAborted, new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Provider was not cancelled")), 1000))]);
});
test("invalid chat input is rejected before any provider request", async () => {
  globalThis.fetch = async () => assert.fail("No provider request expected");
  const response = await request({ messages: [{ role: "system", content: "invalid" }] });
  assert.equal(response.status, 400);
});
