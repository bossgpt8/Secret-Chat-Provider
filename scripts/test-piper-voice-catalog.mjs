import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../artifacts/mobile/modules/OfflineModels.ts", import.meta.url),
  "utf8",
);
const context = readFileSync(
  new URL("../artifacts/mobile/context/AssistantContext.tsx", import.meta.url),
  "utf8",
);
const selector = readFileSync(
  new URL("../artifacts/mobile/components/OfflineModelsSection.tsx", import.meta.url),
  "utf8",
);
const expectedVoices = [
  ["piper-lessac-medium", "en_US-lessac-medium.onnx"],
  ["piper-ljspeech-high", "en_US-ljspeech-high.onnx"],
  ["piper-joe-medium", "en_US-joe-medium.onnx"],
  ["piper-kathleen-medium", "en_US-kathleen-medium.onnx"],
];

test("Piper catalog offers multiple downloadable US English voices", () => {
  const catalog = source.slice(source.indexOf("export const OFFLINE_MODELS"), source.indexOf("export interface DownloadProgress"));
  const voiceBlocks = [...catalog.matchAll(/\{\s*id: "piper-[^"]+"[\s\S]*?\n  \},/g)];
  assert.equal(voiceBlocks.length, expectedVoices.length);

  for (const [id, fileName] of expectedVoices) {
    const block = voiceBlocks.find(({ 0: text }) => text.includes(`id: "${id}"`))?.[0];
    assert.ok(block, `missing voice ${id}`);
    assert.match(block, /kind: "tts"/);
    assert.match(block, new RegExp(`fileName: "${fileName.replaceAll(".", "\\.")}"`));
    assert.match(block, new RegExp(`configFileName: "${fileName.replaceAll(".", "\\.")}\\.json"`));
    assert.match(block, /url: "https:\/\/huggingface\.co\/rhasspy\/piper-voices\/resolve\/main\//);
    assert.match(block, /configUrl: "https:\/\/huggingface\.co\/rhasspy\/piper-voices\/resolve\/main\//);
    assert.match(block, /sizeLabel: "~\d+ MB"/);
  }
});

test("high-quality and alternate model licenses are described for users", () => {
  assert.match(source, /High-quality US English voice trained on the public-domain LJ Speech dataset/);
  assert.match(source, /Voice dataset is CC0/);
});

test("Piper activates only after both selected voice files are downloaded", () => {
  const setterStart = context.indexOf("async function setTtsProvider(");
  const setterEnd = context.indexOf("\n  async function setThemeOverride", setterStart);
  const setter = context.slice(setterStart, setterEnd);
  assert.match(setter, /voiceModelId \?\? offlineTtsModelId/);
  assert.match(setter, /NativeOfflineModels\.getPath\(model\.fileName\)/);
  assert.match(setter, /NativeOfflineModels\.getPath\(model\.configFileName\)/);
  assert.match(setter, /if \(!modelPath \|\| !configPath\)/);
  assert.match(selector, /Download this voice first/);
  assert.match(selector, /setTtsProvider\("piper", model\.id\)/);
});
