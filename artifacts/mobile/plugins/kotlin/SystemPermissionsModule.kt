package com.boss.assistant

import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SystemPermissionsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SystemPermissionsModule"

    // ── Overlay ───────────────────────────────────────────────────────────────

    @ReactMethod
    fun hasOverlayPermission(promise: Promise) {
        promise.resolve(Settings.canDrawOverlays(reactApplicationContext))
    }

    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${reactApplicationContext.packageName}")
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERR_OVERLAY", e.message)
        }
    }

    // ── Write Settings ────────────────────────────────────────────────────────

    @ReactMethod
    fun hasWriteSettingsPermission(promise: Promise) {
        promise.resolve(Settings.System.canWrite(reactApplicationContext))
    }

    @ReactMethod
    fun requestWriteSettingsPermission(promise: Promise) {
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_WRITE_SETTINGS,
                Uri.parse("package:${reactApplicationContext.packageName}")
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERR_WRITE_SETTINGS", e.message)
        }
    }

    // ── Volume (AudioManager — no special permissions needed) ─────────────────

    @ReactMethod
    fun adjustVolume(direction: String, promise: Promise) {
        try {
            val am = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val flag = AudioManager.FLAG_SHOW_UI
            when (direction) {
                "up"     -> am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_RAISE, flag)
                "down"   -> am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_LOWER, flag)
                "mute"   -> am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_MUTE, flag)
                "unmute" -> am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_UNMUTE, flag)
                else -> {
                    promise.reject("ERR_VOLUME", "Unknown direction: $direction")
                    return
                }
            }
            val current = am.getStreamVolume(AudioManager.STREAM_MUSIC)
            val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            val muted = am.isStreamMute(AudioManager.STREAM_MUSIC)
            promise.resolve(Arguments.createMap().also {
                it.putInt("current", current)
                it.putInt("max", max)
                it.putBoolean("muted", muted)
            })
        } catch (e: Exception) {
            promise.reject("ERR_VOLUME", e.message)
        }
    }

    @ReactMethod
    fun getVolume(promise: Promise) {
        try {
            val am = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val current = am.getStreamVolume(AudioManager.STREAM_MUSIC)
            val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            val muted = am.isStreamMute(AudioManager.STREAM_MUSIC)
            promise.resolve(Arguments.createMap().also {
                it.putInt("current", current)
                it.putInt("max", max)
                it.putBoolean("muted", muted)
            })
        } catch (e: Exception) {
            promise.reject("ERR_VOLUME", e.message)
        }
    }

    // ── System Brightness (persists after leaving app, requires WRITE_SETTINGS) ─

    @ReactMethod
    fun getSystemBrightness(promise: Promise) {
        try {
            val brightness = Settings.System.getInt(
                reactApplicationContext.contentResolver,
                Settings.System.SCREEN_BRIGHTNESS,
                128
            )
            promise.resolve(brightness.toDouble() / 255.0)
        } catch (e: Exception) {
            promise.reject("ERR_BRIGHTNESS", e.message)
        }
    }

    @ReactMethod
    fun setSystemBrightness(value: Float, promise: Promise) {
        try {
            if (!Settings.System.canWrite(reactApplicationContext)) {
                promise.reject("ERR_NO_PERMISSION", "Modify system settings permission required")
                return
            }
            val resolver = reactApplicationContext.contentResolver
            Settings.System.putInt(
                resolver,
                Settings.System.SCREEN_BRIGHTNESS_MODE,
                Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL
            )
            val intVal = (value.coerceIn(0f, 1f) * 255).toInt().coerceAtLeast(5)
            Settings.System.putInt(resolver, Settings.System.SCREEN_BRIGHTNESS, intVal)
            val activity = reactApplicationContext.currentActivity
            activity?.runOnUiThread {
                val lp = activity.window.attributes
                lp.screenBrightness = value.coerceIn(0.02f, 1f)
                activity.window.attributes = lp
            }
            promise.resolve(intVal.toDouble() / 255.0)
        } catch (e: Exception) {
            promise.reject("ERR_BRIGHTNESS", e.message)
        }
    }
}
