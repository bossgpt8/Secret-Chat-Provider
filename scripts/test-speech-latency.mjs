import assert from "node:assert/strict";
import { test } from "node:test";
import { splitSpokenChunks } from "../artifacts/mobile/modules/assistantStream.ts";
test("a settled first sentence does not wait for the next token or stream end", () => {
  assert.deepEqual(splitSpokenChunks("Yes, I can help.", true, true),
    { sentences: ["Yes, I can help."], remainder: "" });
});
test("settling does not split an unfinished word or a title", () => {
  assert.equal(splitSpokenChunks("I was think", true, true).sentences.length, 0);
  assert.equal(splitSpokenChunks("Ask Dr.", true, true).sentences.length, 0);
});
test("a following token preserves decimal numbers and sentence order", () => {
  const value = splitSpokenChunks("It costs 3.50 dollars. Next sentence ", true);
  assert.deepEqual(value.sentences, ["It costs 3.50 dollars."]);
  assert.equal(value.remainder, "Next sentence ");
});
test("long voice clauses are bounded before a complete paragraph is available", () => {
  const text = "This answer deliberately contains a long explanation without sentence punctuation so that spoken playback can start earlier while generation continues";
  const value = splitSpokenChunks(text, true);
  assert.ok(value.sentences.length > 0);
  assert.equal([...value.sentences, value.remainder.trim()].join(" "), text);
});
