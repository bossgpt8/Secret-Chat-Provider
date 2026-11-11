/**
 * Development/VM integration check. Uses runtime signing internally; never
 * prints credentials or reads/deletes another device's data. Requires the API
 * and its existing database to be running. All fixture IDs are newly generated.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pairingCode } from "../artifacts/api-server/src/lib/live-access.ts";

const base = process.env.VOX_TEST_API || "http://localhost:80/api";
const secret = process.env.SESSION_SECRET || process.env.GEMINI_API_KEY;
if (!secret) throw new Error("Run with the same environment file as the API.");
const a = `test-${randomUUID()}`, b = `test-${randomUUID()}`;
const request = async (path, method = "GET", body, credential, deviceId) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      ...(deviceId ? { "X-Device-Id": deviceId } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
};
const pair = async deviceId => {
  const value = await request("/devices/pair", "POST", { code: pairingCode(secret), deviceId });
  assert.equal(value.status, 200, "Pairing failed. Check API version and pairing state directory.");
  return value.body.credential;
};
let credentialA, credentialB, memoryId, conversationId;
try {
  assert.equal((await request("/memory")).status, 401);
  assert.equal((await request("/conversations")).status, 401);
  credentialA = await pair(a); credentialB = await pair(b);
  assert.equal((await request("/memory", "GET", undefined, credentialA, b)).status, 403);
  assert.equal((await request("/memory", "GET", undefined, `${credentialA}x`, a)).status, 401);
  const created = await request("/memory", "POST", { fact: "Integration fixture: prefers concise test output." }, credentialA, a);
  assert.equal(created.status, 200);
  memoryId = created.body.fact.id;
  const foreign = await request(`/memory/${memoryId}`, "PATCH", { fact: "Must not overwrite another device." }, credentialB, b);
  assert.equal(foreign.status, 404);
  assert.equal((await request(`/memory/${memoryId}`, "DELETE", undefined, credentialB, b)).status, 404);
  const list = await request("/memory", "GET", undefined, credentialA, a);
  assert.equal(list.headers.get("cache-control"), "no-store");
  assert.equal(list.body.facts[0].id, memoryId);
  assert.equal((await request("/memory", "GET", undefined, credentialB, b)).body.facts.length, 0);
  const updated = await request(`/memory/${memoryId}`, "PATCH", { fact: "Integration fixture: corrected preference." }, credentialA, a);
  assert.equal(updated.status, 200);
  assert.equal(updated.body.fact.fact, "Integration fixture: corrected preference.");
  assert.equal((await request("/memory/extract", "POST", { userMessage: "Hello", assistantMessage: "Hi", automaticMemory: false }, credentialA, a)).status, 400);
  conversationId = `test-conversation-${randomUUID()}`;
  assert.equal((await request("/conversations", "POST", { id: conversationId, title: "Integration fixture" }, credentialA, a)).status, 201);
  assert.equal((await request(`/conversations/${conversationId}/messages`, "POST",
    { messageId: randomUUID(), role: "user", content: "Synthetic test message." }, credentialA, a)).status, 201);
  assert.equal((await request(`/conversations/${conversationId}/messages`, "GET", undefined, credentialB, b)).status, 404);
  assert.equal((await request(`/conversations/${conversationId}`, "DELETE", undefined, credentialB, b)).status, 404);
  assert.equal((await request(`/conversations/${conversationId}/messages`, "GET", undefined, credentialA, a)).body.messages.length, 1);
  console.log("PASS: pairing, missing/tampered credentials, memory create/read/correct, conversation messages, cross-device denial and explicit memory consent.");
} finally {
  if (memoryId && credentialA) assert.equal((await request(`/memory/${memoryId}`, "DELETE", undefined, credentialA, a)).status, 200);
  if (conversationId && credentialA) assert.equal((await request(`/conversations/${conversationId}`, "DELETE", undefined, credentialA, a)).status, 200);
}
