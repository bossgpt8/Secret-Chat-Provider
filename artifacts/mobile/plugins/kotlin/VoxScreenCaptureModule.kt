package com.boss.assistant

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class VoxScreenCaptureModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        private const val REQUEST_CODE = 2001
    }

    private var capturePromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "VoxScreenCaptureModule"

    /**
     * Opens Android's system consent dialog for screen capture.
     * Resolves true once the capture service has started, or rejects on denial.
     */
    @ReactMethod
    fun startCapture(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("ERR_NO_ACTIVITY", "No current activity")
            return
        }
        capturePromise = promise
        val mpManager = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        activity.startActivityForResult(mpManager.createScreenCaptureIntent(), REQUEST_CODE)
    }

    /** Stop capturing and release the foreground service. */
    @ReactMethod
    fun stopCapture(promise: Promise) {
        try {
            val ctx = reactApplicationContext
            ctx.stopService(Intent(ctx, VoxScreenCaptureService::class.java))
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERR_STOP_CAPTURE", e.message)
        }
    }

    /** Returns true if the capture service is currently running. */
    @ReactMethod
    fun isCapturing(promise: Promise) {
        promise.resolve(VoxScreenCaptureService.instance != null)
    }

    /**
     * Capture the current screen as a base64-encoded JPEG.
     * Returns null if not currently capturing.
     */
    @ReactMethod
    fun captureFrame(promise: Promise) {
        val frame = VoxScreenCaptureService.instance?.captureFrame()
        promise.resolve(frame)
    }

    // ── ActivityEventListener ────────────────────────────────────────────────

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_CODE) return
        val promise = capturePromise ?: return
        capturePromise = null

        if (resultCode != Activity.RESULT_OK || data == null) {
            promise.reject("ERR_PERMISSION_DENIED", "Screen capture permission was denied")
            return
        }

        try {
            val ctx = reactApplicationContext
            val serviceIntent = Intent(ctx, VoxScreenCaptureService::class.java).apply {
                putExtra(VoxScreenCaptureService.EXTRA_RESULT_CODE, resultCode)
                putExtra(VoxScreenCaptureService.EXTRA_RESULT_DATA, data)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(serviceIntent)
            } else {
                ctx.startService(serviceIntent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_START_SERVICE", e.message)
        }
    }

    override fun onNewIntent(intent: Intent) {}

    // Required boilerplate for NativeEventEmitter even if unused
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
