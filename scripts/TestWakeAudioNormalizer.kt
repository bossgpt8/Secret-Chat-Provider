import com.boss.assistant.VoxWakeAudioNormalizer
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import javax.sound.sampled.AudioFileFormat
import javax.sound.sampled.AudioInputStream
import javax.sound.sampled.AudioSystem
import kotlin.math.abs

/** Standalone JVM tests; optional input/output arguments process a real mono PCM16 WAV. */
fun main(args: Array<String>) {
    check(VoxWakeAudioNormalizer().normalize(ShortArray(1600), 1600).all { it == 0f })
    println("PASS: silence stays silent")
    val noise = ShortArray(1600) { if (it % 2 == 0) 30 else -30 }
    val unchanged = VoxWakeAudioNormalizer().normalize(noise, noise.size)
    check(unchanged.indices.all { abs(unchanged[it] - noise[it] / 32768f) < 0.000001f })
    println("PASS: near-silence is not amplified")

    val normalizer = VoxWakeAudioNormalizer()
    val quiet = ShortArray(1600) { if (it % 2 == 0) 330 else -330 }
    var output = FloatArray(0)
    repeat(12) { output = normalizer.normalize(quiet, quiet.size) }
    check(output[0] > quiet[0] / 32768f * 3.0f)
    check(output.all { abs(it) <= abs(quiet[0] / 32768f) * 4.00001f })
    println("PASS: quiet speech receives bounded gain")

    val loud = ShortArray(1600) { if (it % 2 == 0) Short.MAX_VALUE else Short.MIN_VALUE }
    check(normalizer.normalize(loud, loud.size).all { it.isFinite() && abs(it) <= 0.95001f })
    println("PASS: a sudden full-volume frame cannot clip")
    check(VoxWakeAudioNormalizer().normalize(shortArrayOf(300, -300, 32767), 2).size == 2)
    check(runCatching { normalizer.normalize(quiet, 0) }.isFailure)
    check(runCatching { normalizer.normalize(quiet, quiet.size + 1) }.isFailure)
    println("PASS: partial buffers and invalid frame sizes")

    if (args.isEmpty()) return
    require(args.size == 2) { "Usage: [input.wav output.wav]" }
    AudioSystem.getAudioInputStream(File(args[0])).use { source ->
        val format = source.format
        require(format.channels == 1 && format.sampleRate == 16000f &&
            format.sampleSizeInBits == 16 && !format.isBigEndian)
        val bytes = ByteBuffer.wrap(source.readAllBytes()).order(ByteOrder.LITTLE_ENDIAN)
        val result = ByteArrayOutputStream()
        val levels = VoxWakeAudioNormalizer()
        while (bytes.remaining() >= 2) {
            val frame = ShortArray(minOf(1600, bytes.remaining() / 2)) { bytes.short }
            val adjusted = levels.normalize(frame, frame.size)
            val encoded = ByteBuffer.allocate(adjusted.size * 2).order(ByteOrder.LITTLE_ENDIAN)
            adjusted.forEach { encoded.putShort((it * 32768f).toInt().toShort()) }
            result.write(encoded.array())
        }
        val data = result.toByteArray()
        AudioInputStream(ByteArrayInputStream(data), format, data.size.toLong() / 2).use {
            AudioSystem.write(it, AudioFileFormat.Type.WAVE, File(args[1]))
        }
    }
    println("PASS: processed the WAV with the production Kotlin normalizer")
}
