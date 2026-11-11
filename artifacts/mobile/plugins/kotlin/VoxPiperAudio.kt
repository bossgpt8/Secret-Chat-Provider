package com.boss.assistant

import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.roundToInt

/** Pure audio conversion, independent of Android/ONNX for regression testing. */
object VoxPiperAudio {
    fun toPcm16(samples: FloatArray, sampleRate: Int): ByteArray {
        require(sampleRate in 8000..48000) { "Invalid voice sample rate." }
        require(samples.isNotEmpty()) { "Piper produced empty audio." }
        var peak = 0f
        for (sample in samples) {
            require(sample.isFinite()) { "Piper produced invalid audio samples." }
            peak = maxOf(peak, abs(sample))
        }
        // Piper floats are not guaranteed to fit [-1, 1]. Normalize the whole
        // phrase, rather than flattening individual peaks into audible distortion.
        val gain = 0.95f / maxOf(0.01f, peak)
        val fadeSamples = min(sampleRate / 200, samples.size / 2) // <= 5ms
        val pcm = ByteBuffer.allocate(samples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
        for (i in samples.indices) {
            val envelope = if (fadeSamples > 0) {
                min(1f, min(i.toFloat(), (samples.lastIndex - i).toFloat()) / fadeSamples)
            } else 1f
            pcm.putShort((samples[i] * gain * envelope * 32767f).roundToInt()
                .coerceIn(-32768, 32767).toShort())
        }
        return pcm.array()
    }
}
