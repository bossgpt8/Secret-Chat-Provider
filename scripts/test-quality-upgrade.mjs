import { test } from "node:test";
import assert from "node:assert/strict";
import { VoiceCoordinator, SpeechPrefetch } from "../artifacts/mobile/modules/voiceCoordination.ts";
import { contactChoices, executeActionPlan, validateActionPlan, validPhone, isMultiActionRequest } from "../artifacts/mobile/modules/actionPlans.ts";
import { relevantMemories } from "../artifacts/mobile/modules/relevantMemory.ts";
import { issueDeviceCredential, verifyDeviceCredential, requirePrivateDevice } from "../artifacts/api-server/src/lib/private-access.ts";

test("microphone ownership waits for wake release and rejects a competing mode", async () => {
  let release;
  const gate = new VoiceCoordinator(() => new Promise(resolve => { release = resolve; }));
  let acquired = false;
  const pending = gate.acquire("current").then(result => { acquired = result; });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(acquired, false);
  release(); await pending;
  await assert.rejects(gate.acquire("live"), /other voice mode/);
});
test("cancelled handoffs cannot start recording and cleanup completes before Live acquires", async () => {
  let finish;
  const gate = new VoiceCoordinator(async () => {});
  const pending = gate.acquire("current");
  gate.cancelPending();
  assert.equal(await pending, false);
  await gate.acquire("current");
  const release = gate.release("current", new Promise(resolve => { finish = resolve; }));
  let live = false;
  const next = gate.acquire("live").then(() => { live = true; });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(live, false);
  finish(); await release; await next;
  assert.equal(live, true);
});
test("speech prefetch is bounded, generation-specific and handles rejected inference", async () => {
  const cache = new SpeechPrefetch();
  let attempts = 0;
  cache.prepare("a", 1, async () => { attempts++; return "audio"; });
  cache.prepare("b", 1, async () => { attempts++; return "not allowed"; });
  assert.equal(cache.take("a", 2), null);
  assert.deepEqual(await cache.take("a", 1), { value: "audio" });
  assert.equal(attempts, 1);
  cache.prepare("bad", 3, async () => { throw new Error("inference failed"); });
  assert.match((await cache.take("bad", 3)).error.message, /inference failed/);
  cache.prepare("old", 4, async () => "old");
  cache.clear();
  assert.equal(cache.take("old", 4), null);
});
test("action plans preserve actual outcomes and stop at the first failed step", async () => {
  const calls = [];
  const result = await executeActionPlan([{ action: "flashlight", on: true }, { action: "set_brightness", percent: 40 }, { action: "vibrate" }],
    async (name) => { calls.push(name); if (name === "set_brightness") throw new Error("permission denied"); return "Flashlight is on."; });
  assert.deepEqual(calls, ["flashlight", "set_brightness"]);
  assert.match(result, /Flashlight is on/);
  assert.match(result, /remaining actions were not attempted/);
  assert.throws(() => validateActionPlan([{ action: "send_sms" }]), /consequential/);
  assert.throws(() => validateActionPlan(Array(6).fill({ action: "vibrate" })), /1–5/);
});
test("combined commands are not intercepted as one local command", () => {
  assert.equal(isMultiActionRequest("Turn on the flashlight and set brightness to 20 percent"), true);
  assert.equal(isMultiActionRequest("Set a timer for two minutes then set a timer for five minutes"), true);
  assert.equal(isMultiActionRequest("Turn on the flashlight"), false);
  assert.equal(isMultiActionRequest("Call Alex and Sam"), false);
});
test("cancelled plans do not start another action", async () => {
  const abort = new AbortController();
  let calls = 0;
  await executeActionPlan([{ action: "vibrate" }, { action: "check_battery" }], async () => {
    calls++; abort.abort(); return "sent";
  }, abort.signal);
  assert.equal(calls, 1);
});
test("contact matching preserves ambiguity and rejects dialer control strings", () => {
  const contacts = [{ name: "Alex", phoneNumbers: [{ number: "+1 (202) 555-0101" }] },
    { name: "Alex Smith", phoneNumbers: [{ number: "+12025550102" }] }];
  assert.equal(contactChoices(contacts, "Alex").length, 1);
  assert.equal(contactChoices([...contacts, { name: "Alex", phoneNumbers: [{ number: "+12025550103" }] }], "Alex").length, 2);
  assert.equal(validPhone("*#21#"), undefined);
  assert.equal(validPhone("123;456"), undefined);
});
test("memory relevance is bounded and unrelated facts are not injected", () => {
  const facts = ["Prefers concise answers", "The user's bike is blue", "Works with TypeScript", "Works with TypeScript"];
  const selected = relevantMemories(facts, "Help with TypeScript");
  assert.equal(selected.includes("The user's bike is blue"), false);
  assert.equal(selected.filter(f => f.includes("TypeScript")).length, 1);
  assert.ok(selected.length <= 5);
});
test("private credentials are device-bound, scoped, expire and reject tampering", () => {
  const value = issueDeviceCredential("device-test-123", "test-secret", 1000);
  assert.equal(verifyDeviceCredential(value.credential, "test-secret", 1001), "device-test-123");
  assert.equal(verifyDeviceCredential(value.credential + "x", "test-secret", 1001), null);
  assert.equal(verifyDeviceCredential(value.credential, "other-secret", 1001), null);
  assert.equal(verifyDeviceCredential(value.credential, "test-secret", Date.parse(value.expiresAt)), null);
});
test("private middleware denies unauthenticated requests before data handlers", () => {
  let status;
  const res = { setHeader() {}, status(value) { status = value; return this; }, json() {}, locals: {} };
  requirePrivateDevice({ headers: {}, body: {}, query: {} }, res, () => assert.fail("must not enter data handler"));
  assert.equal(status, 401);
});
