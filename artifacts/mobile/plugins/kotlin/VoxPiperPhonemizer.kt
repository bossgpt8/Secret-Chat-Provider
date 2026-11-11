package com.boss.assistant

/** CMUdict ARPABET -> Piper IPA IDs, with explicit fallback for unknown words. */
class VoxPiperPhonemizer(private val lookup: (Set<String>) -> Map<String, List<String>>) {
    class UnsupportedWord : IllegalArgumentException("Piper has no verified pronunciation for part of this phrase. Phone voice will read it.")

    private val small = listOf("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
        "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen")
    private fun integer(n: Int): String = when {
        n < 20 -> small[n]
        n < 100 -> listOf("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")[n / 10] +
            (if (n % 10 > 0) " ${integer(n % 10)}" else "")
        n < 1000 -> "${small[n / 100]} hundred" + (if (n % 100 > 0) " ${integer(n % 100)}" else "")
        else -> "${integer(n / 1000)} thousand" + (if (n % 1000 > 0) " ${integer(n % 1000)}" else "")
    }
    fun normalize(text: String): String {
        val currency = Regex("\\$(\\d+(?:\\.\\d+)?)").replace(text, "$1 dollars")
        val expanded = currency.replace('’', '\'').replace("&", " and ").replace("%", " percent ")
            .replace("$", " dollars ").replace("€", " euros ").replace("£", " pounds ")
        return Regex("\\d+(?:\\.\\d+)?").replace(expanded) { match ->
            val parts = match.value.split('.')
            val number = parts[0]
            val whole = if (number.length <= 6 && !(number.length > 1 && number.startsWith('0')))
                integer(number.toInt()) else number.map { small[it.digitToInt()] }.joinToString(" ")
            whole + if (parts.size == 2) " point " + parts[1].map { small[it.digitToInt()] }.joinToString(" ") else ""
        }
    }
    fun ids(text: String, map: Map<String, List<Long>>): LongArray {
        val normalized = normalize(text)
        if (Regex("[^\\p{L}\\s'.,!?;:\\-]").containsMatchIn(normalized)) throw UnsupportedWord()
        val tokens = Regex("[\\p{L}']+|[.,!?;:]").findAll(normalized).map { it.value }.toList()
        val words = tokens.filter { it.first().isLetter() }
        val needed = words.map { it.lowercase() }.toMutableSet()
        words.filter { it.length in 2..6 && it.all(Char::isUpperCase) }
            .forEach { word -> word.forEach { needed.add(it.lowercase()) } }
        val dictionary = lookup(needed)
        val ids = mutableListOf<Long>()
        val pad = map["_"] ?: throw IllegalArgumentException("Piper config has no padding ID.")
        fun phone(value: String) {
            val exact = map[value]
            if (exact != null) { ids.addAll(exact); ids.addAll(pad); return }
            // Piper's phoneme map commonly represents diphthongs/affricates as individual IPA characters.
            for (character in value) {
                ids.addAll(map[character.toString()] ?: throw UnsupportedWord())
                ids.addAll(pad)
            }
        }
        ids.addAll(map["^"] ?: throw IllegalArgumentException("Piper config has no start ID."))
        ids.addAll(pad)
        var wordSeen = false
        for (token in tokens) {
            if (!token.first().isLetter()) {
                phone(if (token == ";" || token == ":") "," else token)
                continue
            }
            if (wordSeen) phone(" ")
            val pronunciation = dictionary[token.lowercase()] ?: if (token.length in 2..6 && token.all(Char::isUpperCase))
                token.flatMap { dictionary[it.lowercase()] ?: throw UnsupportedWord() } else throw UnsupportedWord()
            for (arpabet in pronunciation) {
                val base = arpabet.trimEnd('0', '1', '2')
                if (arpabet.endsWith('1')) phone("ˈ")
                else if (arpabet.endsWith('2')) phone("ˌ")
                phone(when {
                    arpabet == "AH0" -> "ə"
                    arpabet == "ER0" -> "əɹ"
                    else -> phones[base] ?: throw UnsupportedWord()
                })
            }
            wordSeen = true
        }
        require(wordSeen) { "No spoken words in this phrase." }
        ids.addAll(map["$"] ?: throw IllegalArgumentException("Piper config has no end ID."))
        return ids.toLongArray()
    }
    companion object {
        val phones = mapOf(
            "AA" to "ɑ", "AE" to "æ", "AH" to "ʌ", "AO" to "ɔ", "AW" to "aʊ", "AY" to "aɪ",
            "B" to "b", "CH" to "tʃ", "D" to "d", "DH" to "ð", "EH" to "ɛ", "ER" to "ɜɹ",
            "EY" to "eɪ", "F" to "f", "G" to "ɡ", "HH" to "h", "IH" to "ɪ", "IY" to "i",
            "JH" to "dʒ", "K" to "k", "L" to "l", "M" to "m", "N" to "n", "NG" to "ŋ",
            "OW" to "oʊ", "OY" to "ɔɪ", "P" to "p", "R" to "ɹ", "S" to "s", "SH" to "ʃ",
            "T" to "t", "TH" to "θ", "UH" to "ʊ", "UW" to "u", "V" to "v", "W" to "w", "Y" to "j",
            "Z" to "z", "ZH" to "ʒ",
        )
    }
}
