package com.boss.assistant

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AudioControlModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    @Volatile
    private var lastNonZeroVolume = 5
    private var voiceFocusRequest: AudioFocusRequest? = null

    override fun getName(): String = "AudioControlModule"

    @Synchronized
    @ReactMethod
    fun getStatus(promise: Promise) {
        try {
            promise.resolve(currentStatusMap(audioManager()))
        } catch (e: Exception) {
            promise.reject("ERR_AUDIO_STATUS", e.message)
        }
    }

    @Synchronized
    @ReactMethod
    fun adjust(direction: String, promise: Promise) {
        try {
            val am = audioManager()
            val current = am.getStreamVolume(AudioManager.STREAM_MUSIC)
            val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            val next = when (direction) {
                "up" -> (current + 1).coerceAtMost(max)
                "down" -> (current - 1).coerceAtLeast(0)
                else -> current
            }
            am.setStreamVolume(AudioManager.STREAM_MUSIC, next, AudioManager.FLAG_SHOW_UI)
            if (next > 0) {
                lastNonZeroVolume = next
            }
            promise.resolve(currentStatusMap(am))
        } catch (e: Exception) {
            promise.reject("ERR_AUDIO_ADJUST", e.message)
        }
    }

    @Synchronized
    @ReactMethod
    fun setMuted(muted: Boolean, promise: Promise) {
        try {
            val am = audioManager()
            val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            val current = am.getStreamVolume(AudioManager.STREAM_MUSIC)

            if (muted) {
                if (current > 0) {
                    lastNonZeroVolume = current
                }
                am.setStreamVolume(AudioManager.STREAM_MUSIC, 0, AudioManager.FLAG_SHOW_UI)
            } else {
                val restoreTo = if (max <= 0) 0 else lastNonZeroVolume.coerceIn(1, max)
                am.setStreamVolume(AudioManager.STREAM_MUSIC, restoreTo, AudioManager.FLAG_SHOW_UI)
            }

            promise.resolve(currentStatusMap(am))
        } catch (e: Exception) {
            promise.reject("ERR_AUDIO_MUTE", e.message)
        }
    }

    /**
     * Reserve communication audio focus for a foreground voice turn. This
     * keeps the recorder and TTS on the same Android audio path and prevents
     * another media app from unexpectedly taking the microphone focus.
     */
    @Synchronized
    @ReactMethod
    fun beginVoiceSession(promise: Promise) {
        try {
            val am = audioManager()
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANT)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    )
                    .setAcceptsDelayedFocusGain(false)
                    .setOnAudioFocusChangeListener { }
                    .build()
                voiceFocusRequest = request
                promise.resolve(am.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED)
            } else {
                @Suppress("DEPRECATION")
                promise.resolve(
                    am.requestAudioFocus(
                        { },
                        AudioManager.STREAM_VOICE_CALL,
                        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
                    ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
                )
            }
        } catch (e: Exception) {
            promise.reject("ERR_AUDIO_FOCUS", e.message, e)
        }
    }

    @Synchronized
    @ReactMethod
    fun endVoiceSession(promise: Promise) {
        try {
            val am = audioManager()
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                voiceFocusRequest?.let { am.abandonAudioFocusRequest(it) }
                voiceFocusRequest = null
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERR_AUDIO_FOCUS_END", e.message, e)
        }
    }

    private fun audioManager(): AudioManager {
        return reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }

    private fun currentStatusMap(am: AudioManager) = Arguments.createMap().also { map ->
        val current = am.getStreamVolume(AudioManager.STREAM_MUSIC)
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        map.putInt("level", current)
        map.putInt("max", max)
        map.putDouble("percent", (current.toDouble() / max.toDouble()) * 100.0)
        map.putBoolean("muted", current == 0)
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
