package com.boss.assistant

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AccessibilityModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AccessibilityModule"

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
