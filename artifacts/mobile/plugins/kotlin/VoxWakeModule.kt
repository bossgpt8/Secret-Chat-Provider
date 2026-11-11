package com.boss.assistant

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.common.LifecycleState
import com.facebook.react.modules.core.DeviceEventManagerModule

class VoxWakeModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    companion object {
        // Audio-busy intent survives service startup, so enabling while speaking
        // cannot start a competing AudioRecord before React's next render.
        val pauseRequests = mutableSetOf<String>()
    }
    private val main = Handler(Looper.getMainLooper())
    init {
        VoxWakeService.onStatus = { emit("onVoxWakeStatus", status()) }
        VoxWakeService.onWake = {
            emit("onVoxLocalWake", Arguments.createMap().apply {
                putDouble("detectedAtMs", System.currentTimeMillis().toDouble())
            })
        }
    }
    override fun getName() = "VoxWakeModule"
    private fun status(): WritableMap = Arguments.createMap().apply {
        putBoolean("enabled", context.getSharedPreferences(VoxWakeService.PREFS, 0).getBoolean("enabled", false))
        putBoolean("running", VoxWakeService.instance != null)
        putString("state", VoxWakeService.instance?.state ?: "stopped")
        putString("message", VoxWakeService.instance?.message ?: "Listener stopped. Enable or resume it while Vox is open.")
    }
    @ReactMethod fun getStatus(promise: Promise) { main.post { promise.resolve(status()) } }
    @ReactMethod fun setName(name: String, promise: Promise) {
        main.post {
            context.getSharedPreferences(VoxWakeService.PREFS, 0).edit().putString("name", name).apply()
            VoxWakeService.instance?.rename(name)
            promise.resolve(null)
        }
    }
    @ReactMethod fun start(promise: Promise) {
        main.post {
            try {
                check(context.lifecycleState == LifecycleState.RESUMED) { "Open Vox before enabling the wake microphone." }
                check(ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    "Grant microphone permission in Vox Settings."
                }
                context.getSharedPreferences(VoxWakeService.PREFS, 0).edit().putBoolean("enabled", true).apply()
                ContextCompat.startForegroundService(context, Intent(context, VoxWakeService::class.java).setAction(VoxWakeService.RESUME))
                promise.resolve(null)
            } catch (e: Exception) {
                context.getSharedPreferences(VoxWakeService.PREFS, 0).edit().putBoolean("enabled", false).apply()
                promise.reject("WAKE_START", e.message, e)
            }
        }
    }
    @ReactMethod fun stop(promise: Promise) {
        main.post {
            context.getSharedPreferences(VoxWakeService.PREFS, 0).edit().putBoolean("enabled", false).apply()
            context.stopService(Intent(context, VoxWakeService::class.java))
            promise.resolve(null)
        }
    }
    @ReactMethod fun setPaused(reason: String, paused: Boolean, promise: Promise) {
        main.post {
            if (paused) pauseRequests.add(reason) else pauseRequests.remove(reason)
            val service = VoxWakeService.instance
            if (service == null) promise.resolve(null)
            else service.setPaused(reason, paused) { promise.resolve(null) }
        }
    }
    private fun emit(event: String, params: WritableMap): Boolean {
        if (!context.hasActiveReactInstance()) return false
        return try {
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(event, params)
            true
        } catch (_: Exception) { false }
    }
    override fun invalidate() {
        VoxWakeService.onWake = null
        VoxWakeService.onStatus = null
        main.post {
            pauseRequests.toList().forEach { VoxWakeService.instance?.setPaused(it, false) }
            pauseRequests.clear()
        }
        super.invalidate()
    }
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
