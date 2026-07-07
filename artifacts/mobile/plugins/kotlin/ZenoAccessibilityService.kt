package com.boss.assistant

import android.accessibilityservice.AccessibilityService
import android.content.pm.PackageManager
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.util.concurrent.CopyOnWriteArrayList

class ZenoAccessibilityService : AccessibilityService() {

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
        @Volatile var instance: ZenoAccessibilityService? = null
        val recentEvents = CopyOnWriteArrayList<AccessibilityEventData>()
        val recentNotificationEvents = CopyOnWriteArrayList<AccessibilityNotificationData>()
        private const val MAX_EVENTS = 50
        private const val MAX_NOTIFICATION_EVENTS = 50
        private const val TAG = "ZenoAccessibilityService"
        @Volatile var onAccessibilityNotificationCallback: ((AccessibilityNotificationData) -> Unit)? = null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        // Service configuration is fully declared in res/xml/accessibility_service_config.xml.
        // No programmatic override needed.
        Log.i(TAG, "Accessibility service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        try {
            val pkg = event.packageName?.toString() ?: return
            val cls = event.className?.toString() ?: ""
            val text = collectNodeText(rootInActiveWindow)
            val cd = event.contentDescription?.toString() ?: ""

            val data = AccessibilityEventData(
                packageName = pkg,
                className = cls,
                eventType = event.eventType,
                text = text,
                contentDescription = cd,
            )
            recentEvents.add(0, data)
            if (recentEvents.size > MAX_EVENTS) {
                recentEvents.removeAt(recentEvents.size - 1)
            }

            if (event.eventType == AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED) {
                val n = toNotificationData(pkg, event)
                recentNotificationEvents.add(0, n)
                if (recentNotificationEvents.size > MAX_NOTIFICATION_EVENTS) {
                    recentNotificationEvents.removeAt(recentNotificationEvents.size - 1)
                }
                onAccessibilityNotificationCallback?.invoke(n)
            }
        } catch (e: Exception) {
            Log.w(TAG, "onAccessibilityEvent error", e)
        }
    }

    override fun onInterrupt() {
        Log.w(TAG, "Accessibility service interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
    }

    /**
     * Recursively collects all visible text from the node tree.
     */
    private fun collectNodeText(node: AccessibilityNodeInfo?): String {
        node ?: return ""
        return try {
            val sb = StringBuilder()
            val txt = node.text?.toString()
            val cd = node.contentDescription?.toString()
            if (!txt.isNullOrBlank()) sb.append(txt).append(" ")
            if (!cd.isNullOrBlank() && cd != txt) sb.append(cd).append(" ")
            for (i in 0 until node.childCount) {
                sb.append(collectNodeText(node.getChild(i)))
            }
            sb.toString().trim()
        } catch (e: Exception) {
            Log.w(TAG, "collectNodeText error", e)
            ""
        }
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
