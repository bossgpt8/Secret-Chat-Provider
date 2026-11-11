import { test, after } from "node:test";
import assert from "node:assert/strict";
import { customFetch, setBaseUrl } from "../lib/api-client-react/src/custom-fetch.ts";
const original = globalThis.fetch;
after(() => { globalThis.fetch = original; setBaseUrl(null); });
test("per-request origins keep paired credentials isolated during concurrent server changes", async () => {
  const seen = [];
  globalThis.fetch = async (url, options) => {
    seen.push({ url, token: options.headers.get("Authorization"), extra: options.baseUrl });
    return new Response("{}", { headers: { "Content-Type": "application/json" } });
  };
  setBaseUrl("https://unrelated.example");
  await Promise.all([
    customFetch("/api/memory", { baseUrl: "https://paired-a.example", headers: { Authorization: "Bearer synthetic-a" } }),
    customFetch("/api/memory", { baseUrl: "https://paired-b.example", headers: { Authorization: "Bearer synthetic-b" } }),
  ]);
  assert.deepEqual(seen.map(x => [x.url, x.token]), [
    ["https://paired-a.example/api/memory", "Bearer synthetic-a"],
    ["https://paired-b.example/api/memory", "Bearer synthetic-b"],
  ]);
  assert.ok(seen.every(x => x.extra === undefined));
});
test("ordinary generated-client calls retain the configured default origin", async () => {
  let url;
  globalThis.fetch = async input => { url = input; return new Response("{}", { headers: { "Content-Type": "application/json" } }); };
  setBaseUrl("https://default.example/");
  await customFetch("/api/healthz");
  assert.equal(url, "https://default.example/api/healthz");
});
