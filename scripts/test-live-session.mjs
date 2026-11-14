import assert from "node:assert/strict";
import { test } from "node:test";
import { LiveSession, appendTranscript } from "../artifacts/mobile/modules/liveSession.ts";
import { LiveSessionBudget, pairingCode, verifyPairingCode, issueLiveCredential, verifyLiveCredential } from "../artifacts/api-server/src/lib/live-access.ts";

const tick = () => new Promise(resolve => setTimeout(resolve, 5));
test("visual frames require a connected session and stop immediately at end", async () => {
  const f = fixture();
  assert.equal(f.session.sendVideoFrame("AQI="), false);
  f.session.start("short-token", setup, new Date(Date.now() + 120000).toISOString(), []);
  f.socket.onopen();
  await f.receive({ setupComplete: {} });
  assert.equal(f.session.sendVideoFrame("AQI="), true);
  assert.deepEqual(f.sent.at(-1), { realtimeInput: { video: { mimeType: "image/jpeg", data: "AQI=" } } });
  assert.equal(f.session.sendVideoFrame("a".repeat(2_000_001)), false);
  f.socket.bufferedAmount = 128001;
  assert.equal(f.session.sendVideoFrame("AQI="), false);
  await f.session.stop();
  assert.equal(f.session.sendVideoFrame("AQI="), false);
});
const setup = { model: "models/test-live", tools: [{ functionDeclarations: [{
  name: "flashlight", parameters: { required: ["on"], properties: { on: { type: "BOOLEAN" } } },
}] }] };
function fixture(execute = async () => "Flashlight is on.") {
  const calls = [], phases = [], sent = [], turns = [], subscriptions = {};
  const audio = {
    async start() { calls.push("start"); }, async stop() { calls.push("stop"); },
    async interrupt() { calls.push("interrupt"); }, async playChunk(data) { calls.push(["play", data]); },
    async setMuted(value) { calls.push(["mute", value]); },
    onInput(fn) { subscriptions.input = fn; return () => { delete subscriptions.input; }; },
    onPlayback(fn) { subscriptions.playback = fn; return () => { delete subscriptions.playback; }; },
    onError(fn) { subscriptions.error = fn; return () => { delete subscriptions.error; }; },
  };
  const socket = { onopen: null, onmessage: null, onerror: null, onclose: null,
    bufferedAmount: 0, send(data) { sent.push(JSON.parse(data)); }, close() { calls.push("close"); } };
  let socketUrl = "";
  const session = new LiveSession({ audio, socket(url) { socketUrl = url; return socket; },
    onPhase(phase, detail) { phases.push([phase, detail]); }, onTranscript() {},
    onTurn(turn) { turns.push(turn); }, executeTool: execute });
  return { session, calls, sent, phases, turns, subscriptions, socket,
    url: () => socketUrl,
    start(expiry = Date.now() + 60000) { session.start("short-lived-test-token", setup, new Date(expiry).toISOString()); socket.onopen(); },
    async receive(event) { socket.onmessage({ data: JSON.stringify(event) }); await tick(); },
  };
}

test("microphone starts only after Live setup succeeds; tokens are not permanent keys", async () => {
  const f = fixture(); f.start();
  assert.equal(f.calls.includes("start"), false);
  assert.match(f.url(), /BidiGenerateContentConstrained\?access_token=short-lived-test-token/);
  assert.deepEqual(f.sent[0], { setup });
  await f.receive({ setupComplete: {} });
  f.subscriptions.input({ data: "AQI=", level: 0.2 });
  assert.deepEqual(f.sent[1], { realtimeInput: { audio: { data: "AQI=", mimeType: "audio/pcm;rate=16000" } } });
  await f.session.stop();
  assert.equal(Object.keys(f.subscriptions).length, 0);
});
test("model audio plays as chunks and transcripts are retained in chat turns", async () => {
  const f = fixture(); f.start(); await f.receive({ setupComplete: {} });
  await f.receive({ serverContent: { inputTranscription: { text: "Hello" },
    outputTranscription: { text: "Hi there" },
    modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: "AQI=" } }] } } });
  assert.deepEqual(f.calls.find(call => Array.isArray(call)), ["play", "AQI="]);
  await f.receive({ serverContent: { turnComplete: true } });
  assert.deepEqual(f.turns, [{ input: "Hello", output: "Hi there", interrupted: false }]);
  await f.session.stop();
  assert.equal(f.turns.length, 1);
});
test("binary WebSocket JSON frames are decoded before audio handling", async () => {
  const f = fixture(); f.start();
  f.socket.onmessage({ data: new TextEncoder().encode(JSON.stringify({ setupComplete: {} })).buffer });
  await tick();
  assert.ok(f.calls.includes("start"));
  await f.session.stop();
});
test("barge-in clears playback and does not play stale audio from its interruption frame", async () => {
  const f = fixture(); f.start(); await f.receive({ setupComplete: {} });
  await f.receive({ serverContent: { interrupted: true,
    modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm", data: "OLD" } }] } } });
  assert.ok(f.calls.includes("interrupt"));
  assert.equal(f.calls.some(call => Array.isArray(call) && call[0] === "play"), false);
  await f.session.stop();
});
test("tool outcomes are returned only after execution and duplicate IDs do not repeat actions", async () => {
  let complete, executions = 0;
  const f = fixture(() => { executions++; return new Promise(resolve => { complete = resolve; }); });
  f.start(); await f.receive({ setupComplete: {} });
  const tool = { toolCall: { functionCalls: [{ id: "one", name: "flashlight", args: { on: true } }] } };
  await f.receive(tool); await f.receive(tool);
  assert.equal(executions, 1);
  assert.equal(f.sent.some(event => event.toolResponse), false);
  complete("Android confirmed the torch.");
  await tick();
  assert.equal(f.sent.at(-1).toolResponse.functionResponses[0].response.result, "Android confirmed the torch.");
  await f.receive(tool); assert.equal(executions, 1);
  await f.session.stop();
});
test("missing or wrong-type required tool arguments cannot change the device", async () => {
  let executions = 0;
  const f = fixture(async () => { executions++; return "should not run"; });
  f.start(); await f.receive({ setupComplete: {} });
  await f.receive({ toolCall: { functionCalls: [
    { id: "missing", name: "flashlight" }, { id: "wrong", name: "flashlight", args: { on: "yes" } },
  ] } });
  assert.equal(executions, 0);
  assert.equal(f.sent.filter(event => event.toolResponse).length, 2);
  assert.ok(f.sent.at(-1).toolResponse.functionResponses[0].response.error);
  await f.session.stop();
});
test("cancelled tools do not report success or execute again", async () => {
  let complete, signal, count = 0;
  const f = fixture((_name, _args, received) => { count++; signal = received; return new Promise(resolve => { complete = resolve; }); });
  f.start(); await f.receive({ setupComplete: {} });
  await f.receive({ toolCall: { functionCalls: [{ id: "cancel", name: "flashlight", args: { on: true } }] } });
  await f.receive({ toolCallCancellation: { ids: ["cancel"] } });
  assert.equal(signal.aborted, true);
  complete("late outcome"); await tick();
  await f.receive({ toolCall: { functionCalls: [{ id: "cancel", name: "flashlight", args: { on: true } }] } });
  assert.equal(count, 1);
  assert.equal(f.sent.some(event => event.toolResponse), false);
  await f.session.stop();
});
test("quota/protocol errors stop audio without starting another provider", async () => {
  const f = fixture(); f.start(); await f.receive({ error: { code: 429 } });
  assert.ok(f.calls.includes("stop")); assert.ok(f.calls.includes("close"));
  assert.equal(f.phases.at(-1)[0], "error");
});
test("network backpressure closes the stream instead of building an unbounded microphone queue", async () => {
  const f = fixture(); f.start(); await f.receive({ setupComplete: {} });
  f.socket.bufferedAmount = 130000;
  f.subscriptions.input({ data: "PCM", level: 0 }); await tick();
  assert.equal(f.phases.at(-1)[0], "error");
  assert.ok(f.calls.includes("stop"));
});
test("short session expiry releases audio and does not reconnect automatically", async () => {
  const f = fixture(); f.start(Date.now() + 25);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.ok(f.calls.includes("stop")); assert.equal(f.phases.at(-1)[0], "ended");
});
test("mute ends the input stream and manual interrupt clears playback", async () => {
  const f = fixture(); f.start(); await f.receive({ setupComplete: {} });
  await f.session.setMuted(true);
  assert.equal(f.sent.at(-1).realtimeInput.audioStreamEnd, true);
  await f.session.interrupt();
  assert.ok(f.calls.includes("interrupt")); assert.equal(f.sent.at(-1).clientContent.turnComplete, false);
  await f.session.stop();
});
test("transcript deltas and cumulative updates do not duplicate a full sentence", () => {
  assert.equal(appendTranscript("Hello", "Hello there"), "Hello there");
  assert.equal(appendTranscript("Hello", " there"), "Hello there");
  assert.equal(appendTranscript("Hello there", "."), "Hello there.");
});
test("pairing codes are fresh, short-lived, formatted safely and secret-specific", () => {
  const now = 1800000000000;
  const code = pairingCode("dummy-secret", now);
  assert.equal(verifyPairingCode(code.match(/.{1,4}/g).join("-"), "dummy-secret", now), true);
  assert.equal(verifyPairingCode(code, "different-secret", now), false);
  assert.equal(verifyPairingCode(code, "dummy-secret", now + 15 * 60000), false);
  assert.equal(verifyPairingCode("🔥".repeat(20), "dummy-secret", now), false);
  assert.notEqual(pairingCode("dummy-secret", now), pairingCode("dummy-secret", now));
});
test("Live-only credentials reject tampering, wrong secrets and expiry", () => {
  const now = 1800000000000;
  const issued = issueLiveCredential("dummy-secret", now);
  assert.equal(typeof verifyLiveCredential(issued.credential, "dummy-secret", now), "string");
  assert.equal(verifyLiveCredential(issued.credential, "other-secret", now), null);
  assert.equal(verifyLiveCredential(issued.credential + "x", "dummy-secret", now), null);
  assert.equal(verifyLiveCredential(issued.credential, "dummy-secret", now + 8 * 86400000), null);
  assert.equal(verifyLiveCredential("🚫.🔥", "dummy-secret", now), null);
});
test("session budgets enforce device/global limits and reset on the next UTC day", () => {
  const budget = new LiveSessionBudget(), now = Date.UTC(2030, 1, 1);
  for (let device = 0; device < 3; device++) {
    for (let count = 0; count < 20; count++) assert.equal(budget.take(`phone-${device}`, now), true);
    assert.equal(budget.take(`phone-${device}`, now), false);
  }
  assert.equal(budget.take("another-phone", now), false);
  assert.equal(budget.take("phone-0", now + 86400000), true);
});
