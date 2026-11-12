package com.boss.assistant

import kotlin.math.abs
import kotlin.math.sqrt

/** Bounded level correction before KWS; no extra microphone, model or network. */
class VoxWakeAudioNormalizer {
    private var gain = 1.0

    fun normalize(samples: ShortArray, count: Int): FloatArray {
        require(count in 1..samples.size) { "Invalid wake audio frame size." }
        var energy = 0.0
        var peak = 0.0
        for (index in 0 until count) {
            val sample = samples[index].toDouble() / 32768.0
            energy += sample * sample
            peak = maxOf(peak, abs(sample))
        }
        val rms = sqrt(energy / count)
        // Do not chase near-silence. Cap speech gain at 12 dB and smooth
        // transitions so low-volume words are lifted without abrupt pumping.
        val targetGain = if (rms >= 0.003) minOf(4.0, maxOf(1.0, 0.055 / rms)) else 1.0
        gain = 0.6 * gain + 0.4 * targetGain
        if (peak > 0.0) gain = minOf(gain, 0.95 / peak)
        return FloatArray(count) { (samples[it].toDouble() / 32768.0 * gain).toFloat() }
    }
}
