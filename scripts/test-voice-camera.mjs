// Run with Node 24: node --test scripts/test-voice-camera.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { describeImage, VisionError } from "../artifacts/api-server/src/lib/vision.ts";
import { splitPiperText } from "../artifacts/mobile/modules/speechChunks.ts";

const photo = { image: Buffer.from("test-image"), mimeType: "image/jpeg", prompt: "What do you see?" };
const answer = (text) => Response.json({ choices: [{ message: { content: text } }] });

test("Piper chunks preserve every word and stay within the native limit", () => {
  const text = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
  const chunks = splitPiperText(text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length > 0 && chunk.length <= 180));
  assert.equal(chunks.join(" "), text);
});

test("Piper bounds a single unusually long word without dropping characters", () => {
  const text = "x".repeat(1000);
  const chunks = splitPiperText(text);
  assert.ok(chunks.every((chunk) => chunk.length <= 180));
  assert.equal(chunks.join(""), text);
  assert.deepEqual(splitPiperText(" \n "), []);
});

test("Groq-only camera requests actually send image and question to Groq", async () => {
  let calls = 0;
  const result = await describeImage({
    ...photo, groqKey: "test-key",
    fetcher: async (url, init) => {
      calls++;
      assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
      const body = JSON.parse(init.body);
      assert.equal(body.model, "qwen/qwen3.8-27b");
      assert.equal(body.reasoning_effort, "none");
      assert.equal(body.messages[0].content[0].text, photo.prompt);
      assert.equal(body.messages[0].content[1].image_url.url, `data:image/jpeg;base64,${photo.image.toString("base64")}`);
      assert.ok(init.signal);
      return answer(" A blue cup. ");
    },
  });
  assert.equal(calls, 1);
  assert.equal(result, "A blue cup.");
});

test("camera falls back to configured OpenRouter when Groq rejects a request", async () => {
  const urls = [];
  const result = await describeImage({
    ...photo, groqKey: "groq-test", openRouterKey: "router-test",
    fetcher: async (url) => {
      urls.push(url);
      return urls.length === 1 ? new Response("", { status: 429 }) : answer("A desk.");
    },
  });
  assert.equal(urls.length, 2);
  assert.match(urls[1], /openrouter/);
  assert.equal(result, "A desk.");
});

test("camera supports OpenRouter-only and an overridden model", async () => {
  const result = await describeImage({
    ...photo, openRouterKey: "test", openRouterModel: "configured-vision-model",
    fetcher: async (_url, init) => {
      assert.equal(JSON.parse(init.body).model, "configured-vision-model");
      return answer("A book.");
    },
  });
  assert.equal(result, "A book.");
});

test("missing keys produce an actionable error without attempting a request", async () => {
  await assert.rejects(describeImage({ ...photo, fetcher: async () => assert.fail("No request expected") }),
    (error) => error instanceof VisionError && error.status === 503 && error.message.includes("GROQ_API_KEY"));
});

test("rate limits and rejected keys are not reported as camera capture errors", async () => {
  for (const [status, message] of [[429, /provider limit/], [401, /API key/]]) {
    await assert.rejects(describeImage({
      ...photo, groqKey: "test", fetcher: async () => new Response("private-upstream-details", { status }),
    }), (error) => {
      assert.match(error.message, message);
      assert.ok(!error.message.includes("private-upstream-details"));
      return error.status === 502;
    });
  }
});

test("empty descriptions never masquerade as successful answers", async () => {
  await assert.rejects(describeImage({ ...photo, groqKey: "test", fetcher: async () => answer("") }), VisionError);
});

test("provider timeouts produce a useful error", async () => {
  await assert.rejects(describeImage({
    ...photo, groqKey: "test",
    fetcher: async () => { throw new DOMException("timeout", "TimeoutError"); },
  }), /timed out/);
});

test("unsupported and oversized images fail before calling the provider", async () => {
  const fetcher = async () => assert.fail("No request expected");
  await assert.rejects(describeImage({ ...photo, mimeType: "text/plain", groqKey: "test", fetcher }),
    (error) => error.status === 415);
  await assert.rejects(describeImage({ ...photo, image: Buffer.alloc(10 * 1024 * 1024 + 1), groqKey: "test", fetcher }),
    (error) => error.status === 413);
});
