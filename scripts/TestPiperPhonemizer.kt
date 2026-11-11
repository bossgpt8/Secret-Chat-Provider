package com.boss.assistant

fun main() {
    val dictionary = mapOf(
        "hello" to listOf("HH", "AH0", "L", "OW1"),
        "world" to listOf("W", "ER1", "L", "D"),
        "twenty" to listOf("T", "W", "EH1", "N", "T", "IY0"),
        "point" to listOf("P", "OY1", "N", "T"),
        "five" to listOf("F", "AY1", "V"),
        "dollars" to listOf("D", "AA1", "L", "ER0", "Z"),
        "a" to listOf("EY1"), "p" to listOf("P", "IY1"), "i" to listOf("AY1"),
    )
    val symbols = ("^_$ .,!?ˈˌə" + VoxPiperPhonemizer.phones.values.joinToString("")).toSet()
    val map = symbols.mapIndexed { index, c -> c.toString() to listOf(index.toLong()) }.toMap()
    val phonemizer = VoxPiperPhonemizer { wanted -> dictionary.filterKeys { it in wanted } }
    val ids = phonemizer.ids("Hello world!", map)
    check(ids.first() == map["^"]!!.first() && ids.last() == map["$"]!!.first())
    check(map["ˈ"]!!.first() in ids && map["ə"]!!.first() in ids)
    check(phonemizer.normalize("20.5") == "twenty point five")
    check(phonemizer.normalize("\$20") == "twenty dollars")
    check(phonemizer.normalize("007") == "zero zero seven")
    check(phonemizer.ids("API", map).isNotEmpty())
    check(phonemizer.ids("20.5", map).isNotEmpty())
    check(runCatching { phonemizer.ids("unlistedname", map) }.exceptionOrNull() is VoxPiperPhonemizer.UnsupportedWord)
    check(runCatching { phonemizer.ids("你好", map) }.exceptionOrNull() is VoxPiperPhonemizer.UnsupportedWord)
    println("Piper pronunciation checks passed: IPA IDs, stress, schwa, numbers, currency, acronyms and explicit unknown-word fallback.")
}
