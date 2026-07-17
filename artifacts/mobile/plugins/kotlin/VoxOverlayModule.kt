package com.boss.assistant

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * React Native bridge for VoxOverlayService.
 *
 * JS API:
 *   NativeOverlayModule.startService()
 *   NativeOverlayModule.stopService()
 *   NativeOverlayModule.setState(state: string)  // idle | wake | listening | processing | speaking
 *   NativeOverlayModule.hasOverlayPermission(): Promise<boolean>
 *   NativeOverlayModule.requestOverlayPermission()
 *
 * Events emitted to JS:
 *   onVoxWakeWord  {}             — wake word detected; JS should get ready to receive command
 *   onVoxCommand   { text }       — full spoken command (already wake-word stripped)
 *   onVoxOverlayTap {}            — user tapped the floating bubble
 */
class VoxOverlayModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        VoxOverlayService.onEvent = { event, payload ->
            val params: WritableMap = Arguments.createMap()
            if (payload.isNotBlank()) params.putString("text", payload)
            sendEvent(event, params)
        }
    }

    override fun getName() = "VoxOverlayModule"

    // ── Service control ───────────────────────────────────────────────────────

    @ReactMethod
    fun startService(promise: Promise) {
        try {
            val intent = Intent(reactContext, VoxOverlayService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                reactContext.startForegroundService(intent)
            else
                reactContext.startService(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERR_OVERLAY_START", e.message)
        }
    }

    @ReactMethod
    fun stopService(promise: Promise) {
        try {
            val intent = Intent(reactContext, VoxOverlayService::class.java).apply {
                action = VoxOverlayService.ACTION_STOP
            }
            reactContext.startService(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERR_OVERLAY_STOP", e.message)
        }
    }

    /** Update the bubble visual state (idle / listening / speaking / processing). */
    @ReactMethod
    fun setState(state: String, promise: Promise) {
        try {
            val svc = VoxOverlayService.instance
            if (svc != null) {
                val intent = Intent(reactContext, VoxOverlayService::class.java).apply {
                    action = VoxOverlayService.ACTION_STATE
                    putExtra(VoxOverlayService.EXTRA_STATE, state)
                }
                reactContext.startService(intent)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERR_OVERLAY_STATE", e.message)
        }
    }

    // ── Permission helpers ────────────────────────────────────────────────────

    @ReactMethod
    fun hasOverlayPermission(promise: Promise) {
        val hasPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            Settings.canDrawOverlays(reactContext)
        else true
        promise.resolve(hasPermission)
    }

    @ReactMethod
    fun requestOverlayPermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${reactContext.packageName}")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactContext.startActivity(intent)
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERR_OVERLAY_PERM", e.message)
        }
    }

    @ReactMethod
    fun isServiceRunning(promise: Promise) {
        promise.resolve(VoxOverlayService.instance != null)
    }

    // ── Required boilerplate for event emitter ────────────────────────────────
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    // ── Helpers ───────────────────────────────────────────────────────────────
    private fun sendEvent(eventName: String, params: WritableMap?) {
        if (!reactContext.hasActiveReactInstance()) return
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (_: Exception) {}
    }
}
