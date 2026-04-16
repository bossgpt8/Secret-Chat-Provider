package com.boss.assistant

import android.accessibilityservice.AccessibilityService
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

    companion object {
        @Volatile var instance: ZenoAccessibilityService? = null
        val recentEvents = CopyOnWriteArrayList<AccessibilityEventData>()
        private const val MAX_EVENTS = 50
        private const val TAG = "ZenoAccessibilityService"
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
}
