// Node 24: node --test scripts/test-assistant-stream.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isPlaybackEcho, parseAssistantEvents, splitSpokenChunks, withinBudget } from "../artifacts/mobile/modules/assistantStream.ts";
import { readProviderEvents, ToolAccumulator } from "../artifacts/api-server/src/lib/chat-stream.ts";

const encoder = new TextEncoder();
const body = (chunks) => new ReadableStream({
  start(controller) {
    for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
    controller.close();
  },
});
const collect = async (stream) => {
  const events = [];
  for await (const event of readProviderEvents(stream, 100)) events.push(event);
  return events;
};

test("provider SSE preserves split UTF-8, CRLF and an unterminated last frame", async () => {
  const bytes = encoder.encode('data: {"content":"Hello 🌍"}\r\n\r\ndata: {"content":"tail"}');
  const events = await collect(body(Array.from(bytes, byte => new Uint8Array([byte]))));
  assert.deepEqual(events, [{ content: "Hello 🌍" }, { content: "tail" }]);
});
test("invalid frames do not discard valid neighbours", async () => {
  assert.deepEqual(await collect(body(['data: bad\n\ndata: {"content":"ok"}\n\ndata: [DONE]\n'])), [{ content: "ok" }]);
});
test("provider stream errors are not accepted as successful empty answers", async () => {
  await assert.rejects(collect(body(['data: {"error":{"message":"failure"}}\n'])), /stream error/);
});
test("a stalled provider stream is cancelled", async () => {
  let cancelled = false;
  const stalled = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(async () => {
    for await (const _event of readProviderEvents(stalled, 15)) { /* none */ }
  }, /timed out/);
  assert.equal(cancelled, true);
});
test("parallel tool calls accumulate by index, not into one mixed action", () => {
  const tools = new ToolAccumulator();
  tools.add([{ index: 0, function: { name: "flashlight", arguments: '{"on":' } },
    { index: 1, function: { name: "open_app", arguments: '{"app":' } }]);
  tools.add([{ index: 1, function: { arguments: '"WhatsApp"}' } },
    { index: 0, function: { arguments: 'true}' } }]);
  assert.deepEqual(tools.finish(new Set(["flashlight", "open_app"])), [
    { name: "flashlight", params: { on: true } },
    { name: "open_app", params: { app: "WhatsApp" } },
  ]);
});
test("unknown names and malformed arguments cannot execute device tools", () => {
  for (const [name, args] of [["unknown", "{}"], ["flashlight", "bad"], ["flashlight", "[]"]]) {
    const tools = new ToolAccumulator();
    tools.add([{ function: { name, arguments: args } }]);
    assert.throws(() => tools.finish(new Set(["flashlight"])));
  }
});
test("mobile parser retains every tool and error in a combined network chunk", () => {
  const events = parseAssistantEvents(
    'data: {"tool_call":{"name":"flashlight","params":{"on":true}}}\r\n' +
    'data: {"tool_call":{"name":"open_app","params":{"app":"Maps"}}}\n' +
    'data: {"error":"interrupted"}\ndata: [DONE]\n');
  assert.equal(events.length, 3);
  assert.equal(events[1].tool_call.name, "open_app");
  assert.equal(events[2].error, "interrupted");
});
test("speech chunks release early clauses without losing any words", () => {
  const text = "This is a useful explanation with enough detail to speak now, while the rest of the answer is still being generated. More follows";
  const result = splitSpokenChunks(text, true);
  assert.ok(result.sentences[0].endsWith(","));
  assert.equal([...result.sentences, result.remainder].join(" "), text);
});
test("speech chunks do not split titles or decimals", () => {
  const result = splitSpokenChunks("Dr. Jones measured 3.14 units. Next", false);
  assert.deepEqual(result.sentences, ["Dr. Jones measured 3.14 units."]);
  assert.equal(result.remainder, "Next");
});
test("unpunctuated spoken output is released in bounded chunks", () => {
  const text = Array.from({ length: 120 }, (_, index) => `word${index}`).join(" ");
  const result = splitSpokenChunks(text, true);
  assert.ok(result.sentences.length > 1);
  assert.equal([...result.sentences, result.remainder].filter(Boolean).join(" "), text);
});
test("slow or rejected optional context never blocks the reply", async () => {
  assert.equal(await withinBudget(new Promise(() => {}), 15, "cached"), "cached");
  assert.equal(await withinBudget(Promise.reject(new Error("offline")), 15, undefined), undefined);
  assert.equal(await withinBudget(Promise.resolve("fresh"), 15, "cached"), "fresh");
});
test("empty finalized recognition never promotes partial words into a device command", () => {
  const source = readFileSync(new URL("../artifacts/mobile/app/(tabs)/index.tsx", import.meta.url), "utf8");
  const resultHandler = source.split("const unsubResult = NativeSpeechRecognizer.onResult")[1].split("const unsubError")[0];
  assert.doesNotMatch(resultHandler, /text\s*\|\|\s*nativeSpeechTextRef/);
  assert.match(resultHandler, /const transcript = \(text \|\| ""\)\.trim\(\)/);
});
test("playback echo does not become a new voice command", () => {
  assert.equal(isPlaybackEcho("the weather is sunny", "The weather is sunny today."), true);
  assert.equal(isPlaybackEcho("WEATHER, is sunny!", "The weather is sunny today."), true);
  assert.equal(isPlaybackEcho("Stop, I have another question", "The weather is sunny today."), false);
  assert.equal(isPlaybackEcho("Turn off the torch", "Here is your weather forecast."), false);
  assert.equal(isPlaybackEcho("", "Ready to help."), false);
});
