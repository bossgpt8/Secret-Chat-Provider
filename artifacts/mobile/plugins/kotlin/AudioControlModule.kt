package com.boss.assistant

import android.content.Context
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
