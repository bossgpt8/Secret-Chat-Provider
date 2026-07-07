package com.boss.assistant

import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class NotificationListenerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        ZenoNotificationService.onNotificationPostedCallback = { data ->
            sendEvent("onZenoNotification", data.toWritableMap())
        }
    }

    override fun getName(): String = "NotificationListenerModule"

    private fun sendEvent(eventName: String, params: WritableMap?) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        } catch (_: Exception) {}
    }

    @ReactMethod
    fun hasPermission(promise: Promise) {
        val enabledListeners = Settings.Secure.getString(
            reactApplicationContext.contentResolver,
            "enabled_notification_listeners"
        ) ?: ""
        promise.resolve(enabledListeners.contains(reactApplicationContext.packageName))
    }

    @ReactMethod
    fun requestPermission(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERR_NOTIFICATION_LISTENER", e.message)
        }
    }

    @ReactMethod
    fun getRecentNotifications(promise: Promise) {
        val arr = Arguments.createArray()
        for (n in ZenoNotificationService.recentNotifications.toList()) {
            arr.pushMap(n.toWritableMap())
        }
        promise.resolve(arr)
    }

    @ReactMethod
    fun replyToNotification(key: String, text: String, promise: Promise) {
        val result = ZenoNotificationService.instance?.replyTo(key, text) ?: false
        promise.resolve(result)
    }

    @ReactMethod
    fun dismissNotification(key: String, promise: Promise) {
        ZenoNotificationService.instance?.dismiss(key)
        promise.resolve(null)
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
