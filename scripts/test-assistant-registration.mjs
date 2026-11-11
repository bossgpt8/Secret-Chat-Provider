import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const appPath = new URL("../artifacts/mobile/app.json", import.meta.url);
const config = JSON.parse(readFileSync(appPath, "utf8")).expo;
const requireMobile = createRequire(new URL("../artifacts/mobile/package.json", import.meta.url));
const { AndroidConfig } = requireMobile("expo/config-plugins");

test("Expo generates standard assistant actions and categories on MainActivity", () => {
  const manifest = { manifest: { application: [{
    $: { "android:name": ".MainApplication" },
    activity: [{
      $: { "android:name": ".MainActivity" },
      "intent-filter": [{
        action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
        category: [{ $: { "android:name": "android.intent.category.LAUNCHER" } }],
      }],
    }],
  }] } };
  const generated = AndroidConfig.IntentFilters.setAndroidIntentFilters(config, manifest);
  const activity = generated.manifest.application[0].activity[0];
  for (const action of ["ASSIST", "VOICE_COMMAND"]) {
    const filter = activity["intent-filter"].find((f) =>
      f.action?.some((a) => a.$["android:name"] === `android.intent.action.${action}`));
    assert.ok(filter, `${action} must resolve to Android's exact standard intent`);
    assert.ok(filter.category?.some((c) => c.$["android:name"] === "android.intent.category.DEFAULT"));
  }
  assert.equal(activity["intent-filter"].filter((f) => f.action?.some((a) =>
    a.$["android:name"].includes("android.intent.action.android.intent.action"))).length, 0);
});
