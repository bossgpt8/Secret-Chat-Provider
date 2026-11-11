/**
 * Pinned sherpa-onnx KWS dependencies. Downloads are build inputs, not Git assets.
 * Runs automatically from the existing native plugin during Android prebuild.
 */
const { withDangerousMod, withAppBuildGradle, withAndroidManifest } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const MODEL = "sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01";
const INPUTS = [
  {
    name: "sherpa-onnx-2.0.1.aar",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.1/sherpa-onnx-static-link-onnxruntime-2.0.1.aar",
    sha256: "07e042d97f3a6bd5b7fe74d4eef0513dc01a714b16c15a903250095aba43a575",
  },
  {
    name: `${MODEL}.tar.bz2`,
    url: `https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/${MODEL}.tar.bz2`,
    sha256: "f170013b4716e41b62b9bfd809687c207cef798ef9bc6534d524e17af9b6561a",
  },
  {
    name: "sherpa-onnx-LICENSE.txt",
    url: "https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/v2.0.1/LICENSE",
    sha256: "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
  },
  {
    name: "cmudict.dict",
    url: "https://raw.githubusercontent.com/cmusphinx/cmudict/74790861f652b15e4ac49015a90074ad62a27690/cmudict.dict",
    sha256: "81917843c7f44ce2b094ac63873c2c7a4cf802040792c455ba3ca406891c3d22",
  },
  {
    name: "cmudict-LICENSE.txt",
    url: "https://raw.githubusercontent.com/cmusphinx/cmudict/74790861f652b15e4ac49015a90074ad62a27690/LICENSE",
    sha256: "bd4ce8e44170a5f9f481310ca85c51de3c4f851a65e679b40e603b143bd3542a",
  },
];
const MODEL_FILES = [
  "encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
  "decoder-epoch-12-avg-2-chunk-16-left-64.onnx",
  "joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
  "tokens.txt",
  "bpe.model",
  "README.md",
];

// The upstream "bpe.model" is a SentencePiece unigram model. Read its small
// vocabulary directly; Android uses Viterbi segmentation, not guessed letters.
function readSentencePieceVocabulary(buffer) {
  function fields(bytes) {
    let offset = 0;
    function varint() {
      let value = 0, shift = 0, byte;
      do {
        if (offset >= bytes.length || shift > 49) throw new Error("Invalid SentencePiece protobuf");
        byte = bytes[offset++]; value += (byte & 127) * 2 ** shift; shift += 7;
      } while (byte & 128);
      return value;
    }
    const result = [];
    while (offset < bytes.length) {
      const key = varint(), field = key >> 3, wire = key & 7;
      if (wire === 2) {
        const length = varint();
        if (offset + length > bytes.length) throw new Error("Truncated SentencePiece protobuf");
        result.push([field, bytes.subarray(offset, offset += length)]);
      } else if (wire === 5) {
        result.push([field, bytes.readFloatLE(offset)]); offset += 4;
      } else if (wire === 0) result.push([field, varint()]);
      else if (wire === 1) offset += 8;
      else throw new Error(`Unsupported SentencePiece wire type ${wire}`);
    }
    return result;
  }
  return fields(buffer).filter(([key]) => key === 1).map(([, bytes]) => {
    const piece = Object.fromEntries(fields(bytes));
    return [piece[1].toString("utf8"), piece[2]];
  }).filter(([piece]) => !piece.startsWith("<"));
}

function digest(file) {
  return fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : "";
}

async function download(input, cache) {
  const destination = path.join(cache, input.name);
  if (digest(destination) === input.sha256) return destination;
  const response = await fetch(input.url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Wake-word dependency download failed: ${response.status} (${input.name})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== input.sha256) {
    throw new Error(`Wake-word dependency checksum mismatch: ${input.name}`);
  }
  fs.writeFileSync(destination, bytes);
  return destination;
}

async function prepareWakeAssets(root) {
  const cache = path.resolve(root, "../../generated-artifacts/wake-word");
  fs.mkdirSync(cache, { recursive: true });
  const [aar, archive, license, dictionary, dictionaryLicense] = await Promise.all(INPUTS.map(input => download(input, cache)));
  const assets = path.join(root, "android/app/src/main/assets/vox-wake");
  const libs = path.join(root, "android/app/libs");
  fs.mkdirSync(assets, { recursive: true });
  fs.mkdirSync(libs, { recursive: true });
  const piperAssets = path.join(root, "android/app/src/main/assets/vox-piper");
  fs.mkdirSync(piperAssets, { recursive: true });
  fs.copyFileSync(dictionary, path.join(piperAssets, "cmudict.dict"));
  fs.copyFileSync(dictionaryLicense, path.join(piperAssets, "LICENSE.txt"));
  const expanded = path.join(cache, MODEL);
  // Extract only known model members from the checksum-verified archive.
  execFileSync("tar", ["xjf", archive, "-C", cache, ...MODEL_FILES.map(file => `${MODEL}/${file}`)]);
  for (const file of MODEL_FILES) fs.copyFileSync(path.join(expanded, file), path.join(assets, file));
  fs.copyFileSync(license, path.join(assets, "LICENSE.txt"));
  fs.copyFileSync(path.join(__dirname, "wake-word-notices.txt"), path.join(assets, "NOTICES.txt"));
  const vocabulary = readSentencePieceVocabulary(fs.readFileSync(path.join(expanded, "bpe.model")));
  fs.writeFileSync(path.join(assets, "vocabulary.json"), JSON.stringify(vocabulary));
  // SentencePiece encoding with the pinned model's bpe.model, not guessed spelling.
  fs.writeFileSync(path.join(assets, "keywords.txt"), "▁HE Y ▁ VO X @HEY_VOX\n");
  // Upstream's "static" AAR still contains a dynamic x86 ORT. Do not package it
  // alongside Piper's ORT. ARMv7, ARM64 and x86_64 have self-contained JNI.
  const aarDir = path.join(cache, "aar");
  fs.rmSync(aarDir, { recursive: true, force: true });
  fs.mkdirSync(aarDir, { recursive: true });
  execFileSync("unzip", ["-q", aar, "-d", aarDir]);
  fs.rmSync(path.join(aarDir, "jni/x86"), { recursive: true, force: true });
  const outputAar = path.join(libs, "sherpa-onnx-2.0.1.aar");
  fs.rmSync(outputAar, { force: true });
  execFileSync("zip", ["-qr", outputAar, "."], { cwd: aarDir });
}

function withWakeWord(config) {
  config = withDangerousMod(config, ["android", async config => {
    await prepareWakeAssets(config.modRequest.projectRoot);
    return config;
  }]);
  config = withAppBuildGradle(config, config => {
    const dependency = 'implementation files("libs/sherpa-onnx-2.0.1.aar")';
    if (!config.modResults.contents.includes(dependency)) {
      config.modResults.contents = config.modResults.contents.replace("dependencies {", `dependencies {\n    ${dependency}`);
    }
    // JNI reflection requires stable upstream class names, including configs.
    const proguard = path.join(config.modRequest.projectRoot, "android/app/proguard-rules.pro");
    const rule = "-keep class com.k2fsa.sherpa.onnx.** { *; }";
    if (!fs.readFileSync(proguard, "utf8").includes(rule)) fs.appendFileSync(proguard, `\n${rule}\n`);
    return config;
  });
  return withAndroidManifest(config, config => {
    const manifest = config.modResults.manifest;
    const app = manifest.application[0];
    app.service ??= [];
    if (!app.service.some(service => service.$?.["android:name"] === ".VoxWakeService")) {
      app.service.push({ $: {
        "android:name": ".VoxWakeService",
        "android:exported": "false",
        "android:foregroundServiceType": "microphone",
        "android:stopWithTask": "false",
      } });
    }
    manifest["uses-permission"] ??= [];
    for (const permission of ["WAKE_LOCK", "VIBRATE", "RECORD_AUDIO", "POST_NOTIFICATIONS", "FOREGROUND_SERVICE", "FOREGROUND_SERVICE_MICROPHONE"]) {
      const name = `android.permission.${permission}`;
      if (!manifest["uses-permission"].some(item => item.$?.["android:name"] === name)) {
        manifest["uses-permission"].push({ $: { "android:name": name } });
      }
    }
    return config;
  });
}

module.exports = withWakeWord;
module.exports.prepareWakeAssets = prepareWakeAssets;
module.exports.INPUTS = INPUTS;
module.exports.readSentencePieceVocabulary = readSentencePieceVocabulary;
