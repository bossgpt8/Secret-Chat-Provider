package com.boss.assistant

import android.accessibilityservice.AccessibilityService
import android.content.pm.PackageManager
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean

class VoxAccessibilityService : AccessibilityService() {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val captureBusy = AtomicBoolean(false)
    private var captureThread: HandlerThread? = null
    private var captureHandler: Handler? = null
    private var pendingCapture: AccessibilityEventData? = null
    private var captureScheduled = false
    private val captureScreen = Runnable {
        val data = pendingCapture
        pendingCapture = null
        captureScheduled = false
        if (data != null && captureBusy.compareAndSet(false, true)) {
            val accepted = captureHandler?.post {
                try {
                    if (instance !== this) return@post
                    val root = rootInActiveWindow ?: return@post
                    try {
                        // A queued event may refer to a window that is no longer active.
                        if (root.packageName?.toString() != data.packageName) return@post
                        remember(data.copy(text = collectNodeText(root)))
                    } finally {
                        @Suppress("DEPRECATION")
                        root.recycle()
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Screen snapshot failed", e)
                } finally {
                    captureBusy.set(false)
                }
            } ?: false
            if (!accepted) captureBusy.set(false)
        }
    }

    private fun remember(data: AccessibilityEventData) {
        if (instance !== this) return
        recentEvents.add(0, data)
        if (recentEvents.size > MAX_EVENTS) recentEvents.removeAt(recentEvents.size - 1)
    }

    data class AccessibilityEventData(
        val packageName: String,
        val className: String,
        val eventType: Int,
        val text: String,
        val contentDescription: String,
    ) {
        fun toWritableMap(): WritableMap = Arguments.createMap().also {
            it.putString("packageName", packageName)
            it.putString("className", className)
            it.putInt("eventType", eventType)
            it.putString("text", text)
            it.putString("contentDescription", contentDescription)
        }
    }

    data class AccessibilityNotificationData(
        val app: String,
        val packageName: String,
        val sender: String,
        val text: String,
        val timestamp: Long,
        val hasReply: Boolean = false,
        val source: String = "accessibility",
    ) {
        fun toWritableMap(): WritableMap = Arguments.createMap().also {
            it.putString("app", app)
            it.putString("packageName", packageName)
            it.putString("sender", sender)
            it.putString("text", text)
            it.putDouble("timestamp", timestamp.toDouble())
            it.putBoolean("hasReply", hasReply)
            it.putString("source", source)
        }
    }

    companion object {
        @Volatile var instance: VoxAccessibilityService? = null
        val recentEvents = CopyOnWriteArrayList<AccessibilityEventData>()
        val recentNotificationEvents = CopyOnWriteArrayList<AccessibilityNotificationData>()
        private const val MAX_EVENTS = 50
        private const val MAX_NOTIFICATION_EVENTS = 50
        private const val TAG = "VoxAccessibilityService"
        @Volatile var onAccessibilityNotificationCallback: ((AccessibilityNotificationData) -> Unit)? = null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        captureThread = HandlerThread("VoxScreenContext").also { it.start() }
        captureHandler = Handler(captureThread!!.looper)
        // Service configuration is fully declared in res/xml/accessibility_service_config.xml.
        // No programmatic override needed.
        Log.i(TAG, "Accessibility service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        try {
            val pkg = event.packageName?.toString() ?: return
            // Do not inspect our own scrolling/animations or feed them back to JS.
            if (pkg == packageName) return
            if (event.eventType == AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED) {
                val n = toNotificationData(pkg, event)
                recentNotificationEvents.add(0, n)
                if (recentNotificationEvents.size > MAX_NOTIFICATION_EVENTS) {
                    recentNotificationEvents.removeAt(recentNotificationEvents.size - 1)
                }
                val cb = onAccessibilityNotificationCallback
                if (cb != null) {
                    mainHandler.post { cb.invoke(n) }
                }
                return
            }

            // Copy only cheap metadata here: AccessibilityEvent is recycled by Android.
            // Coalesce event bursts, and perform bounded screen inspection off the UI thread.
            pendingCapture = AccessibilityEventData(
                packageName = pkg,
                className = event.className?.toString() ?: "",
                eventType = event.eventType,
                text = "",
                contentDescription = event.contentDescription?.toString()?.take(1000) ?: "",
            )
            if (!captureScheduled) {
                captureScheduled = true
                mainHandler.postDelayed(captureScreen, 350L)
            }
        } catch (e: Exception) {
            Log.w(TAG, "onAccessibilityEvent error", e)
        }
    }

    override fun onInterrupt() {
        Log.w(TAG, "Accessibility service interrupted")
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(captureScreen)
        pendingCapture = null
        captureScheduled = false
        captureHandler?.removeCallbacksAndMessages(null)
        captureThread?.quitSafely()
        captureHandler = null
        captureThread = null
        super.onDestroy()
        instance = null
    }

    /**
     * Bounded, worker-thread-only snapshot. Never walk an unbounded screen tree.
     */
    private fun collectNodeText(node: AccessibilityNodeInfo?): String {
        node ?: return ""
        val sb = StringBuilder()
        var visited = 0
        val deadline = SystemClock.uptimeMillis() + 40L
        fun exhausted() = visited >= 128 || sb.length >= 6000 || SystemClock.uptimeMillis() >= deadline
        fun append(value: CharSequence?) {
            if (!value.isNullOrBlank() && sb.length < 6000) {
                sb.append(value.take(6000 - sb.length)).append(' ')
            }
        }
        fun visit(current: AccessibilityNodeInfo, depth: Int) {
            if (depth > 12 || exhausted()) return
            visited++
            if (current.isPassword) return
            val txt = current.text
            append(txt)
            if (current.contentDescription != txt) append(current.contentDescription)
            for (i in 0 until current.childCount) {
                if (exhausted()) break
                val child = current.getChild(i) ?: continue
                try {
                    visit(child, depth + 1)
                } finally {
                    @Suppress("DEPRECATION")
                    child.recycle()
                }
            }
        }
        try {
            visit(node, 0)
        } catch (e: Exception) {
            Log.w(TAG, "collectNodeText error", e)
        }
        return sb.toString().take(6000).trim()
    }

    private fun toNotificationData(packageName: String, event: AccessibilityEvent): AccessibilityNotificationData {
        val appName = getAppName(packageName)
        val parts = mutableListOf<String>()
        event.text?.forEach { piece ->
            val value = piece?.toString()?.trim()
            if (!value.isNullOrBlank()) parts.add(value)
        }
        val cd = event.contentDescription?.toString()?.trim()
        if (!cd.isNullOrBlank() && parts.none { it.equals(cd, ignoreCase = true) }) {
            parts.add(cd)
        }

        val normalized = parts.map { it.trim() }.filter { it.isNotBlank() }
        val senderIndex = if (
            normalized.isNotEmpty() && (
                normalized[0].equals(appName, ignoreCase = true) ||
                    normalized[0].equals(packageName, ignoreCase = true)
                )
        ) 1 else 0
        val sender = normalized.getOrNull(senderIndex)?.takeIf { it.isNotBlank() } ?: appName
        val msg = normalized.drop(senderIndex + 1).joinToString(" ").trim()
        if (normalized.size < 2) {
            Log.d(
                TAG,
                "Limited notification text for $packageName. Expected sender+message, got: $normalized"
            )
        }

        return AccessibilityNotificationData(
            app = appName,
            packageName = packageName,
            sender = sender,
            text = msg,
            timestamp = System.currentTimeMillis(),
        )
    }

    private fun getAppName(packageName: String): String {
        return try {
            val pm: PackageManager = packageManager
            val appInfo = pm.getApplicationInfo(packageName, 0)
            pm.getApplicationLabel(appInfo).toString()
        } catch (_: Exception) {
            packageName
        }
    }
}
