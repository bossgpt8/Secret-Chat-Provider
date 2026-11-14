import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { shouldSpeakIncomingNotification } from "../artifacts/mobile/modules/notificationSpeechPolicy.ts";

test("notification reading stays off in hands-free and regular chat", () => {
  for (const callMode of [false, true]) {
    assert.equal(
      shouldSpeakIncomingNotification({ enabled: false, streaming: false, callMode }),
      false,
    );
  }
});

test("notifications are not announced while the assistant is streaming", () => {
  assert.equal(
    shouldSpeakIncomingNotification({ enabled: true, streaming: true, callMode: true }),
    false,
  );
});

test("enabled notifications can be announced after streaming ends", () => {
  assert.equal(
    shouldSpeakIncomingNotification({ enabled: true, streaming: false, callMode: true }),
    true,
  );
});

test("native notification listener filters Vox's own status notifications", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const screen = readFileSync(
    path.join(root, "artifacts/mobile/app/(tabs)/index.tsx"),
    "utf8",
  );
  const service = readFileSync(
    path.join(root, "artifacts/mobile/plugins/kotlin/VoxNotificationService.kt"),
    "utf8",
  );
  assert.match(screen, /if \(!shouldSpeakIncomingNotification\(/);
  assert.match(screen, /if \(!readIncomingEnabled\) pendingNotifSpeechRef\.current = \[\]/);
  assert.match(screen, /if \(!readIncomingEnabledRef\.current\) pendingNotifSpeechRef\.current = \[\]/);
  assert.match(service, /if \(sbn\.packageName == packageName\) return/);
});
