package com.boss.assistant

import android.app.Notification
import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.util.concurrent.CopyOnWriteArrayList

class ZenoNotificationService : NotificationListenerService() {

    data class NotificationData(
        val key: String,
        val app: String,
        val packageName: String,
        val sender: String,
        val text: String,
        val timestamp: Long,
        val hasReply: Boolean,
    ) {
        fun toWritableMap(): WritableMap = Arguments.createMap().also {
            it.putString("key", key)
            it.putString("app", app)
            it.putString("packageName", packageName)
            it.putString("sender", sender)
            it.putString("text", text)
            it.putDouble("timestamp", timestamp.toDouble())
            it.putBoolean("hasReply", hasReply)
        }
    }

    companion object {
        @Volatile var instance: ZenoNotificationService? = null
        val recentNotifications = CopyOnWriteArrayList<NotificationData>()
        private const val MAX_RECENT = 50
        private const val TAG = "ZenoNotificationService"
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val data = sbn.toData() ?: return
        recentNotifications.add(0, data)
        if (recentNotifications.size > MAX_RECENT) {
            recentNotifications.removeAt(recentNotifications.size - 1)
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {}

    fun replyTo(key: String, text: String): Boolean {
        return try {
            val sbn = activeNotifications.find { it.key == key } ?: return false
            val actions = sbn.notification.actions ?: return false
            for (action in actions) {
                val remoteInputs = action.remoteInputs ?: continue
                if (remoteInputs.isEmpty()) continue
                val resultData = Intent()
                val bundle = Bundle().apply {
                    putCharSequence(remoteInputs[0].resultKey, text)
                }
                android.app.RemoteInput.addResultsToIntent(remoteInputs, resultData, bundle)
                action.actionIntent.send(applicationContext, 0, resultData)
                return true
            }
            false
        } catch (e: Exception) {
            Log.w(TAG, "replyTo failed for key=$key", e)
            false
        }
    }

    fun dismiss(key: String) {
        try {
            cancelNotification(key)
            recentNotifications.removeAll { it.key == key }
        } catch (e: Exception) {
            Log.w(TAG, "dismiss failed for key=$key", e)
        }
    }

    private fun StatusBarNotification.toData(): NotificationData? {
        return try {
            val extras = notification.extras
            val actions = notification.actions
            NotificationData(
                key = key,
                app = packageName,
                packageName = packageName,
                sender = extras.getCharSequence(Notification.EXTRA_TITLE, "")?.toString() ?: "",
                text = extras.getCharSequence(Notification.EXTRA_TEXT, "")?.toString() ?: "",
                timestamp = postTime,
                hasReply = actions?.any { it.remoteInputs?.isNotEmpty() == true } ?: false,
            )
        } catch (e: Exception) {
            Log.w(TAG, "toData failed for key=$key", e)
            null
        }
    }
}
