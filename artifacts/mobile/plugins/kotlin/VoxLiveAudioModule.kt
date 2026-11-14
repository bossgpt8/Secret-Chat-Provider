package com.boss.assistant

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.*
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.util.Base64
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

/** Bounded, foreground-only PCM transport. No model loading or audio files. */
class VoxLiveAudioModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    override fun getName() = "VoxLiveAudioModule"
    init { VoxConversationService.stopAudio = { stopInternal() } }
    private val running = AtomicBoolean(false)
    private val muted = AtomicBoolean(false)
    private val generation = AtomicInteger(0)
    private val sessionGeneration = AtomicInteger(0)
    private val queuedBytes = AtomicInteger(0)
    private val framesWritten = AtomicLong(0)
    private val lock = Any()
    private val queue = LinkedBlockingQueue<Pair<Int, ByteArray>>(128)
    private var recorder: AudioRecord? = null
    private var player: AudioTrack? = null
    private var captureThread: Thread? = null
    private var playbackThread: Thread? = null
    private var echo: AcousticEchoCanceler? = null
    private var noise: NoiseSuppressor? = null
    private var focus: AudioFocusRequest? = null
    private var focusListener: AudioManager.OnAudioFocusChangeListener? = null
    private var routeAcquired = false
    private var previousMode = AudioManager.MODE_NORMAL
    private var previousSpeaker = false
    private var speaking = false
    private fun manager() = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    private fun emit(name: String, values: WritableMap) {
        if (ctx.hasActiveReactInstance()) {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(name, values)
        }
    }
    private fun error(message: String) {
        emit("onVoxLiveError", Arguments.createMap().apply { putString("message", message) })
    }
    private fun playbackState(value: Boolean) {
        if (speaking == value) return
        speaking = value
        emit("onVoxLivePlayback", Arguments.createMap().apply { putBoolean("playing", value) })
    }

    @Synchronized
    @ReactMethod
    fun start(promise: Promise) {
        if (running.get()) { promise.resolve(true); return }
        if (ctx.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            promise.reject("ERR_LIVE_PERMISSION", "Microphone permission is required."); return
        }
        try {
            val runId = sessionGeneration.incrementAndGet()
            val am = manager()
            previousMode = am.mode
            @Suppress("DEPRECATION")
            previousSpeaker = am.isSpeakerphoneOn
            routeAcquired = true
            am.mode = AudioManager.MODE_IN_COMMUNICATION
            @Suppress("DEPRECATION")
            am.isSpeakerphoneOn = true
            val listener = AudioManager.OnAudioFocusChangeListener { change ->
                if (sessionGeneration.get() == runId &&
                    (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT)) {
                    error("Live stopped because another app took audio focus.")
                    stopInternal()
                }
            }
            focusListener = listener
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                    .setOnAudioFocusChangeListener(listener).build()
                if (am.requestAudioFocus(focus!!) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                    throw Exception("Another app is using audio. Close it and try Live again.")
                }
            } else {
                @Suppress("DEPRECATION")
                val granted = am.requestAudioFocus(listener, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                require(granted == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { "Audio focus is unavailable." }
            }
            val inputSize = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            val outputSize = AudioTrack.getMinBufferSize(24000, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
            require(inputSize > 0 && outputSize > 0) { "This device does not support Live PCM audio." }
            recorder = AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION, 16000,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(inputSize * 2, 6400))
            require(recorder!!.state == AudioRecord.STATE_INITIALIZED) { "Microphone could not start." }
            player = AudioTrack.Builder()
                .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
                .setAudioFormat(AudioFormat.Builder().setSampleRate(24000)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setBufferSizeInBytes(maxOf(outputSize * 2, 9600))
                .setTransferMode(AudioTrack.MODE_STREAM).build()
            require(player!!.state == AudioTrack.STATE_INITIALIZED) { "Speaker could not start." }
            try {
                if (AcousticEchoCanceler.isAvailable()) {
                    echo = AcousticEchoCanceler.create(recorder!!.audioSessionId)?.apply { enabled = true }
                }
            } catch (_: Exception) { echo = null }
            try {
                if (NoiseSuppressor.isAvailable()) {
                    noise = NoiseSuppressor.create(recorder!!.audioSessionId)?.apply { enabled = true }
                }
            } catch (_: Exception) { noise = null }
            muted.set(false)
            running.set(true)
            recorder!!.startRecording()
            player!!.play()
            captureThread = Thread({ capture(runId) }, "VoxLiveMic").apply { start() }
            playbackThread = Thread({ playback(runId) }, "VoxLiveSpeaker").apply { start() }
            promise.resolve(true)
        } catch (e: Exception) {
            stopInternal()
            promise.reject("ERR_LIVE_AUDIO", e.message, e)
        }
    }

    private fun capture(runId: Int) {
        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_AUDIO)
        val buffer = ByteArray(3200) // 100 ms of mono PCM16 at 16 kHz.
        val source = recorder ?: return
        try {
            while (running.get() && sessionGeneration.get() == runId) {
                val size = source.read(buffer, 0, buffer.size)
                if (sessionGeneration.get() != runId) break
                if (size < 0) throw Exception("Microphone stream failed.")
                if (size == 0 || muted.get()) continue
                var peak = 0
                for (i in 0 until size - 1 step 2) {
                    val sample = ((buffer[i].toInt() and 255) or (buffer[i + 1].toInt() shl 8)).toShort().toInt()
                    peak = maxOf(peak, kotlin.math.abs(sample))
                }
                emit("onVoxLiveInput", Arguments.createMap().apply {
                    putString("data", Base64.encodeToString(buffer, 0, size, Base64.NO_WRAP))
                    putDouble("level", (peak / 32768.0).coerceIn(0.0, 1.0))
                })
            }
        } catch (_: Exception) {
            if (running.get() && sessionGeneration.get() == runId) error("Microphone stream failed. Reconnect or use current voice mode.")
        }
    }

    private fun playback(runId: Int) {
        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_AUDIO)
        try {
            while (running.get() && sessionGeneration.get() == runId) {
                val chunk = queue.poll(20, TimeUnit.MILLISECONDS)
                if (chunk == null) {
                    synchronized(lock) {
                        val head = (player?.playbackHeadPosition?.toLong() ?: 0L) and 0xffffffffL
                        if (head >= framesWritten.get()) playbackState(false)
                    }
                    continue
                }
                val valid = synchronized(lock) {
                    if (chunk.first != generation.get()) false else {
                        queuedBytes.updateAndGet { maxOf(0, it - chunk.second.size) }
                        true
                    }
                }
                if (!valid) continue
                var offset = 0
                while (running.get() && sessionGeneration.get() == runId && generation.get() == chunk.first && offset < chunk.second.size) {
                    val written = synchronized(lock) {
                        if (generation.get() != chunk.first || sessionGeneration.get() != runId) 0 else player?.write(chunk.second, offset,
                            minOf(960, chunk.second.size - offset), AudioTrack.WRITE_NON_BLOCKING) ?: -1
                    }
                    if (written < 0) throw Exception("Audio playback failed.")
                    if (written == 0) { Thread.sleep(5); continue }
                    offset += written
                    synchronized(lock) {
                        if (generation.get() == chunk.first && running.get()) {
                            framesWritten.addAndGet(written / 2L)
                            playbackState(true)
                        }
                    }
                }
            }
        } catch (_: Exception) {
            if (running.get() && sessionGeneration.get() == runId) error("Live audio playback failed. Reconnect or use current voice mode.")
        }
    }

    @ReactMethod
    fun playChunk(data: String, promise: Promise) {
        try {
            require(running.get()) { "Live audio is not running." }
            require(data.length <= 350000) { "Audio chunk is too large." }
            val bytes = Base64.decode(data, Base64.DEFAULT)
            require(bytes.isNotEmpty() && bytes.size % 2 == 0) { "Invalid PCM audio." }
            synchronized(lock) {
                require(queuedBytes.get() + bytes.size <= 1500000 && queue.remainingCapacity() > 0) {
                    "Live playback is too far behind. Reconnect to clear the buffer."
                }
                queuedBytes.addAndGet(bytes.size)
                queue.offer(Pair(generation.get(), bytes))
            }
            promise.resolve(null)
        } catch (e: Exception) { promise.reject("ERR_LIVE_PLAYBACK", e.message, e) }
    }

    @ReactMethod
    fun interrupt(promise: Promise) {
        try {
            synchronized(lock) {
                generation.incrementAndGet()
                queue.clear()
                queuedBytes.set(0)
                player?.pause()
                player?.flush()
                framesWritten.set(0)
                if (running.get()) player?.play()
                playbackState(false)
            }
            promise.resolve(null)
        } catch (e: Exception) { promise.reject("ERR_LIVE_INTERRUPT", e.message, e) }
    }

    @ReactMethod fun setMuted(value: Boolean, promise: Promise) { muted.set(value); promise.resolve(null) }
    @ReactMethod fun stop(promise: Promise) { stopInternal(); promise.resolve(null) }

    @Synchronized
    private fun stopInternal() {
        running.set(false)
        sessionGeneration.incrementAndGet()
        generation.incrementAndGet()
        try { recorder?.stop() } catch (_: Exception) {}
        try {
            if (captureThread !== Thread.currentThread()) captureThread?.join(500)
            if (playbackThread !== Thread.currentThread()) playbackThread?.join(500)
        } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
        synchronized(lock) {
            queue.clear()
            queuedBytes.set(0)
            framesWritten.set(0)
            try { recorder?.release() } catch (_: Exception) {}
            try { player?.pause(); player?.flush(); player?.release() } catch (_: Exception) {}
            recorder = null
            player = null
        }
        try { echo?.release() } catch (_: Exception) {}
        try { noise?.release() } catch (_: Exception) {}
        echo = null; noise = null
        captureThread = null
        playbackThread = null
        try {
            if (routeAcquired) {
                val am = manager()
                if (android.os.Build.VERSION.SDK_INT >= 26) focus?.let { am.abandonAudioFocusRequest(it) }
                else {
                    @Suppress("DEPRECATION")
                    focusListener?.let { am.abandonAudioFocus(it) }
                }
                am.mode = previousMode
                @Suppress("DEPRECATION")
                am.isSpeakerphoneOn = previousSpeaker
                routeAcquired = false
            }
            focus = null
            focusListener = null
        } catch (_: Exception) {}
        playbackState(false)
    }
    override fun invalidate() { stopInternal(); super.invalidate() }
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
