package com.boss.assistant

import java.util.Locale

/** SentencePiece unigram Viterbi for the pinned English KWS vocabulary. */
class VoxWakeTokenizer(private val vocabulary: Map<String, Float>) {
    fun keywords(name: String): String {
        val clean = name.trim().replace(Regex("\\s+"), " ")
        require(clean.length in 1..40 && clean.matches(Regex("[A-Za-z][A-Za-z .'-]*"))) {
            "Wake names currently need 1–40 English letters, spaces, apostrophes or hyphens. Rename the assistant to use wake listening."
        }
        val normalized = ("HEY " + clean.replace(".", "").replace("-", " "))
            .uppercase(Locale.US).trim().replace(Regex("\\s+"), " ")
        val text = "▁" + normalized.replace(" ", "▁")
        val scores = DoubleArray(text.length + 1) { Double.NEGATIVE_INFINITY }
        val previous = IntArray(text.length + 1) { -1 }
        scores[0] = 0.0
        for (end in 1..text.length) {
            for (start in 0 until end) {
                val score = vocabulary[text.substring(start, end)] ?: continue
                val candidate = scores[start] + score
                if (candidate > scores[end]) {
                    scores[end] = candidate
                    previous[end] = start
                }
            }
        }
        require(previous[text.length] >= 0) { "This assistant name cannot be represented by the English wake model." }
        val pieces = mutableListOf<String>()
        var end = text.length
        while (end > 0) {
            val start = previous[end]
            check(start >= 0)
            pieces.add(text.substring(start, end))
            end = start
        }
        return pieces.asReversed().joinToString(" ") + " @ASSISTANT_WAKE"
    }
}
