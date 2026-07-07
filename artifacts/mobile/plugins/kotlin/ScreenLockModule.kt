package com.boss.assistant

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ScreenLockModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ScreenLockModule"

    private val dpm: DevicePolicyManager
        get() = reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    private val adminComponent: ComponentName
        get() = ComponentName(reactApplicationContext, ZenoDeviceAdmin::class.java)

    @ReactMethod
    fun isAdminEnabled(promise: Promise) {
        promise.resolve(dpm.isAdminActive(adminComponent))
    }

    @ReactMethod
    fun requestAdmin(promise: Promise) {
        try {
            val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
                putExtra(
                    DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                    "Required to lock the screen via voice command."
                )
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERR_DEVICE_ADMIN", e.message)
        }
    }

    @ReactMethod
    fun lockScreen(promise: Promise) {
        if (dpm.isAdminActive(adminComponent)) {
            dpm.lockNow()
            promise.resolve(true)
        } else {
            promise.resolve(false)
        }
    }
}
