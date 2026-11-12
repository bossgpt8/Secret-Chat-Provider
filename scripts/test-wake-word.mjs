import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { wakePhraseForName } from "../artifacts/mobile/modules/wakePhrase.ts";

const require = createRequire(import.meta.url);
const { INPUTS, readSentencePieceVocabulary } = require("../artifacts/mobile/plugins/withWakeWord.js");
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("wake phrase follows the selected assistant name, not the product name", () => {
  for (const name of ["Vox", "Boss", "Zeno", "Jarvis", "Mary", "Alexa", "My Assistant"]) {
    assert.equal(wakePhraseForName(name), `Hey ${name}`);
  }
});
test("wake names normalize whitespace and preserve visible spelling", () => {
  assert.equal(wakePhraseForName("  My   Assistant  "), "Hey My Assistant");
  assert.equal(wakePhraseForName("J.A.R.V.I.S."), "Hey J.A.R.V.I.S.");
  assert.equal(wakePhraseForName("Anne-Marie"), "Hey Anne-Marie");
});
test("unsupported names fail explicitly, without falling back to Hey Vox", () => {
  for (const name of ["", "   ", "你好", "123", "A".repeat(41), "../file", "Vox\n[unk]"]) {
    assert.throws(() => wakePhraseForName(name), /Wake listening currently supports/);
  }
});
test("every downloaded build dependency is HTTPS and checksum-pinned", () => {
  assert.equal(INPUTS.length, 5);
  assert.ok(INPUTS.some(input => input.name === "cmudict.dict"));
  assert.ok(INPUTS.some(input => input.name === "cmudict-LICENSE.txt"));
  for (const input of INPUTS) {
    assert.match(input.url, /^https:\/\//);
    assert.match(input.sha256, /^[a-f0-9]{64}$/);
  }
});
test("SentencePiece vocabulary reader extracts actual scores from protobuf", () => {
  // ModelProto { pieces: [{piece:'A', score:-1.5}] }.
  const score = Buffer.alloc(4); score.writeFloatLE(-1.5);
  const piece = Buffer.concat([Buffer.from([0x0a, 1, 65, 0x15]), score]);
  const model = Buffer.concat([Buffer.from([0x0a, piece.length]), piece]);
  assert.deepEqual(readSentencePieceVocabulary(model), [["A", -1.5]]);
  assert.throws(() => readSentencePieceVocabulary(Buffer.from([0x0a, 8, 1])), /Truncated/);
});
test("source contract: neither old listener can acquire a second wake microphone", () => {
  const chat = read("artifacts/mobile/app/(tabs)/index.tsx");
  const overlay = read("artifacts/mobile/plugins/kotlin/VoxOverlayService.kt");
  assert.doesNotMatch(chat, /wakeWordLoopTick|wakeWordLoopRef|wakeRecordingRef/);
  assert.doesNotMatch(overlay, /SpeechRecognizer|AudioRecord|startRecognitionLoop/);
  assert.match(chat, /await NativeWakeWord\.setPaused\(true\)/);
  assert.match(chat, /await NativeWakeWord\.setPaused\(true, "live"\)/);
});
test("source contract: native engine hands off only after releasing microphone", () => {
  const engine = read("artifacts/mobile/plugins/kotlin/VoxWakeEngine.kt");
  assert.ok(engine.indexOf("record?.release()") < engine.indexOf("if (detected) onWake()"));
  assert.match(engine, /kws\.createStream\(keywords\)/);
  assert.match(engine, /tokenizer!!\.keywords\(name\)/);
  assert.match(engine, /session == generation\.get\(\)/);
  assert.doesNotMatch(engine, /https?:\/\/|FileOutputStream|Base64/);
});
test("native wake audio is level-corrected on the existing capture stream", () => {
  const engine = read("artifacts/mobile/plugins/kotlin/VoxWakeEngine.kt");
  assert.match(engine, /val levels = VoxWakeAudioNormalizer\(\)/);
  assert.match(engine, /online\.acceptWaveform\(levels\.normalize\(buffer, count\), 16000\)/);
  assert.equal((engine.match(/val microphone = AudioRecord\(/g) || []).length, 1);
});
test("source contract: visible stop controls and no boot auto-restart", () => {
  const service = read("artifacts/mobile/plugins/kotlin/VoxWakeService.kt");
  assert.match(service, /START_NOT_STICKY/);
  assert.match(service, /"Stop", PendingIntent\.getService/);
  assert.match(service, /putBoolean\("enabled", false\)/);
  assert.match(service, /releaseWakeLock\(\)/);
  assert.match(service, /engine\.start\(assistantName\)/);
  assert.doesNotMatch(service, /BOOT_COMPLETED/);
});
test("both prebuild plugin entrypoints install the same wake module and assets", () => {
  for (const extension of ["js", "ts"]) {
    const plugin = read(`artifacts/mobile/plugins/withNativeModules.${extension}`);
    for (const file of ["VoxWakeEngine.kt", "VoxWakeAudioNormalizer.kt", "VoxWakeTokenizer.kt", "VoxWakeModule.kt", "VoxWakeService.kt"]) {
      assert.ok(plugin.includes(`"${file}"`), `${extension}: ${file}`);
    }
    assert.match(plugin, /require\("\.\/withWakeWord"\)\(config\)/);
    assert.match(plugin, /foregroundServiceType": "specialUse"/);
  }
});
