package com.boss.assistant

import android.content.Context
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.KeywordSpotter
import com.k2fsa.sherpa.onnx.KeywordSpotterConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineStream
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import org.json.JSONArray

/** One owner thread for all JNI objects. No audio files, JS audio, or network. */
class VoxWakeEngine(
    private val context: Context,
    private val onReady: () -> Unit,
    private val onWake: () -> Unit,
    private val onError: (String) -> Unit,
) {
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val generation = AtomicInteger(0)
    @Volatile private var recorder: AudioRecord? = null
    private var spotter: KeywordSpotter? = null
    private var tokenizer: VoxWakeTokenizer? = null
    private var closed = false

    fun start(name: String) {
        if (closed) return
        val session = generation.incrementAndGet()
        executor.execute {
            var record: AudioRecord? = null
            var stream: OnlineStream? = null
            var detected = false
            var failure: String? = null
            try {
                if (session != generation.get()) return@execute
                if (tokenizer == null) {
                    val entries = JSONArray(context.assets.open("vox-wake/vocabulary.json").bufferedReader().use { it.readText() })
                    tokenizer = VoxWakeTokenizer((0 until entries.length()).associate { index ->
                        val entry = entries.getJSONArray(index)
                        entry.getString(0) to entry.getDouble(1).toFloat()
                    })
                }
                val keywords = tokenizer!!.keywords(name)
                if (spotter == null) {
                    val dir = "vox-wake"
                    spotter = KeywordSpotter(context.assets, KeywordSpotterConfig(
                        featConfig = FeatureConfig(sampleRate = 16000, featureDim = 80),
                        modelConfig = OnlineModelConfig(
                            transducer = OnlineTransducerModelConfig(
                                encoder = "$dir/encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
                                decoder = "$dir/decoder-epoch-12-avg-2-chunk-16-left-64.onnx",
                                joiner = "$dir/joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx",
                            ),
                            tokens = "$dir/tokens.txt", numThreads = 1,
                            provider = "cpu", modelType = "zipformer2",
                        ),
                        keywordsFile = "$dir/keywords.txt",
                        keywordsScore = 1.5f,
                        keywordsThreshold = 0.35f,
                        numTrailingBlanks = 2,
                    ))
                }
                if (session != generation.get()) return@execute
                val kws = spotter!!
                val online = kws.createStream(keywords)
                stream = online
                check(online.ptr != 0L) { "Wake model could not create a stream." }
                val min = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
                check(min > 0) { "16 kHz microphone audio is not supported." }
                val microphone = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,
                    16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min * 2, 6400))
                record = microphone
                recorder = microphone
                check(microphone.state == AudioRecord.STATE_INITIALIZED) { "Microphone is unavailable." }
                if (session != generation.get()) return@execute
                microphone.startRecording()
                check(microphone.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "Microphone could not start." }
                main.post { if (session == generation.get()) onReady() }
                val buffer = ShortArray(1600)
                val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
                while (session == generation.get()) {
                    if (audio.mode == AudioManager.MODE_IN_CALL || audio.mode == AudioManager.MODE_IN_COMMUNICATION) {
                        failure = "Microphone paused for a phone or voice call. Tap Resume after the call."
                        break
                    }
                    if (android.os.Build.VERSION.SDK_INT >= 29 &&
                        microphone.activeRecordingConfiguration?.isClientSilenced == true) {
                        failure = "Android silenced the microphone. Close the other recording app, then tap Resume."
                        break
                    }
                    val count = microphone.read(buffer, 0, buffer.size)
                    if (session != generation.get()) break
                    check(count > 0) { "Microphone capture stopped. Tap Resume to retry." }
                    online.acceptWaveform(FloatArray(count) { buffer[it] / 32768.0f }, 16000)
                    while (session == generation.get() && kws.isReady(online)) {
                        kws.decode(online)
                        if (kws.getResult(online).keyword == "ASSISTANT_WAKE") {
                            detected = true
                            break
                        }
                    }
                    if (detected) break
                }
            } catch (e: Exception) {
                failure = e.message ?: "Wake-word listener failed. Turn it off and on to retry."
            } catch (_: LinkageError) {
                failure = "The installed APK does not support the wake engine on this device."
            } finally {
                try { record?.stop() } catch (_: Exception) {}
                record?.release()
                if (recorder === record) recorder = null
                stream?.release()
            }
            // Handoff happens only AFTER AudioRecord and the stream have been released.
            main.post {
                if (session == generation.get()) {
                    if (detected) onWake() else if (failure != null) onError(failure!!)
                }
            }
        }
    }

    fun pause(afterRelease: () -> Unit = {}) {
        if (closed) { afterRelease(); return }
        generation.incrementAndGet()
        try { recorder?.stop() } catch (_: Exception) {}
        executor.execute { main.post { afterRelease() } }
    }

    fun close() {
        if (closed) return
        generation.incrementAndGet()
        closed = true
        try { recorder?.stop() } catch (_: Exception) {}
        executor.execute {
            spotter?.release()
            spotter = null
        }
        executor.shutdown()
    }
}
