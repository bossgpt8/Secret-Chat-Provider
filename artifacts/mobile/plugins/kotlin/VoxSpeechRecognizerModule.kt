package com.boss.assistant

import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Fast foreground speech input for the voice loop.
 *
 * Android's recognizer supplies partial results locally/on-device when the
 * installed speech service supports it. The JS client can use these partials
 * for live transcript UI and barge-in while cloud Whisper remains the
 * accuracy fallback.
 */
class VoxSpeechRecognizerModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
    private var recognizer: SpeechRecognizer? = null
    @Volatile private var listening = false

    override fun getName(): String = "VoxSpeechRecognizerModule"

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(SpeechRecognizer.isRecognitionAvailable(reactContext))
    }

    @ReactMethod
    fun startListening(language: String, silenceMs: Int, promise: Promise) {
        try {
            if (!SpeechRecognizer.isRecognitionAvailable(reactContext)) {
                promise.resolve(false)
                return
            }
            stopRecognizer()
            recognizer = SpeechRecognizer.createSpeechRecognizer(reactContext)
            recognizer?.setRecognitionListener(listener)
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(
                    RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS,
                    silenceMs.coerceIn(500, 2500).toLong()
                )
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 300L)
            }
            recognizer?.startListening(intent)
            listening = true
            promise.resolve(true)
        } catch (e: Exception) {
            listening = false
            promise.reject("ERR_SPEECH_START", e.message, e)
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        // Ask Android for its final hypothesis. onResults will deliver it
        // before the recognizer is torn down.
        try {
            recognizer?.stopListening()
        } catch (_: Exception) {
            stopRecognizer()
        }
        promise.resolve(null)
    }

    @ReactMethod
    fun cancelListening(promise: Promise) {
        stopRecognizer()
        promise.resolve(null)
    }

    @ReactMethod
    fun isListening(promise: Promise) {
        promise.resolve(listening)
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {
            val map = Arguments.createMap()
            map.putDouble("level", ((rmsdB + 2.0) / 12.0).coerceIn(0.0, 1.0))
            sendEvent("onVoxSpeechPartial", map)
        }
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}

        override fun onPartialResults(partialResults: Bundle?) {
            val text = partialResults
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull()
                ?.trim()
                ?: return
            if (text.isNotBlank()) {
                val map = Arguments.createMap()
                map.putString("text", text)
                sendEvent("onVoxSpeechPartial", map)
            }
        }

        override fun onResults(results: Bundle?) {
            listening = false
            val text = results
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull()
                ?.trim()
                ?: ""
            if (text.isNotBlank()) {
                val map = Arguments.createMap()
                map.putString("text", text)
                sendEvent("onVoxSpeechResult", map)
            }
        }

        override fun onError(error: Int) {
            listening = false
            val map = Arguments.createMap()
            map.putInt("code", error)
            sendEvent("onVoxSpeechError", map)
        }
    }

    private fun stopRecognizer() {
        listening = false
        try { recognizer?.cancel() } catch (_: Exception) {}
        try { recognizer?.destroy() } catch (_: Exception) {}
        recognizer = null
    }

    private fun sendEvent(name: String, params: com.facebook.react.bridge.WritableMap) {
        if (!reactContext.hasActiveReactInstance()) return
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(name, params)
        } catch (_: Exception) {}
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}