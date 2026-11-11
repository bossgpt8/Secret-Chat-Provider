package com.boss.assistant

import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs

fun main() {
    fun decode(samples: FloatArray, rate: Int = 22050): ShortArray {
        val bytes = VoxPiperAudio.toPcm16(samples, rate)
        check(bytes.size == samples.size * 2)
        val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        return ShortArray(samples.size) { buffer.short }
    }
    val silence = decode(FloatArray(1000))
    check(silence.all { it == 0.toShort() })
    val loud = FloatArray(1000) { if (it % 2 == 0) 2f else -4f }
    val pcm = decode(loud)
    check(abs(pcm[500].toInt() - 15564) <= 1)
    check(abs(pcm[501].toInt() + 31129) <= 1)
    check(pcm.none { it == Short.MAX_VALUE || it == Short.MIN_VALUE })
    check(pcm.first() == 0.toShort() && pcm.last() == 0.toShort())
    check(abs(pcm[1].toInt()) < abs(pcm[501].toInt()))
    val quiet = decode(FloatArray(1000) { 0.001f })
    check(abs(quiet[500].toInt()) < 4000) // Do not amplify near-silence without limit.
    val single = decode(floatArrayOf(0.1f))
    check(single.size == 1 && single[0] > 0)
    for (rate in listOf(8000, 16000, 22050, 24000, 44100, 48000)) {
        val converted = decode(FloatArray(1000) { 0.5f }, rate)
        check(converted.first() == 0.toShort() && converted.last() == 0.toShort())
    }
    for (invalid in listOf(floatArrayOf(Float.NaN), floatArrayOf(Float.POSITIVE_INFINITY), floatArrayOf())) {
        check(runCatching { decode(invalid) }.isFailure)
    }
    check(runCatching { decode(floatArrayOf(1f), 0) }.isFailure)
    println("Piper PCM regression checks passed: normalization, headroom, fades, silence, rates, invalid output.")
}
