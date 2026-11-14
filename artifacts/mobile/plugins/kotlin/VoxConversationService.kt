package com.boss.assistant

import android.app.*
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat

/** Explicit call lifetime only; never auto-starts at boot or after force-stop. */
class VoxConversationService : Service() {
    companion object {
        @Volatile var active = false
        @Volatile var readiness: ((String?) -> Unit)? = null
        @Volatile var stopAudio: (() -> Unit)? = null
        const val STOP = "com.boss.assistant.CONVERSATION_STOP"
    }
    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("vox_call", "Vox voice conversation", NotificationManager.IMPORTANCE_LOW))
        val end = PendingIntent.getService(this, 0, Intent(this, VoxConversationService::class.java).setAction(STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 1, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        try {
          startForeground(8803, NotificationCompat.Builder(this, "vox_call")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("Vox call is active")
            .setContentText("Microphone may be active. Tap End call to stop.")
            .setOngoing(true).setContentIntent(open).addAction(0, "End call", end).build())
          active = true
          readiness?.invoke(null)
        } catch (error: Exception) {
          active = false
          readiness?.invoke(error.message ?: "Android blocked background microphone access.")
          stopSelf()
        } finally { readiness = null }
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) {
            stopAudio?.invoke()
            VoxOverlayService.onEvent?.invoke("onVoxOverlayAction", "end")
            stopSelf()
        }
        return START_NOT_STICKY
    }
    override fun onDestroy() { active = false; super.onDestroy() }
    override fun onBind(intent: Intent?): IBinder? = null
}
