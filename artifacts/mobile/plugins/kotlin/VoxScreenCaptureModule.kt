package com.boss.assistant

import android.accessibilityservice.GestureDescription
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

class VoxScreenCaptureModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        private const val TAG = "VoxScreenCaptureModule"
        private const val REQUEST_CODE = 2001
    }

    private var capturePromise: Promise? = null
    private val mainHandler = Handler(Looper.getMainLooper())

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
        val activity = currentActivity
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

    /**
     * Inject a gesture path through Android's Accessibility Service.
     *
     * [points]      ReadableArray of {x, y} objects with NORMALIZED 0.0–1.0 coordinates.
     * [durationMs]  How long the stroke lasts in milliseconds (longer = slower drag).
     * [screenW]     Actual screen pixel width (from Dimensions.get('screen').width).
     * [screenH]     Actual screen pixel height.
     *
     * Resolves true on completion, false if cancelled.
     * Rejects if Accessibility Service is not enabled.
     */
    @ReactMethod
    fun performGesture(
        points: ReadableArray,
        durationMs: Int,
        screenW: Int,
        screenH: Int,
        promise: Promise
    ) {
        val service = VoxAccessibilityService.instance
        if (service == null) {
            promise.reject("ERR_NO_ACCESSIBILITY",
                "Accessibility service is not enabled. Go to Settings → Accessibility → Vox Assistant.")
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            promise.reject("ERR_API_LEVEL", "Gesture injection requires Android 7.0+")
            return
        }
        if (points.size() < 2) {
            promise.reject("ERR_POINTS", "Need at least 2 points for a gesture")
            return
        }

        mainHandler.post {
            try {
                val path = Path()
                for (i in 0 until points.size()) {
                    val pt = points.getMap(i) ?: continue
                    val px = (pt.getDouble("x") * screenW).toFloat()
                    val py = (pt.getDouble("y") * screenH).toFloat()
                    if (i == 0) path.moveTo(px, py) else path.lineTo(px, py)
                }

                val stroke = GestureDescription.StrokeDescription(path, 0L, durationMs.toLong())
                val gesture = GestureDescription.Builder().addStroke(stroke).build()

                service.dispatchGesture(
                    gesture,
                    object : android.accessibilityservice.AccessibilityService.GestureResultCallback() {
                        override fun onCompleted(g: GestureDescription) { promise.resolve(true) }
                        override fun onCancelled(g: GestureDescription) { promise.resolve(false) }
                    },
                    null
                )
            } catch (e: Exception) {
                Log.e(TAG, "performGesture error", e)
                promise.reject("ERR_GESTURE", e.message)
            }
        }
    }

    // ── ActivityEventListener ────────────────────────────────────────────────

    override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
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

    override fun onNewIntent(intent: Intent?) {}

    // Required boilerplate for NativeEventEmitter even if unused
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
