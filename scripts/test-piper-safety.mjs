import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createPiperSafety, PIPER_ATTEMPT_KEY, restoreVoiceProvider } from "../artifacts/mobile/modules/piperSafety.ts";

function fixture(overrides = {}, storageOverrides = {}, timeout = 50) {
  const data = new Map();
  const calls = [];
  const storage = {
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) { data.set(key, value); },
    async removeItem(key) { data.delete(key); },
    ...storageOverrides,
  };
  const engine = {
    async getReadiness() { return { supported: true }; },
    async synthesize() {
      assert.equal(data.get(PIPER_ATTEMPT_KEY), "1", "recovery marker must precede native inference");
      calls.push("synthesize");
      return "/cache/voice.wav";
    },
    async unloadModel() { calls.push("unload"); return true; },
    ...overrides,
  };
  return { safety: createPiperSafety(storage, engine, timeout), data, calls };
}
test("a saved Piper selection starts with Phone without loading native inference", () => {
  assert.deepEqual(restoreVoiceProvider("piper", null), { provider: "phone", recovered: true, interrupted: false });
});
test("an unfinished attempt recovers Phone even if another provider was stored", () => {
  assert.deepEqual(restoreVoiceProvider("kokoro", "1"), { provider: "phone", recovered: true, interrupted: true });
});
test("unrelated voice selections are preserved on an ordinary restart", () => {
  for (const provider of ["phone", "kokoro", "elevenlabs"]) {
    assert.deepEqual(restoreVoiceProvider(provider, null), { provider, recovered: false, interrupted: false });
  }
});
test("successful synthesis writes and then clears the durable marker", async () => {
  const { safety, data, calls } = fixture();
  assert.equal(await safety.synthesize("Hello", "voice.onnx", "voice.json"), "/cache/voice.wav");
  assert.equal(data.has(PIPER_ATTEMPT_KEY), false);
  assert.deepEqual(calls, ["synthesize"]);
});
test("unsupported builds do not enter native inference", async () => {
  const { safety, calls, data } = fixture({
    async getReadiness() { return { supported: false, reason: "32-bit APK" }; },
  });
  await assert.rejects(safety.synthesize("Hello", "model", "config"), /32-bit/);
  assert.equal(calls.includes("synthesize"), false);
  assert.equal(data.has(PIPER_ATTEMPT_KEY), false);
  assert.equal((await safety.getReadiness()).supported, false);
});
test("storage failure prevents an unprotected native attempt", async () => {
  const { safety, calls } = fixture({}, { async setItem() { throw new Error("storage failed"); } });
  await assert.rejects(safety.synthesize("Hello", "model", "config"), /storage failed/);
  assert.equal(calls.includes("synthesize"), false);
});
test("a native error preserves recovery and blocks automatic retries", async () => {
  let attempts = 0;
  const { safety, data } = fixture({ async synthesize() { attempts++; throw new Error("native library failed"); } });
  await assert.rejects(safety.synthesize("Hello", "model", "config"), /native library/);
  assert.equal(data.get(PIPER_ATTEMPT_KEY), "1");
  await assert.rejects(safety.synthesize("Retry", "model", "config"), /native library/);
  assert.equal(attempts, 1);
});
test("a timeout keeps recovery even when the native job completes later", async () => {
  let complete;
  const { safety, data } = fixture({ synthesize() { return new Promise(resolve => { complete = resolve; }); } }, {}, 10);
  await assert.rejects(safety.synthesize("Hello", "model", "config"), /timed out/);
  complete("/cache/late.wav");
  await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(data.get(PIPER_ATTEMPT_KEY), "1");
  await assert.rejects(safety.synthesize("Retry", "model", "config"), /timed out/);
});
test("concurrent sentences cannot start concurrent native synthesis", async () => {
  let complete;
  const { safety } = fixture({ synthesize() { return new Promise(resolve => { complete = resolve; }); } });
  const first = safety.synthesize("First", "model", "config");
  await assert.rejects(safety.synthesize("Second", "model", "config"), /already generating/);
  await new Promise(resolve => setTimeout(resolve, 1));
  complete("/cache/voice.wav");
  await first;
});
test("unknown pronunciation and intentional cancellation do not poison Piper for the session", async () => {
  for (const code of ["ERR_PIPER_PRONUNCIATION", "ERR_PIPER_CANCELLED"]) {
    let attempts = 0;
    const { safety, data } = fixture({ async synthesize() {
      if (!attempts++) throw Object.assign(new Error("Recoverable phrase outcome"), { code });
      return "/cache/retry.wav";
    } });
    await assert.rejects(safety.synthesize("One phrase", "model", "config"), /Recoverable/);
    assert.equal(data.has(PIPER_ATTEMPT_KEY), false);
    assert.equal(await safety.synthesize("Another phrase", "model", "config"), "/cache/retry.wav");
  }
});
test("native guard catches incompatible libraries and checks process architecture before ONNX", () => {
  const source = readFileSync(new URL("../artifacts/mobile/plugins/kotlin/VoxPiperModule.kt", import.meta.url), "utf8");
  assert.match(source, /catch \(e: LinkageError\)/);
  assert.match(source, /Process\.is64Bit\(\)/);
  assert.ok(source.indexOf("supportIssue()?.let") < source.indexOf("ortEnv.createSession"));
});
