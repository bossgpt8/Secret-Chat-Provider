import com.boss.assistant.VoxWakeTokenizer
import java.io.File

/** Run against vocabulary.tsv extracted from the actual pinned SentencePiece model. */
fun main(args: Array<String>) {
    val vocabulary = File(args[0]).readLines().associate {
        val split = it.split('\t')
        split[0] to split[1].toFloat()
    }
    val tokenizer = VoxWakeTokenizer(vocabulary)
    val cases = mapOf(
        "Vox" to "▁HE Y ▁ VO X",
        "Zeno" to "▁HE Y ▁ Z EN O",
        "Google" to "▁HE Y ▁GO O G LE",
        "Alexa" to "▁HE Y ▁A LE X A",
        "Mary" to "▁HE Y ▁MAR Y",
        "Assistant" to "▁HE Y ▁AS S IST ANT",
    )
    cases.forEach { (name, expected) ->
        check(tokenizer.keywords(name) == "$expected @ASSISTANT_WAKE") { "Wrong tokenization for $name" }
        println("PASS: Hey $name matches official SentencePiece encoding")
    }
    check(tokenizer.keywords("  My   Assistant ") == tokenizer.keywords("My Assistant"))
    check(tokenizer.keywords("J.A.R.V.I.S.") == tokenizer.keywords("JARVIS"))
    check(tokenizer.keywords("Anne-Marie") == tokenizer.keywords("Anne Marie"))
    listOf("", "你好", "123", "A".repeat(41), "../file").forEach { name ->
        check(runCatching { tokenizer.keywords(name) }.isFailure)
    }
    println("PASS: whitespace, punctuation, rename, and unsupported-name boundaries")
}
