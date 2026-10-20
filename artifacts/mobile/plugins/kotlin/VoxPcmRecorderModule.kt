package com.boss.assistant

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.RandomAccessFile
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs

/**
 * Captures mono 16 kHz signed 16-bit PCM and writes a WAV file.
 * This is intentionally separate from Expo AV: Whisper.cpp does not decode
 * the AAC/M4A file produced by the normal Expo recording preset.
 */
class VoxPcmRecorderModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    private val recording = AtomicBoolean(false)
    private var audioRecord: AudioRecord? = null
    private var worker: Thread? = null
    private var outputFile: File? = null

    override fun getName() = "VoxPcmRecorderModule"

    @ReactMethod
    fun start(promise: Promise) {
        if (recording.get()) {
            promise.resolve(true)
            return
        }
        try {
            val sampleRate = 16_000
            val minBuffer = AudioRecord.getMinBufferSize(
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
            )
            if (minBuffer <= 0) throw Exception("Audio input is not available")
            val bufferSize = (minBuffer * 2).coerceAtLeast(4096)
            val recorder = AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                bufferSize,
            )
            if (recorder.state != AudioRecord.STATE_INITIALIZED) {
                recorder.release()
                throw Exception("Could not initialize the microphone")
            }

            val file = File(ctx.cacheDir, "vox_whisper_${System.currentTimeMillis()}.wav")
            audioRecord = recorder
            outputFile = file
            recording.set(true)
            recorder.startRecording()
            worker = Thread {
                writeRecording(recorder, file, bufferSize, sampleRate)
            }.also { it.start() }
            promise.resolve(true)
        } catch (e: Exception) {
            audioRecord?.release()
            audioRecord = null
            recording.set(false)
            promise.reject("ERR_PCM_START", e.message)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        if (!recording.getAndSet(false)) {
            promise.resolve(outputFile?.absolutePath)
            return
        }
        try {
            audioRecord?.stop()
        } catch (_: Exception) {}
        worker?.join(1500)
        audioRecord?.release()
        audioRecord = null
        worker = null
        val file = outputFile
        outputFile = null
        promise.resolve(file?.absolutePath)
    }

    @ReactMethod
    fun cancel(promise: Promise) {
        recording.set(false)
        try { audioRecord?.stop() } catch (_: Exception) {}
        worker?.join(1000)
        audioRecord?.release()
        audioRecord = null
        worker = null
        outputFile?.delete()
        outputFile = null
        promise.resolve(null)
    }

    private fun writeRecording(
        recorder: AudioRecord,
        file: File,
        bufferSize: Int,
        sampleRate: Int,
    ) {
        RandomAccessFile(file, "rw").use { out ->
            writeWavHeader(out, 0, sampleRate)
            val buffer = ShortArray(bufferSize / 2)
            var totalSamples = 0
            while (recording.get()) {
                val read = recorder.read(buffer, 0, buffer.size)
                if (read <= 0) continue
                val pcm = ByteArray(read * 2)
                var peak = 0
                for (i in 0 until read) {
                    val sample = buffer[i].toInt()
                    peak = maxOf(peak, abs(sample))
                    pcm[i * 2] = (sample and 0xff).toByte()
                    pcm[i * 2 + 1] = ((sample shr 8) and 0xff).toByte()
                }
                out.write(pcm)
                totalSamples += read
                val level = (peak / 32768.0).coerceIn(0.0, 1.0)
                val map = Arguments.createMap()
                map.putDouble("level", level)
                ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onVoxPcmLevel", map)
            }
            writeWavHeader(out, totalSamples * 2, sampleRate)
        }
    }

    private fun writeWavHeader(out: RandomAccessFile, dataSize: Int, sampleRate: Int) {
        out.seek(0)
        out.writeBytes("RIFF")
        writeIntLE(out, 36 + dataSize)
        out.writeBytes("WAVEfmt ")
        writeIntLE(out, 16)
        writeShortLE(out, 1)
        writeShortLE(out, 1)
        writeIntLE(out, sampleRate)
        writeIntLE(out, sampleRate * 2)
        writeShortLE(out, 2)
        writeShortLE(out, 16)
        out.writeBytes("data")
        writeIntLE(out, dataSize)
        out.seek(44L + dataSize)
    }

    private fun writeIntLE(out: RandomAccessFile, value: Int) {
        out.write(value and 0xff)
        out.write((value shr 8) and 0xff)
        out.write((value shr 16) and 0xff)
        out.write((value shr 24) and 0xff)
    }

    private fun writeShortLE(out: RandomAccessFile, value: Int) {
        out.write(value and 0xff)
        out.write((value shr 8) and 0xff)
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
