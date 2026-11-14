import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInbox, classifyNotification, dedupeNotifications, displayTitle,
  humanAppName, matchesQuery, resolveReplyDeepUrl, timeAgo,
} from "../artifacts/mobile/lib/notificationInbox.ts";

const item = (packageName, overrides = {}) => ({
  key: packageName, app: packageName, packageName, sender: packageName,
  text: "Notification", timestamp: 100, hasReply: false, ...overrides,
});
const torch = item("android", { text: "Flashlight is on" });
const download = item("com.android.providers.downloads", { text: "Downloading Vox offline model..." });
const message = item("com.whatsapp", { sender: "Alex", text: "See you soon", hasReply: true });

test("the screenshot's torch and downloads are activity, never personal messages", () => {
  const inbox = buildInbox([torch, download], { kind: "personal" });
  assert.equal(inbox.personal.length, 0);
  assert.equal(inbox.activity.length, 2);
  assert.deepEqual(inbox.visible, []);
  assert.equal(buildInbox([torch, download], { kind: "activity" }).visible.length, 2);
});
test("system names and titles never show package identifiers", () => {
  assert.equal(humanAppName("android", "android"), "Android System");
  assert.equal(displayTitle(torch), "Android System");
  assert.equal(displayTitle(download), "Downloads");
  assert.equal(humanAppName("com.vendor.weather", "com.vendor.weather"), "Weather");
  assert.equal(humanAppName("com.vendor.weather", "Daily Forecast"), "Daily Forecast");
});
test("known SMS apps remain personal despite vendor/system prefixes", () => {
  for (const pkg of ["com.android.mms", "com.samsung.android.messaging", "org.thoughtcrime.securesms"]) {
    assert.equal(classifyNotification(item(pkg)), "personal");
  }
});
test("unknown apps with reply actions are personal, unknown alerts remain activity", () => {
  assert.equal(classifyNotification(item("net.vendor.inbox", { hasReply: true })), "personal");
  assert.equal(classifyNotification(item("net.vendor.weather")), "activity");
});
test("search and app filters combine without mixing people and activity", () => {
  const other = item("org.telegram.messenger", { sender: "Sam", text: "Dinner?", timestamp: 200 });
  const inbox = buildInbox([torch, download, message, other], { kind: "personal", query: "ALEX", app: "com.whatsapp" });
  assert.deepEqual(inbox.visible, [message]);
  assert.equal(inbox.apps.length, 2);
  assert.equal(inbox.apps.find(a => a.packageName === "com.whatsapp").count, 1);
  assert.equal(matchesQuery(download, "downloads"), true);
  assert.equal(matchesQuery(message, "missing"), false);
});
test("most recent messages appear first without modifying source data", () => {
  const newer = { ...message, key: "new", timestamp: 200 };
  const source = [message, newer];
  assert.deepEqual(buildInbox(source, { kind: "personal" }).visible, [newer, message]);
  assert.deepEqual(source, [message, newer]);
});
test("duplicate captures keep newest, but different long messages remain distinct", () => {
  const newer = { ...message, key: "new", timestamp: 200 };
  assert.deepEqual(dedupeNotifications([message, newer]), [newer]);
  const prefix = "A".repeat(90);
  assert.equal(dedupeNotifications([
    { ...message, key: "a", text: prefix + "yes" },
    { ...message, key: "b", text: prefix + "no" },
  ]).length, 2);
});
test("deep-link drafts encode text and do not invent unsupported destinations", () => {
  assert.equal(resolveReplyDeepUrl("com.whatsapp", "WhatsApp", "Hello & hi"),
    "whatsapp://send?text=Hello%20%26%20hi");
  assert.equal(resolveReplyDeepUrl("android", "Android System", "Hi"), null);
});
test("relative time labels are deterministic", () => {
  assert.equal(timeAgo(0, 30_000), "now");
  assert.equal(timeAgo(0, 120_000), "2m");
  assert.equal(timeAgo(0, 7_200_000), "2h");
});
