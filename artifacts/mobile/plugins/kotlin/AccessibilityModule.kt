package com.boss.assistant

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import android.view.accessibility.AccessibilityManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class AccessibilityModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
    companion object {
        private const val TAG = "AccessibilityModule"
    }

    init {
        ZenoAccessibilityService.onAccessibilityNotificationCallback = { data ->
            sendEvent("onZenoAccessibilityNotification", data.toWritableMap())
        }
    }

    override fun getName(): String = "AccessibilityModule"

    private fun sendEvent(eventName: String, params: WritableMap?) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to emit event: $eventName", e)
        }
    }

    /**
     * Returns true if ZenoAccessibilityService is currently enabled in system settings.
     */
    @ReactMethod
    fun isEnabled(promise: Promise) {
        promise.resolve(isAccessibilityServiceEnabled())
    }

    /**
     * Opens the system Accessibility settings screen so the user can enable the service.
     */
    @ReactMethod
    fun requestEnable(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERR_ACCESSIBILITY_SETTINGS", e.message)
        }
    }

    /**
     * Returns up to [limit] recent accessibility events captured by ZenoAccessibilityService.
     */
    @ReactMethod
    fun getRecentEvents(limit: Int, promise: Promise) {
        val arr = Arguments.createArray()
        val events = ZenoAccessibilityService.recentEvents.take(limit)
        for (e in events) {
            arr.pushMap(e.toWritableMap())
        }
        promise.resolve(arr)
    }

    /**
     * Returns up to [limit] recent notification events captured via accessibility.
     */
    @ReactMethod
    fun getRecentNotificationEvents(limit: Int, promise: Promise) {
        val arr = Arguments.createArray()
        val events = ZenoAccessibilityService.recentNotificationEvents.take(limit)
        for (e in events) {
            arr.pushMap(e.toWritableMap())
        }
        promise.resolve(arr)
    }

    /**
     * Returns true if battery optimizations are already ignored for this app.
     */
    @ReactMethod
    fun isBatteryOptimizationIgnored(promise: Promise) {
        try {
            val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            promise.resolve(pm.isIgnoringBatteryOptimizations(reactApplicationContext.packageName))
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * Opens battery optimization settings so user can exempt the app.
     */
    @ReactMethod
    fun requestIgnoreBatteryOptimization(promise: Promise) {
        try {
            val pkg = reactApplicationContext.packageName
            val directIntent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                .setData(Uri.parse("package:$pkg"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(directIntent)
            promise.resolve(null)
        } catch (_: Exception) {
            try {
                val fallbackIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(fallbackIntent)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("ERR_BATTERY_OPTIMIZATION_SETTINGS", e.message)
            }
        }
    }

    // ── Required for NativeEventEmitter even if we don't use it ──────────────
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    // ── Private helpers ───────────────────────────────────────────────────────

    private fun isAccessibilityServiceEnabled(): Boolean {
        return try {
            val am = reactApplicationContext.getSystemService(Context.ACCESSIBILITY_SERVICE)
                    as AccessibilityManager
            val enabledServices = am.getEnabledAccessibilityServiceList(
                AccessibilityServiceInfo.FEEDBACK_GENERIC
            )
            val pkg = reactApplicationContext.packageName
            enabledServices.any { it.resolveInfo.serviceInfo.packageName == pkg }
        } catch (_: Exception) { false }
    }
}
