package com.boss.assistant

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import com.facebook.react.bridge.*
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.LongBuffer

/**
 * VoxPiperModule — offline TTS using Piper ONNX voice models.
 *
 * The model file (.onnx) and config file (.onnx.json) must both be present on
 * disk (downloaded by VoxDownloadModule).
 *
 * Flow: text → normalise → phonemise → phoneme IDs (from config) → ONNX
 *        → float32 PCM samples → WAV file → return path to JS.
 */
class VoxPiperModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "VoxPiperModule"

    // Keep at most one OrtSession loaded to save RAM.
    private var loadedModelPath: String? = null
    private var session: OrtSession? = null
    private val ortEnv: OrtEnvironment by lazy { OrtEnvironment.getEnvironment() }

    // ── Public API ────────────────────────────────────────────────────────────

    @ReactMethod
    fun synthesize(text: String, modelPath: String, configPath: String, promise: Promise) {
        Thread {
            try {
                val config = JSONObject(File(configPath).readText())
                val audio = config.getJSONObject("audio")
                val sampleRate = audio.getInt("sample_rate")
                val phonemeIdMap = parsePhonemeIdMap(config)

                // Phonemise text → flat list of Long IDs
                val ids = phonemise(text, phonemeIdMap)
                if (ids.isEmpty()) throw Exception("Phonemiser produced no output for: $text")

                // Load session lazily, swap if model changed
                if (loadedModelPath != modelPath) {
                    session?.close()
                    session = ortEnv.createSession(modelPath)
                    loadedModelPath = modelPath
                }
                val sess = session!!

                // Build input tensors
                val inputTensor = OnnxTensor.createTensor(
                    ortEnv,
                    LongBuffer.wrap(ids),
                    longArrayOf(1L, ids.size.toLong())
                )
                val lengthTensor = OnnxTensor.createTensor(
                    ortEnv,
                    LongBuffer.wrap(longArrayOf(ids.size.toLong())),
                    longArrayOf(1L)
                )
                // scales: [noise_scale, length_scale, noise_w]
                val scalesTensor = OnnxTensor.createTensor(
                    ortEnv,
                    FloatBuffer.wrap(floatArrayOf(0.667f, 1.0f, 0.8f)),
                    longArrayOf(3L)
                )

                val inputs = mapOf(
                    "input" to inputTensor,
                    "input_lengths" to lengthTensor,
                    "scales" to scalesTensor
                )

                val result = sess.run(inputs)
                val rawValue = result[0].value

                // The output tensor shape can be [1,1,T] or [1,T] depending on the Piper version.
                val samples: FloatArray = when (rawValue) {
                    is FloatArray -> rawValue
                    is Array<*> -> {
                        @Suppress("UNCHECKED_CAST")
                        val arr = rawValue as Array<*>
                        when (val inner = arr[0]) {
                            is FloatArray -> inner
                            is Array<*> -> (inner as Array<FloatArray>)[0]
                            else -> throw Exception("Unknown output tensor inner type")
                        }
                    }
                    else -> throw Exception("Unknown output tensor type: ${rawValue?.javaClass}")
                }

                result.close()
                inputTensor.close()
                lengthTensor.close()
                scalesTensor.close()

                // Write WAV
                val outFile = File(
                    reactApplicationContext.cacheDir,
                    "piper_${System.currentTimeMillis()}.wav"
                )
                writeWav(outFile, samples, sampleRate)
                promise.resolve(outFile.absolutePath)
            } catch (e: Exception) {
                promise.reject("ERR_PIPER_SYNTH", "Piper synthesis failed: ${e.message}")
            }
        }.start()
    }

    @ReactMethod
    fun unloadModel(promise: Promise) {
        session?.close()
        session = null
        loadedModelPath = null
        promise.resolve(true)
    }

    @ReactMethod
    fun isModelLoaded(modelPath: String, promise: Promise) {
        promise.resolve(loadedModelPath == modelPath && session != null)
    }

    // ── WAV writer ────────────────────────────────────────────────────────────

    private fun writeWav(file: File, samples: FloatArray, sampleRate: Int) {
        val numChannels = 1
        val bitsPerSample = 16
        val byteRate = sampleRate * numChannels * bitsPerSample / 8
        val blockAlign = numChannels * bitsPerSample / 8
        val dataSize = samples.size * 2

        FileOutputStream(file).use { fos ->
            val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
            header.put("RIFF".toByteArray())
            header.putInt(36 + dataSize)
            header.put("WAVE".toByteArray())
            header.put("fmt ".toByteArray())
            header.putInt(16)                  // chunk size
            header.putShort(1)                 // PCM
            header.putShort(numChannels.toShort())
            header.putInt(sampleRate)
            header.putInt(byteRate)
            header.putShort(blockAlign.toShort())
            header.putShort(bitsPerSample.toShort())
            header.put("data".toByteArray())
            header.putInt(dataSize)
            fos.write(header.array())

            val pcmBuf = ByteBuffer.allocate(dataSize).order(ByteOrder.LITTLE_ENDIAN)
            for (s in samples) {
                val v = (s * 32767f).toInt().coerceIn(-32768, 32767).toShort()
                pcmBuf.putShort(v)
            }
            fos.write(pcmBuf.array())
        }
    }

    // ── Config parser ─────────────────────────────────────────────────────────

    /** Builds a map of IPA string → list of Long IDs from the Piper .onnx.json config. */
    private fun parsePhonemeIdMap(config: JSONObject): Map<String, List<Long>> {
        val map = HashMap<String, List<Long>>()
        val obj = config.optJSONObject("phoneme_id_map") ?: return map
        val keys = obj.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val arr = obj.getJSONArray(key)
            val ids = mutableListOf<Long>()
            for (i in 0 until arr.length()) ids.add(arr.getLong(i))
            map[key] = ids
        }
        return map
    }

    // ── Phonemiser ────────────────────────────────────────────────────────────

    private fun phonemise(text: String, phonemeIdMap: Map<String, List<Long>>): LongArray {
        val normalised = normaliseText(text)
        val tokens = tokenise(normalised)
        val allIds = mutableListOf<Long>()

        phonemeIdMap["^"]?.let { allIds.addAll(it) }   // start of utterance

        var wordCount = 0
        for (token in tokens) {
            when (token) {
                "." -> phonemeIdMap["."]?.let { allIds.addAll(it) }
                "," -> phonemeIdMap[","]?.let { allIds.addAll(it) }
                "!" -> phonemeIdMap["!"]?.let { allIds.addAll(it) }
                "?" -> phonemeIdMap["?"]?.let { allIds.addAll(it) }
                "-" -> phonemeIdMap["-"]?.let { allIds.addAll(it) }
                else -> {
                    if (wordCount > 0) phonemeIdMap[" "]?.let { allIds.addAll(it) }
                    val phones = wordToPhonemes(token)
                    for (ph in phones) {
                        val ids = phonemeIdMap[ph]
                        if (ids != null) {
                            allIds.addAll(ids)
                        } else if (ph.length > 1) {
                            // diphthong not in map — split into individual chars
                            for (c in ph) phonemeIdMap[c.toString()]?.let { allIds.addAll(it) }
                        }
                        // unknown single char: silently skip
                    }
                    wordCount++
                }
            }
        }

        phonemeIdMap["$"]?.let { allIds.addAll(it) }   // end of utterance
        return allIds.toLongArray()
    }

    // ── Text normalisation ────────────────────────────────────────────────────

    private fun normaliseText(text: String): String {
        var s = text.lowercase()
        // Expand contractions
        s = s.replace("'re", " are").replace("'ve", " have").replace("'ll", " will")
             .replace("'d", " would").replace("n't", " not").replace("i'm", "i am")
             .replace("it's", "it is").replace("that's", "that is")
             .replace("there's", "there is").replace("here's", "here is")
             .replace("he's", "he is").replace("she's", "she is")
             .replace("you're", "you are").replace("we're", "we are")
             .replace("they're", "they are").replace("let's", "let us")
        // Expand numbers
        s = s.replace(Regex("(\\d+)%")) { "${it.groupValues[1]} percent" }
             .replace(Regex("(\\d+)°[cf]?")) { "${it.groupValues[1]} degrees" }
             .replace(Regex("\\b(\\d+)\\b")) { numberToWords(it.value.toIntOrNull() ?: 0) }
        // Remove chars that aren't letters, digits, or punctuation
        s = s.replace(Regex("[^a-z .,!?\\-']"), " ")
             .replace(Regex("\\s+"), " ").trim()
        return s
    }

    private fun numberToWords(n: Int): String {
        if (n == 0) return "zero"
        if (n < 0) return "negative ${numberToWords(-n)}"
        val ones = arrayOf("", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
                           "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
                           "seventeen", "eighteen", "nineteen")
        val tens = arrayOf("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")
        return when {
            n < 20 -> ones[n]
            n < 100 -> tens[n / 10] + if (n % 10 != 0) " ${ones[n % 10]}" else ""
            n < 1000 -> "${ones[n / 100]} hundred" + if (n % 100 != 0) " ${numberToWords(n % 100)}" else ""
            n < 1_000_000 -> "${numberToWords(n / 1000)} thousand" + if (n % 1000 != 0) " ${numberToWords(n % 1000)}" else ""
            else -> n.toString()
        }
    }

    private fun tokenise(text: String): List<String> {
        val tokens = mutableListOf<String>()
        for (word in text.split(" ")) {
            if (word.isEmpty()) continue
            var w = word
            val trailing = mutableListOf<String>()
            while (w.isNotEmpty() && w.last() in ".,!?") {
                trailing.add(0, w.last().toString())
                w = w.dropLast(1)
            }
            if (w.isNotEmpty()) tokens.add(w)
            tokens.addAll(trailing)
        }
        return tokens
    }

    // ── Word → phonemes ───────────────────────────────────────────────────────

    private fun wordToPhonemes(word: String): List<String> {
        val lower = word.lowercase().replace("'", "")
        return WORD_DICT[lower] ?: ruleBasedG2P(lower)
    }

    /** Simplified English rule-based grapheme-to-phoneme. */
    private fun ruleBasedG2P(word: String): List<String> {
        val result = mutableListOf<String>()
        var i = 0
        while (i < word.length) {
            val c = word[i]
            val next = if (i + 1 < word.length) word[i + 1] else '\u0000'
            val next2 = if (i + 2 < word.length) word[i + 2] else '\u0000'
            val atEnd = i == word.length - 1

            when {
                // ── Digraphs ──────────────────────────────────────────────────
                c == 't' && next == 'h' -> { result.add(if (i == 0) "θ" else "ð"); i += 2 }
                c == 's' && next == 'h' -> { result.add("ʃ"); i += 2 }
                c == 'c' && next == 'h' -> { result.add("tʃ"); i += 2 }
                c == 'p' && next == 'h' -> { result.add("f"); i += 2 }
                c == 'w' && next == 'h' -> { result.add("w"); i += 2 }
                c == 'c' && next == 'k' -> { result.add("k"); i += 2 }
                c == 'n' && next == 'g' && (next2 == '\u0000' || next2 !in "aeiou") -> { result.add("ŋ"); i += 2 }
                c == 'q' && next == 'u' -> { result.add("k"); result.add("w"); i += 2 }
                c == 'o' && next == 'u' -> { result.add("aʊ"); i += 2 }
                c == 'o' && next == 'w' -> { result.add("oʊ"); i += 2 }
                c == 'o' && next == 'i' -> { result.add("ɔɪ"); i += 2 }
                c == 'o' && next == 'y' -> { result.add("ɔɪ"); i += 2 }
                c == 'o' && next == 'a' -> { result.add("oʊ"); i += 2 }
                c == 'a' && next == 'i' -> { result.add("eɪ"); i += 2 }
                c == 'a' && next == 'y' -> { result.add("eɪ"); i += 2 }
                c == 'e' && next == 'a' -> { result.add("i"); i += 2 }
                c == 'e' && next == 'e' -> { result.add("i"); i += 2 }
                c == 'e' && next == 'i' -> { result.add("eɪ"); i += 2 }
                c == 'i' && next == 'e' -> { result.add("i"); i += 2 }
                c == 'i' && next == 'g' && next2 == 'h' -> { result.add("aɪ"); i += 3 }
                // ── Vowels ────────────────────────────────────────────────────
                c == 'a' -> {
                    // CVCe pattern: bake → eɪ
                    if (!atEnd && word.lastOrNull() == 'e' && next !in "aeiou") result.add("eɪ")
                    else result.add("æ")
                    i++
                }
                c == 'e' -> {
                    if (atEnd) { /* silent e */ }
                    else result.add("ɛ")
                    i++
                }
                c == 'i' -> {
                    if (!atEnd && word.lastOrNull() == 'e' && next !in "aeiou") result.add("aɪ")
                    else result.add("ɪ")
                    i++
                }
                c == 'o' -> {
                    if (atEnd || (next !in "aeiouŋnmld" && next2 == '\u0000')) result.add("oʊ")
                    else result.add("ɒ")
                    i++
                }
                c == 'u' -> {
                    if (atEnd || word.lastOrNull() == 'e') { result.add("j"); result.add("u") }
                    else result.add("ʌ")
                    i++
                }
                c == 'y' -> {
                    if (i == 0) result.add("j") else result.add("i")
                    i++
                }
                // ── Consonants ────────────────────────────────────────────────
                c == 'b' -> { result.add("b"); i++ }
                c == 'c' -> { result.add(if (next in "ei") "s" else "k"); i++ }
                c == 'd' -> { result.add("d"); i++ }
                c == 'f' -> { result.add("f"); i++ }
                c == 'g' -> { result.add(if (next in "ei") "dʒ" else "g"); i++ }
                c == 'h' -> { result.add("h"); i++ }
                c == 'j' -> { result.add("dʒ"); i++ }
                c == 'k' -> { result.add("k"); i++ }
                c == 'l' -> { result.add("l"); i++ }
                c == 'm' -> { result.add("m"); i++ }
                c == 'n' -> { result.add("n"); i++ }
                c == 'p' -> { result.add("p"); i++ }
                c == 'r' -> { result.add("ɹ"); i++ }
                c == 's' -> {
                    val prev = if (i > 0) word[i - 1] else '\u0000'
                    result.add(if (prev in "aeiou" && next in "aeiou") "z" else "s")
                    i++
                }
                c == 't' -> { result.add("t"); i++ }
                c == 'v' -> { result.add("v"); i++ }
                c == 'w' -> { result.add("w"); i++ }
                c == 'x' -> { result.add("k"); result.add("s"); i++ }
                c == 'z' -> { result.add("z"); i++ }
                else -> i++ // skip unknown / punctuation
            }
        }
        return result
    }

    // ── Word dictionary (~300 most common English words + assistant vocab) ────

    companion object {
        private val WORD_DICT: Map<String, List<String>> = mapOf(
            // Articles & determiners
            "the" to listOf("ð","ə"), "a" to listOf("ə"), "an" to listOf("æ","n"),
            // Conjunctions
            "and" to listOf("æ","n","d"), "or" to listOf("ɔ","ɹ"), "but" to listOf("b","ʌ","t"),
            "if" to listOf("ɪ","f"), "so" to listOf("s","oʊ"), "yet" to listOf("j","ɛ","t"),
            // Prepositions
            "of" to listOf("ə","v"), "in" to listOf("ɪ","n"), "on" to listOf("ɒ","n"),
            "at" to listOf("æ","t"), "to" to listOf("t","u"), "for" to listOf("f","ɔ","ɹ"),
            "with" to listOf("w","ɪ","ð"), "by" to listOf("b","aɪ"), "from" to listOf("f","ɹ","ʌ","m"),
            "as" to listOf("æ","z"), "into" to listOf("ɪ","n","t","u"),
            "through" to listOf("θ","ɹ","u"), "about" to listOf("ə","b","aʊ","t"),
            "after" to listOf("æ","f","t","ə","ɹ"), "before" to listOf("b","ɪ","f","ɔ","ɹ"),
            "between" to listOf("b","ɪ","t","w","i","n"), "under" to listOf("ʌ","n","d","ə","ɹ"),
            "over" to listOf("oʊ","v","ə","ɹ"), "without" to listOf("w","ɪ","ð","aʊ","t"),
            "during" to listOf("d","j","ʊ","ɹ","ɪ","ŋ"), "around" to listOf("ə","ɹ","aʊ","n","d"),
            // Pronouns
            "i" to listOf("aɪ"), "me" to listOf("m","i"), "my" to listOf("m","aɪ"),
            "we" to listOf("w","i"), "our" to listOf("aʊ","ɹ"), "us" to listOf("ʌ","s"),
            "you" to listOf("j","u"), "your" to listOf("j","ɔ","ɹ"),
            "he" to listOf("h","i"), "him" to listOf("h","ɪ","m"), "his" to listOf("h","ɪ","z"),
            "she" to listOf("ʃ","i"), "her" to listOf("h","ɜ","ɹ"),
            "it" to listOf("ɪ","t"), "its" to listOf("ɪ","t","s"),
            "they" to listOf("ð","eɪ"), "them" to listOf("ð","ɛ","m"), "their" to listOf("ð","ɛ","ɹ"),
            "this" to listOf("ð","ɪ","s"), "that" to listOf("ð","æ","t"),
            "these" to listOf("ð","i","z"), "those" to listOf("ð","oʊ","z"),
            "what" to listOf("w","ʌ","t"), "which" to listOf("w","ɪ","tʃ"),
            "who" to listOf("h","u"), "where" to listOf("w","ɛ","ɹ"),
            "when" to listOf("w","ɛ","n"), "why" to listOf("w","aɪ"), "how" to listOf("h","aʊ"),
            // Verbs – to be
            "is" to listOf("ɪ","z"), "are" to listOf("ɑ","ɹ"), "was" to listOf("w","ɒ","z"),
            "were" to listOf("w","ɜ","ɹ"), "be" to listOf("b","i"), "been" to listOf("b","ɪ","n"),
            "being" to listOf("b","i","ɪ","ŋ"), "am" to listOf("æ","m"),
            // Verbs – common
            "have" to listOf("h","æ","v"), "has" to listOf("h","æ","z"), "had" to listOf("h","æ","d"),
            "do" to listOf("d","u"), "does" to listOf("d","ʌ","z"), "did" to listOf("d","ɪ","d"),
            "will" to listOf("w","ɪ","l"), "would" to listOf("w","ʊ","d"),
            "shall" to listOf("ʃ","æ","l"), "should" to listOf("ʃ","ʊ","d"),
            "may" to listOf("m","eɪ"), "might" to listOf("m","aɪ","t"),
            "can" to listOf("k","æ","n"), "could" to listOf("k","ʊ","d"),
            "must" to listOf("m","ʌ","s","t"),
            "say" to listOf("s","eɪ"), "said" to listOf("s","ɛ","d"),
            "get" to listOf("g","ɛ","t"), "got" to listOf("g","ɒ","t"),
            "make" to listOf("m","eɪ","k"), "made" to listOf("m","eɪ","d"),
            "go" to listOf("g","oʊ"), "going" to listOf("g","oʊ","ɪ","ŋ"),
            "went" to listOf("w","ɛ","n","t"), "know" to listOf("n","oʊ"),
            "take" to listOf("t","eɪ","k"), "come" to listOf("k","ʌ","m"),
            "came" to listOf("k","eɪ","m"), "think" to listOf("θ","ɪ","ŋ","k"),
            "look" to listOf("l","ʊ","k"), "want" to listOf("w","ɒ","n","t"),
            "give" to listOf("g","ɪ","v"), "use" to listOf("j","u","z"),
            "find" to listOf("f","aɪ","n","d"), "tell" to listOf("t","ɛ","l"),
            "feel" to listOf("f","i","l"), "try" to listOf("t","ɹ","aɪ"),
            "call" to listOf("k","ɔ","l"), "keep" to listOf("k","i","p"),
            "let" to listOf("l","ɛ","t"), "show" to listOf("ʃ","oʊ"),
            "play" to listOf("p","l","eɪ"), "run" to listOf("ɹ","ʌ","n"),
            "turn" to listOf("t","ɜ","ɹ","n"), "send" to listOf("s","ɛ","n","d"),
            "open" to listOf("oʊ","p","ə","n"), "close" to listOf("k","l","oʊ","z"),
            "stop" to listOf("s","t","ɒ","p"), "start" to listOf("s","t","ɑ","ɹ","t"),
            "search" to listOf("s","ɜ","ɹ","tʃ"), "set" to listOf("s","ɛ","t"),
            "need" to listOf("n","i","d"), "see" to listOf("s","i"),
            "hear" to listOf("h","ɪ","ɹ"), "check" to listOf("tʃ","ɛ","k"),
            "read" to listOf("ɹ","i","d"), "lock" to listOf("l","ɒ","k"),
            "pause" to listOf("p","ɔ","z"), "move" to listOf("m","u","v"),
            // Adverbs
            "not" to listOf("n","ɒ","t"), "no" to listOf("n","oʊ"),
            "yes" to listOf("j","ɛ","s"), "now" to listOf("n","aʊ"),
            "here" to listOf("h","ɪ","ɹ"), "there" to listOf("ð","ɛ","ɹ"),
            "also" to listOf("ɔ","l","s","oʊ"), "just" to listOf("dʒ","ʌ","s","t"),
            "very" to listOf("v","ɛ","ɹ","i"), "well" to listOf("w","ɛ","l"),
            "still" to listOf("s","t","ɪ","l"), "even" to listOf("i","v","ə","n"),
            "only" to listOf("oʊ","n","l","i"), "back" to listOf("b","æ","k"),
            "then" to listOf("ð","ɛ","n"), "too" to listOf("t","u"),
            "always" to listOf("ɔ","l","w","eɪ","z"), "never" to listOf("n","ɛ","v","ə","ɹ"),
            "again" to listOf("ə","g","ɛ","n"), "already" to listOf("ɔ","l","ɹ","ɛ","d","i"),
            "away" to listOf("ə","w","eɪ"), "together" to listOf("t","ə","g","ɛ","ð","ə","ɹ"),
            "though" to listOf("ð","oʊ"), "up" to listOf("ʌ","p"), "down" to listOf("d","aʊ","n"),
            "out" to listOf("aʊ","t"), "off" to listOf("ɒ","f"), "out" to listOf("aʊ","t"),
            "really" to listOf("ɹ","i","ə","l","i"), "actually" to listOf("æ","k","tʃ","u","ə","l","i"),
            "probably" to listOf("p","ɹ","ɒ","b","ə","b","l","i"),
            "definitely" to listOf("d","ɛ","f","ɪ","n","ɪ","t","l","i"),
            "currently" to listOf("k","ɜ","ɹ","ə","n","t","l","i"),
            "quickly" to listOf("k","w","ɪ","k","l","i"),
            "exactly" to listOf("ɪ","g","z","æ","k","t","l","i"),
            "absolutely" to listOf("æ","b","s","ə","l","u","t","l","i"),
            "usually" to listOf("j","u","ʒ","u","ə","l","i"),
            // Adjectives
            "good" to listOf("g","ʊ","d"), "new" to listOf("n","j","u"),
            "old" to listOf("oʊ","l","d"), "great" to listOf("g","ɹ","eɪ","t"),
            "big" to listOf("b","ɪ","g"), "small" to listOf("s","m","ɔ","l"),
            "high" to listOf("h","aɪ"), "low" to listOf("l","oʊ"),
            "long" to listOf("l","ɒ","ŋ"), "short" to listOf("ʃ","ɔ","ɹ","t"),
            "fast" to listOf("f","æ","s","t"), "slow" to listOf("s","l","oʊ"),
            "hot" to listOf("h","ɒ","t"), "cold" to listOf("k","oʊ","l","d"),
            "warm" to listOf("w","ɔ","ɹ","m"), "cool" to listOf("k","u","l"),
            "real" to listOf("ɹ","i","l"), "true" to listOf("t","ɹ","u"),
            "free" to listOf("f","ɹ","i"), "full" to listOf("f","ʊ","l"),
            "ready" to listOf("ɹ","ɛ","d","i"), "sure" to listOf("ʃ","ʊ","ɹ"),
            "nice" to listOf("n","aɪ","s"), "sorry" to listOf("s","ɒ","ɹ","i"),
            "happy" to listOf("h","æ","p","i"), "busy" to listOf("b","ɪ","z","i"),
            "right" to listOf("ɹ","aɪ","t"), "left" to listOf("l","ɛ","f","t"),
            "available" to listOf("ə","v","eɪ","l","ə","b","ə","l"),
            "current" to listOf("k","ɜ","ɹ","ə","n","t"),
            "important" to listOf("ɪ","m","p","ɔ","ɹ","t","ə","n","t"),
            "possible" to listOf("p","ɒ","s","ɪ","b","ə","l"),
            "perfect" to listOf("p","ɜ","ɹ","f","ɪ","k","t"),
            // Numbers
            "zero" to listOf("z","ɪ","ɹ","oʊ"), "one" to listOf("w","ʌ","n"),
            "two" to listOf("t","u"), "three" to listOf("θ","ɹ","i"),
            "four" to listOf("f","ɔ","ɹ"), "five" to listOf("f","aɪ","v"),
            "six" to listOf("s","ɪ","k","s"), "seven" to listOf("s","ɛ","v","ə","n"),
            "eight" to listOf("eɪ","t"), "nine" to listOf("n","aɪ","n"),
            "ten" to listOf("t","ɛ","n"), "eleven" to listOf("ɪ","l","ɛ","v","ə","n"),
            "twelve" to listOf("t","w","ɛ","l","v"),
            "thirteen" to listOf("θ","ɜ","ɹ","t","i","n"),
            "fourteen" to listOf("f","ɔ","ɹ","t","i","n"),
            "fifteen" to listOf("f","ɪ","f","t","i","n"),
            "sixteen" to listOf("s","ɪ","k","s","t","i","n"),
            "seventeen" to listOf("s","ɛ","v","ə","n","t","i","n"),
            "eighteen" to listOf("eɪ","t","i","n"),
            "nineteen" to listOf("n","aɪ","n","t","i","n"),
            "twenty" to listOf("t","w","ɛ","n","t","i"),
            "thirty" to listOf("θ","ɜ","ɹ","t","i"),
            "forty" to listOf("f","ɔ","ɹ","t","i"),
            "fifty" to listOf("f","ɪ","f","t","i"),
            "sixty" to listOf("s","ɪ","k","s","t","i"),
            "seventy" to listOf("s","ɛ","v","ə","n","t","i"),
            "eighty" to listOf("eɪ","t","i"),
            "ninety" to listOf("n","aɪ","n","t","i"),
            "hundred" to listOf("h","ʌ","n","d","ɹ","ɪ","d"),
            "thousand" to listOf("θ","aʊ","z","ə","n","d"),
            "million" to listOf("m","ɪ","l","j","ə","n"),
            "billion" to listOf("b","ɪ","l","j","ə","n"),
            // Units & measurements
            "percent" to listOf("p","ə","ɹ","s","ɛ","n","t"),
            "degree" to listOf("d","ɪ","g","ɹ","i"),
            "degrees" to listOf("d","ɪ","g","ɹ","i","z"),
            "minute" to listOf("m","ɪ","n","ɪ","t"),
            "minutes" to listOf("m","ɪ","n","ɪ","t","s"),
            "second" to listOf("s","ɛ","k","ə","n","d"),
            "seconds" to listOf("s","ɛ","k","ə","n","d","z"),
            "hour" to listOf("aʊ","ə","ɹ"), "hours" to listOf("aʊ","ə","ɹ","z"),
            // Time
            "today" to listOf("t","ə","d","eɪ"),
            "tomorrow" to listOf("t","ə","m","ɒ","ɹ","oʊ"),
            "yesterday" to listOf("j","ɛ","s","t","ə","ɹ","d","eɪ"),
            "morning" to listOf("m","ɔ","ɹ","n","ɪ","ŋ"),
            "afternoon" to listOf("æ","f","t","ə","ɹ","n","u","n"),
            "evening" to listOf("i","v","n","ɪ","ŋ"), "night" to listOf("n","aɪ","t"),
            "week" to listOf("w","i","k"), "month" to listOf("m","ʌ","n","θ"),
            "year" to listOf("j","ɪ","ɹ"), "day" to listOf("d","eɪ"),
            "time" to listOf("t","aɪ","m"),
            // Greetings
            "hello" to listOf("h","ɛ","l","oʊ"), "hi" to listOf("h","aɪ"),
            "hey" to listOf("h","eɪ"), "okay" to listOf("oʊ","k","eɪ"),
            "ok" to listOf("oʊ","k","eɪ"),
            "please" to listOf("p","l","i","z"),
            "thank" to listOf("θ","æ","ŋ","k"), "thanks" to listOf("θ","æ","ŋ","k","s"),
            "welcome" to listOf("w","ɛ","l","k","ə","m"),
            // Device / assistant vocabulary
            "phone" to listOf("f","oʊ","n"), "timer" to listOf("t","aɪ","m","ə","ɹ"),
            "alarm" to listOf("ə","l","ɑ","ɹ","m"), "weather" to listOf("w","ɛ","ð","ə","ɹ"),
            "battery" to listOf("b","æ","t","ə","ɹ","i"),
            "volume" to listOf("v","ɒ","l","j","ʊ","m"),
            "screen" to listOf("s","k","ɹ","i","n"),
            "brightness" to listOf("b","ɹ","aɪ","t","n","ɪ","s"),
            "temperature" to listOf("t","ɛ","m","p","ɹ","ə","tʃ","ə","ɹ"),
            "notification" to listOf("n","oʊ","t","ɪ","f","ɪ","k","eɪ","ʃ","ə","n"),
            "flashlight" to listOf("f","l","æ","ʃ","l","aɪ","t"),
            "message" to listOf("m","ɛ","s","ɪ","dʒ"),
            "charging" to listOf("tʃ","ɑ","ɹ","dʒ","ɪ","ŋ"),
            "playing" to listOf("p","l","eɪ","ɪ","ŋ"),
            "paused" to listOf("p","ɔ","z","d"),
            "location" to listOf("l","oʊ","k","eɪ","ʃ","ə","n"),
            "contact" to listOf("k","ɒ","n","t","æ","k","t"),
            "settings" to listOf("s","ɛ","t","ɪ","ŋ","z"),
            "information" to listOf("ɪ","n","f","ə","ɹ","m","eɪ","ʃ","ə","n"),
            "results" to listOf("ɹ","ɪ","z","ʌ","l","t","s"),
            "result" to listOf("ɹ","ɪ","z","ʌ","l","t"),
            // Quantities
            "all" to listOf("ɔ","l"), "some" to listOf("s","ʌ","m"),
            "more" to listOf("m","ɔ","ɹ"), "most" to listOf("m","oʊ","s","t"),
            "any" to listOf("ɛ","n","i"), "few" to listOf("f","j","u"),
            "both" to listOf("b","oʊ","θ"),
            // Common nouns
            "people" to listOf("p","i","p","ə","l"),
            "thing" to listOf("θ","ɪ","ŋ"), "things" to listOf("θ","ɪ","ŋ","z"),
            "world" to listOf("w","ɜ","ɹ","l","d"), "home" to listOf("h","oʊ","m"),
            "work" to listOf("w","ɜ","ɹ","k"), "name" to listOf("n","eɪ","m"),
            "number" to listOf("n","ʌ","m","b","ə","ɹ"), "music" to listOf("m","j","u","z","ɪ","k"),
            "song" to listOf("s","ɒ","ŋ"), "news" to listOf("n","j","u","z"),
            "help" to listOf("h","ɛ","l","p"), "water" to listOf("w","ɔ","t","ə","ɹ"),
            "list" to listOf("l","ɪ","s","t"), "note" to listOf("n","oʊ","t"),
            "plan" to listOf("p","l","æ","n"), "app" to listOf("æ","p"),
            "city" to listOf("s","ɪ","t","i"), "country" to listOf("k","ʌ","n","t","ɹ","i"),
            "question" to listOf("k","w","ɛ","s","tʃ","ə","n"),
            "answer" to listOf("æ","n","s","ə","ɹ"),
            "way" to listOf("w","eɪ"), "place" to listOf("p","l","eɪ","s"),
            "first" to listOf("f","ɜ","ɹ","s","t"), "last" to listOf("l","æ","s","t"),
            "next" to listOf("n","ɛ","k","s","t"), "end" to listOf("ɛ","n","d"),
        )
    }
}
