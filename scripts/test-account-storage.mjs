import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(new URL("../artifacts/mobile/package.json", import.meta.url));
const ts = require("typescript");
function fixture() {
  const values = new Map();
  const storage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
    multiGet: async keys => keys.map(key => [key, values.get(key) ?? null]),
    multiSet: async pairs => { for (const [key, value] of pairs) values.set(key, value); },
    multiRemove: async keys => { for (const key of keys) values.delete(key); },
  };
  const source = readFileSync(new URL("../artifacts/mobile/modules/accountStorage.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require: () => ({ default: storage, __esModule: true }), Set, Object, JSON });
  return { ...exports, values };
}
test("guest and two signed-in accounts never share local chat/profile data", async () => {
  const api = fixture();
  for (const scope of ["guest", "alice", "bob"]) {
    const store = api.scopedStorage(scope);
    await store.setItem("@vox_conversations", scope);
    await store.setItem("@vox_user_profile", scope);
  }
  for (const scope of ["guest", "alice", "bob"]) {
    assert.equal(await api.scopedStorage(scope).getItem("@vox_conversations"), scope);
    assert.equal(await api.scopedStorage(scope).getItem("@vox_user_profile"), scope);
  }
});
test("scope captured before account switches cannot write into next account", async () => {
  const api = fixture();
  const old = api.scopedStorage("alice");
  api.setStorageScope("bob");
  await old.setItem("@vox_conversations", "alice");
  assert.equal(await api.scopedStorage("bob").getItem("@vox_conversations"), null);
});
test("cloud allowlist excludes credentials, notifications, notes, recordings, permissions", async () => {
  const api = fixture(), store = api.scopedStorage("alice");
  for (const key of ["@vox_assistant_name", "@vox_notes", "@vox_user_profile", "@vox_device_id", "@vox_wake_word"]) await store.setItem(key, "private");
  const entries = await api.readAccountEntries("alice");
  assert.deepEqual(Object.keys(entries), ["@vox_assistant_name"]);
});
test("snapshot restore removes deleted synced keys but preserves local-only notes", async () => {
  const api = fixture(), store = api.scopedStorage("alice");
  await store.setItem("@vox_notes", "local");
  await store.setItem("@vox_conversations", "old");
  await api.writeAccountEntries("alice", { "@vox_assistant_name": "Boss" });
  assert.equal(await store.getItem("@vox_conversations"), null);
  assert.equal(await store.getItem("@vox_notes"), "local");
});
test("canonical snapshots ignore PostgreSQL JSON object key ordering", () => {
  const api = fixture();
  assert.equal(api.canonicalEntries({ b: "2", a: "1" }), api.canonicalEntries({ a: "1", b: "2" }));
});
