package com.boss.assistant

import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import java.util.Locale
import java.util.concurrent.Executors

class SystemPermissionsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SystemPermissionsModule"

    private val appWorker = Executors.newSingleThreadExecutor()

    @ReactMethod
    fun setTorch(enabled: Boolean, promise: Promise) {
        try {
            val manager = reactApplicationContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val id = manager.cameraIdList.firstOrNull { cameraId ->
                val info = manager.getCameraCharacteristics(cameraId)
                info.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true &&
                    info.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
            }
            if (id == null) { promise.resolve(false); return }
            manager.setTorchMode(id, enabled)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_TORCH", "Could not control the torch.", e)
        }
    }

    @ReactMethod
    fun launchApp(name: String, promise: Promise) {
        appWorker.execute {
            try {
                val pm = reactApplicationContext.packageManager
                val key = normalizeAppName(name)
                val known = mapOf(
                    "whatsapp" to listOf("com.whatsapp", "com.whatsapp.w4b"),
                    "youtube" to listOf("com.google.android.youtube"),
                    "maps" to listOf("com.google.android.apps.maps"),
                    "spotify" to listOf("com.spotify.music"),
                    "instagram" to listOf("com.instagram.android"),
                    "twitter" to listOf("com.twitter.android"),
                    "facebook" to listOf("com.facebook.katana", "com.facebook.lite"),
                    "netflix" to listOf("com.netflix.mediaclient"),
                    "tiktok" to listOf("com.zhiliaoapp.musically", "com.ss.android.ugc.trill"),
                    "gmail" to listOf("com.google.android.gm"),
                    "telegram" to listOf("org.telegram.messenger"),
                    "chrome" to listOf("com.android.chrome"),
                    "browser" to listOf("com.android.chrome", "com.sec.android.app.sbrowser"),
                    "firefox" to listOf("org.mozilla.firefox"),
                    "playstore" to listOf("com.android.vending"),
                    "calculator" to listOf("com.google.android.calculator", "com.sec.android.app.popupcalculator", "com.android.calculator2"),
                    "clock" to listOf("com.google.android.deskclock", "com.sec.android.app.clockpackage"),
                    "camera" to listOf("com.google.android.GoogleCamera", "com.sec.android.app.camera", "com.android.camera2"),
                    "gallery" to listOf("com.google.android.apps.photos", "com.sec.android.gallery3d", "com.android.gallery3d")
                )
                var launch: Intent? = if (key == "settings") Intent(Settings.ACTION_SETTINGS) else null
                for (pkg in known[key] ?: listOf(name)) {
                    if (launch != null) break
                    launch = pm.getLaunchIntentForPackage(pkg)
                }
                if (launch == null) {
                    // Exact installed labels only. Never guess a website for
                    // an app that isn't installed.
                    val query = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
                    val matches = pm.queryIntentActivities(query, 0).filter {
                        normalizeAppName(it.loadLabel(pm).toString()) == key
                    }
                    if (matches.size == 1) {
                        val activity = matches.first().activityInfo
                        launch = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
                            .setClassName(activity.packageName, activity.name)
                    }
                }
                val intent = launch
                if (intent == null) {
                    promise.resolve(false)
                } else {
                    UiThreadUtil.runOnUiThread {
                        try {
                            reactApplicationContext.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                            promise.resolve(true)
                        } catch (e: Exception) {
                            promise.reject("ERR_LAUNCH_APP", "Could not open the installed app.", e)
                        }
                    }
                }
            } catch (e: Exception) {
                promise.reject("ERR_LAUNCH_APP", "Could not find the installed app.", e)
            }
        }
    }

    private fun normalizeAppName(name: String): String =
        name.lowercase(Locale.ROOT).replace(" ", "").replace("-", "").replace(".", "")

    override fun invalidate() {
        appWorker.shutdown()
        super.invalidate()
    }

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
                if (activity.isFinishing || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1 && activity.isDestroyed)) {
                    return@runOnUiThread
                }
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
