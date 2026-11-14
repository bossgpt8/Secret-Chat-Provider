package com.boss.assistant

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
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
        get() = ComponentName(reactApplicationContext, VoxDeviceAdmin::class.java)

    @ReactMethod
    fun isAdminEnabled(promise: Promise) {
        promise.resolve(dpm.isAdminActive(adminComponent))
    }

    @ReactMethod
    fun requestAdmin(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null || activity.isFinishing || activity.isDestroyed) {
            promise.reject("ERR_DEVICE_ADMIN_ACTIVITY", "Open Vox in the foreground and try again.")
            return
        }
        activity.runOnUiThread {
            try {
                if (dpm.isAdminActive(adminComponent)) {
                    promise.resolve("already-enabled")
                    return@runOnUiThread
                }
                val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                    putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
                    putExtra(
                        DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                        "Allow Vox to lock the screen when you ask. You can revoke this in Device admin apps."
                    )
                }
                // Launch as a visible user action, not from the application
                // context, which some Android versions block without a dialog.
                activity.startActivity(intent)
                promise.resolve("activation")
            } catch (e: Exception) {
                // Some OEMs do not expose the standard activation activity.
                try {
                    activity.startActivity(Intent(Settings.ACTION_SECURITY_SETTINGS))
                    promise.resolve("security-settings")
                } catch (fallbackError: Exception) {
                    promise.reject(
                        "ERR_DEVICE_ADMIN",
                        "Android could not open Device Administrator. Open Settings > Security > Device admin apps and enable Vox.",
                        fallbackError
                    )
                }
            }
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
