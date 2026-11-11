package com.boss.assistant

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/** Explicitly enabled microphone FGS; no boot receiver or hidden auto-restart. */
class VoxWakeService : Service() {
    companion object {
        const val PREFS = "vox-wake"
        const val STOP = "com.boss.assistant.WAKE_STOP"
        const val RESUME = "com.boss.assistant.WAKE_RESUME"
        private const val CHANNEL = "vox_wake_native"
        private const val NOTIFICATION = 8802
        @Volatile var instance: VoxWakeService? = null
        var onStatus: (() -> Unit)? = null
        var onWake: (() -> Boolean)? = null
    }
    private val main = Handler(Looper.getMainLooper())
    private val reasons = mutableSetOf<String>()
    private lateinit var engine: VoxWakeEngine
    private var listeningRequested = false
    private var destroyed = false
    private var assistantName = "Vox"
    private var wakeLock: PowerManager.WakeLock? = null
    var state = "starting"; private set
    var message = "Preparing the on-device wake model…"; private set
    private val handoffTimeout = Runnable {
        if (!destroyed && reasons.remove("handoff")) reconcile()
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        assistantName = getSharedPreferences(PREFS, MODE_PRIVATE).getString("name", "Vox") ?: "Vox"
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) manager?.createNotificationChannel(
            NotificationChannel(CHANNEL, "Hey Vox listener", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) })
        engine = VoxWakeEngine(this,
            onReady = { update("listening", "Say “Hey $assistantName”, wait for the vibration, then speak.") },
            onWake = {
                listeningRequested = false
                releaseWakeLock()
                reasons.add("handoff")
                update("paused", "Heard Hey $assistantName. Starting current voice mode…")
                val vibrator = getSystemService(VIBRATOR_SERVICE) as Vibrator
                if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createOneShot(70, VibrationEffect.DEFAULT_AMPLITUDE))
                else @Suppress("DEPRECATION") vibrator.vibrate(70)
                val delivered = onWake?.invoke() == true
                if (!delivered) update("paused", "Heard Hey $assistantName. Open Vox from this notification to respond.")
                main.postDelayed(handoffTimeout, 15000)
            },
            onError = { error ->
                listeningRequested = false
                releaseWakeLock()
                reasons.add("error")
                update("error", error)
            })
        reasons.addAll(VoxWakeModule.pauseRequests)
        try {
            startForeground(NOTIFICATION, notification())
        } catch (_: Exception) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("enabled", false).apply()
            state = "error"
            message = "Android blocked background microphone access. Enable Hey Vox while Vox is open."
            onStatus?.invoke()
            stopSelf()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == STOP) {
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("enabled", false).apply()
            stopSelf()
            return START_NOT_STICKY
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            update("error", "Microphone permission is missing. Open Vox Settings to grant access.")
            stopSelf()
            return START_NOT_STICKY
        }
        if (intent?.action == RESUME) {
            reasons.remove("error")
            reasons.remove("handoff")
            main.removeCallbacks(handoffTimeout)
        }
        if (getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("enabled", false)) {
            if (reasons.isNotEmpty()) update("paused", "Wake detection paused while Vox uses audio.")
            reconcile()
        }
        else stopSelf()
        return START_NOT_STICKY
    }

    /** Completion acknowledges that the detector has actually released the mic. */
    fun rename(name: String) {
        if (name == assistantName) return
        assistantName = name
        listeningRequested = false
        engine.pause {
            if (!destroyed) {
                reasons.remove("error")
                reconcile()
            }
        }
    }

    fun setPaused(reason: String, paused: Boolean, completion: () -> Unit = {}) {
        if (paused) reasons.add(reason) else reasons.remove(reason)
        if (reason == "voice" && paused) {
            reasons.remove("handoff")
            main.removeCallbacks(handoffTimeout)
        }
        if (reasons.isNotEmpty()) {
            listeningRequested = false
            engine.pause {
                // A newer resume may already be queued; don't publish stale paused status.
                if (!listeningRequested) releaseWakeLock()
                if (!destroyed && !listeningRequested && state != "error") update("paused", "Wake detection paused while Vox uses audio.")
                completion()
            }
        } else {
            reconcile()
            completion()
        }
    }

    private fun reconcile() {
        if (destroyed || reasons.isNotEmpty() || listeningRequested) return
        listeningRequested = true
        val power = getSystemService(POWER_SERVICE) as PowerManager
        if (wakeLock == null) wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Vox:WakeListener")
        wakeLock?.acquire()
        update("starting", "Preparing the on-device wake model…")
        engine.start(assistantName)
    }

    private fun releaseWakeLock() {
        if (wakeLock?.isHeld == true) wakeLock?.release()
    }

    private fun notification() = NotificationCompat.Builder(this, CHANNEL)
        .setSmallIcon(android.R.drawable.ic_btn_speak_now)
        .setContentTitle(if (state == "listening") "Hey $assistantName is listening locally" else "Wake word · $state")
        .setContentText(message)
        .setStyle(NotificationCompat.BigTextStyle().bigText(message))
        .setOngoing(true).setSilent(true)
        .setContentIntent(packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        })
        .addAction(0, "Resume", PendingIntent.getService(this, 1,
            Intent(this, VoxWakeService::class.java).setAction(RESUME),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        .addAction(0, "Stop", PendingIntent.getService(this, 2,
            Intent(this, VoxWakeService::class.java).setAction(STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        .build()

    private fun update(next: String, detail: String) {
        if (destroyed) return
        state = next
        message = detail
        getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION, notification())
        onStatus?.invoke()
    }

    override fun onBind(intent: Intent?): IBinder? = null
    override fun onDestroy() {
        destroyed = true
        main.removeCallbacksAndMessages(null)
        engine.close()
        releaseWakeLock()
        instance = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        onStatus?.invoke()
        super.onDestroy()
    }
}
