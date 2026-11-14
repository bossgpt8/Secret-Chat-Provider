import assert from "node:assert/strict";
import { test } from "node:test";
import { validCloudEntries } from "../artifacts/api-server/src/lib/cloud-validation.ts";
test("valid snapshots accept supported preferences and empty histories", () => {
  assert.equal(validCloudEntries({ "@vox_assistant_name": "Boss", "@vox_conversations": "[]", "@vox_speech_rate": "0.9" }), true);
});
test("invalid JSON and malformed conversation entries cannot poison a restored phone", () => {
  assert.equal(validCloudEntries({ "@vox_conversations": "broken" }), false);
  assert.equal(validCloudEntries({ "@vox_conversations": '[{"id":"a","messages":null}]' }), false);
  assert.equal(validCloudEntries({ "@vox_theme": "unknown" }), false);
});
test("arbitrary private keys cannot be added to the cloud payload", () => {
  assert.equal(validCloudEntries({ "@vox_custom_api_url": "https://example.test" }), false);
  assert.equal(validCloudEntries({ "@vox_notifications": "[]" }), false);
});
