import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chatComposerBottomPadding } from "../artifacts/mobile/modules/chatKeyboard.ts";
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
test("composer preserves navigation clearance with the keyboard closed", () => {
  assert.equal(chatComposerBottomPadding(0, 0), 57);
  assert.equal(chatComposerBottomPadding(24, 0), 81);
});
test("open keyboard removes the old tab-bar/safe-area gap", () => {
  for (const inset of [0, 24, 34, 48]) assert.equal(chatComposerBottomPadding(inset, 1), 8);
});
test("padding follows the animation continuously without a post-show state jump", () => {
  let previous = Infinity;
  for (let i = 0; i <= 100; i++) {
    const value = chatComposerBottomPadding(24, i / 100);
    assert.ok(value <= previous && value >= 8);
    previous = value;
  }
  assert.equal(chatComposerBottomPadding(24, .5), 44.5);
  assert.equal(chatComposerBottomPadding(24, 1.1), 8);
  assert.equal(chatComposerBottomPadding(24, -.1), 81);
});
test("chat uses one keyboard-controller avoider and a stable input", () => {
  const chat = source("artifacts/mobile/app/(tabs)/index.tsx");
  assert.match(chat, /import \{ KeyboardAvoidingView, useReanimatedKeyboardAnimation \} from "react-native-keyboard-controller"/);
  assert.equal((chat.match(/<KeyboardAvoidingView\b/g) || []).length, 1);
  assert.match(chat, /<Reanimated\.View style=\{\[styles\.inputBar/);
  const input = chat.slice(chat.indexOf("<TextInput\n                ref={inputRef}"));
  assert.ok(input.startsWith("<TextInput"));
  assert.doesNotMatch(input.slice(0, input.indexOf("/>")), /\bkey=|autoFocus=|onContentSizeChange=/);
  assert.match(source("artifacts/mobile/app/_layout.tsx"), /<KeyboardProvider preload=\{false\}>/);
  assert.match(source("artifacts/mobile/app/(tabs)/_layout.tsx"), /tabBarHideOnKeyboard: true/);
});
test("the legacy Android build does not acquire a New-Architecture-only animation engine", () => {
  const config = JSON.parse(source("artifacts/mobile/app.json"));
  const pkg = JSON.parse(source("artifacts/mobile/package.json"));
  if (config.expo.newArchEnabled === false) {
    assert.match(pkg.dependencies["react-native-reanimated"], /^~?3\./);
  }
  assert.equal(pkg.dependencies["react-native-keyboard-controller"], "1.18.5");
});
