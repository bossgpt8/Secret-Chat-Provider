import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(new URL("../artifacts/mobile/package.json", import.meta.url));
const ts = require("typescript");
const source = readFileSync(new URL("../artifacts/mobile/modules/NativeScreenLock.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function bridge(native, os = "android") {
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: () => ({ NativeModules: { ScreenLockModule: native }, Platform: { OS: os } }),
  });
  return exports.NativeScreenLock;
}

test("missing native support rejects visibly rather than silently succeeding", async () => {
  for (const native of [undefined, {}]) {
    await assert.rejects(bridge(native).requestAdmin(), /Android build with screen-lock support/);
  }
});
test("non-Android requests never launch native settings", async () => {
  let called = false;
  await assert.rejects(bridge({ requestAdmin() { called = true; } }, "web").requestAdmin(), /not available/);
  assert.equal(called, false);
});
test("older APK null result remains compatible", async () => {
  assert.equal(await bridge({ async requestAdmin() { return null; } }).requestAdmin(), "activation");
});
test("native launch destinations are returned, not interpreted as permission grants", async () => {
  for (const destination of ["activation", "security-settings", "already-enabled"]) {
    assert.equal(await bridge({ async requestAdmin() { return destination; } }).requestAdmin(), destination);
  }
});
test("native failures reach the permission UI", async () => {
  await assert.rejects(bridge({ async requestAdmin() { throw new Error("Android blocked launch"); } }).requestAdmin(), /blocked launch/);
});
test("Android activation uses foreground Activity and security settings fallback", () => {
  const kotlin = readFileSync(new URL("../artifacts/mobile/plugins/kotlin/ScreenLockModule.kt", import.meta.url), "utf8");
  assert.match(kotlin, /reactApplicationContext\.currentActivity/);
  assert.match(kotlin, /activity\.runOnUiThread/);
  assert.match(kotlin, /activity\.startActivity\(intent\)/);
  assert.match(kotlin, /Settings\.ACTION_SECURITY_SETTINGS/);
  assert.doesNotMatch(kotlin, /reactApplicationContext\.startActivity|FLAG_ACTIVITY_NEW_TASK/);
});
test("device administration remains limited to screen locking", () => {
  const policy = readFileSync(new URL("../artifacts/mobile/plugins/xml/device_admin.xml", import.meta.url), "utf8");
  assert.match(policy, /<force-lock\s*\/>/);
  assert.doesNotMatch(policy, /wipe-data|reset-password|watch-login/);
});
