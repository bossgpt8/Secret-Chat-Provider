import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { callModeResumeAction, createSpeechCompletion } from "../artifacts/mobile/modules/callModeLifecycle.ts";

const idle = {
  enabled: true, liveOpen: false, busy: false, starting: false,
  nativeActive: false, nativeMode: "turn", recording: false,
};

test("success, interruption and error each allow another hands-free turn", () => {
  let playing = false;
  let completed = 0;
  for (const terminalEvent of ["done", "stopped", "error"]) {
    playing = true;
    const finish = createSpeechCompletion(1, () => 1, () => {
      playing = false;
      completed++;
    });
    const callbacks = { done: finish, stopped: finish, error: finish };
    callbacks[terminalEvent]();
    assert.equal(callModeResumeAction({ ...idle, busy: playing }), "start");
    finish(); // Android may send a second terminal event for the same utterance.
  }
  assert.equal(completed, 3);
});

test("a cancelled generation cannot drain the new reply or restart a stopped call", () => {
  let generation = 1;
  let completed = 0;
  const oldFinish = createSpeechCompletion(generation, () => generation, () => completed++);
  generation++;
  oldFinish();
  assert.equal(completed, 0);
  assert.equal(callModeResumeAction({ ...idle, enabled: false }), "stop");
  assert.equal(callModeResumeAction({ ...idle, liveOpen: true }), "stop");
});

test("late barge startup is awaited then cleaned up before the next turn", () => {
  assert.equal(callModeResumeAction({ ...idle, starting: true, nativeMode: "barge" }), "wait");
  assert.equal(callModeResumeAction({ ...idle, nativeActive: true, nativeMode: "barge" }), "cleanup-barge");
  assert.equal(callModeResumeAction(idle), "start");
});

test("streaming and active input are never interrupted by the resume loop", () => {
  assert.equal(callModeResumeAction({ ...idle, busy: true }), "wait");
  assert.equal(callModeResumeAction({ ...idle, nativeActive: true }), "listening");
  assert.equal(callModeResumeAction({ ...idle, recording: true }), "listening");
});

test("the screen wires all phone terminal events and recorder recovery to the loop", () => {
  const source = readFileSync(new URL("../artifacts/mobile/app/(tabs)/index.tsx", import.meta.url), "utf8");
  for (const event of ["onDone", "onError", "onStopped"]) {
    assert.match(source, new RegExp(`${event}: finish`));
  }
  const recording = source.slice(source.indexOf("async function startRecording()"), source.indexOf("function stopRecordingCleanup()"));
  assert.doesNotMatch(recording, /isCallModeRef\.current = false/);
  assert.match(recording, /scheduleCallModeListening\(1000\)/);
  assert.match(source, /const action = callModeResumeAction\(/);
});
