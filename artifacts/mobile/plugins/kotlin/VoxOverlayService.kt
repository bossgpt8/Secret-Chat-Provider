package com.boss.assistant

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.DisplayMetrics
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import androidx.core.app.NotificationCompat

/**
 * VoxOverlayService
 *
 * A foreground service that draws a persistent floating bubble via WindowManager
 * (TYPE_APPLICATION_OVERLAY). The bubble stays on screen even when the Vox app is
 * backgrounded. It runs a SpeechRecognizer loop in the background to detect the
 * wake word "Hey Vox" / "Vox" without requiring the app to be open.
 *
 * When the wake word is detected the service:
 *  1. Captures the rest of the spoken command.
 *  2. Fires an event to the React Native bridge (VoxOverlayModule) so JS can
 *     handle the AI response + TTS without bringing the app to foreground.
 *  3. If the bridge is unavailable the bubble tap brings MainActivity to front.
 */
class VoxOverlayService : Service() {

    // ── Constants ─────────────────────────────────────────────────────────────
    companion object {
        const val TAG = "VoxOverlayService"
        const val CHANNEL_ID = "vox_overlay"
        const val NOTIF_ID = 8801

        const val ACTION_STOP  = "com.boss.assistant.OVERLAY_STOP"
        const val ACTION_STATE = "com.boss.assistant.OVERLAY_STATE"
        const val EXTRA_STATE  = "state"

        const val STATE_IDLE       = "idle"
        const val STATE_WAKE       = "wake"       // heard wake word, listening for command
        const val STATE_LISTENING  = "listening"  // JS-initiated full listen
        const val STATE_PROCESSING = "processing"
        const val STATE_SPEAKING   = "speaking"

        /** Called by VoxOverlayModule to forward native events to JS. */
        @Volatile var onEvent: ((event: String, payload: String) -> Unit)? = null

        @Volatile var instance: VoxOverlayService? = null

        private val WAKE_WORDS = listOf("hey vox", "ok vox", "hi vox", " vox")
    }

    // ── State ─────────────────────────────────────────────────────────────────
    private var state = STATE_IDLE
        set(v) { field = v; mainHandler.post { updateBubbleColor() } }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var windowManager: WindowManager? = null
    private var bubbleView: BubbleView? = null
    private var layoutParams: WindowManager.LayoutParams? = null

    private var speechRecognizer: SpeechRecognizer? = null
    private var isRecognizing  = false
    private var expectingCmd   = false  // true right after wake word detected
    private var restartPending = false

    // Screen dimensions in px
    private var screenW = 1080
    private var screenH = 1920
    private val bubblePx get() = dpToPx(58)

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    override fun onCreate() {
        super.onCreate()
        instance = this
        resolveScreenSize()
        createNotificationChannel()
        startForeground(NOTIF_ID, buildNotification())
        addBubble()
        mainHandler.postDelayed({ startRecognitionLoop() }, 800)
        Log.i(TAG, "Service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP  -> stopSelf()
            ACTION_STATE -> {
                val s = intent.getStringExtra(EXTRA_STATE) ?: return START_STICKY
                state = s
                if (s == STATE_LISTENING) {
                    // JS triggered listening — stop bg loop and wait for JS to finish
                    stopRecognitionLoop()
                } else if (s == STATE_IDLE) {
                    // JS finished — resume background wake-word loop
                    scheduleRestart(1200)
                }
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        stopRecognitionLoop()
        removeBubble()
        Log.i(TAG, "Service destroyed")
    }

    // ── Notification ─────────────────────────────────────────────────────────
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID,
                "Vox Assistant",
                NotificationManager.IMPORTANCE_LOW
            ).apply { setShowBadge(false) }
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    private fun buildNotification(): Notification {
        val stopIntent = Intent(this, VoxOverlayService::class.java).apply { action = ACTION_STOP }
        val stopPi = PendingIntent.getService(
            this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val openIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val openPi = openIntent?.let {
            PendingIntent.getActivity(this, 1, it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Vox is listening")
            .setContentText("Say \"Hey Vox\" to activate")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(openPi)
            .addAction(android.R.drawable.ic_delete, "Stop", stopPi)
            .build()
    }

    // ── WindowManager bubble ──────────────────────────────────────────────────
    private fun addBubble() {
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        bubbleView = BubbleView(this)

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        layoutParams = WindowManager.LayoutParams(
            bubblePx, bubblePx, type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = screenW - bubblePx - dpToPx(14)
            y = (screenH * 0.55).toInt()
        }

        bubbleView!!.setOnTouchListener(bubbleTouchListener())
        try {
            windowManager!!.addView(bubbleView, layoutParams)
        } catch (e: Exception) {
            Log.e(TAG, "addView failed", e)
        }
    }

    private fun removeBubble() {
        try {
            if (bubbleView != null && bubbleView!!.isAttachedToWindow)
                windowManager?.removeView(bubbleView)
        } catch (_: Exception) {}
        bubbleView = null
    }

    private fun updateBubbleColor() {
        bubbleView?.setState(state)
    }

    /** Drag-to-snap + tap handler for the WindowManager bubble. */
    private fun bubbleTouchListener(): View.OnTouchListener {
        var downRawX = 0f; var downRawY = 0f
        var startX = 0; var startY = 0
        var isDrag = false

        return View.OnTouchListener { _, event ->
            val lp = layoutParams ?: return@OnTouchListener false
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    downRawX = event.rawX; downRawY = event.rawY
                    startX = lp.x; startY = lp.y
                    isDrag = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - downRawX
                    val dy = event.rawY - downRawY
                    if (!isDrag && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) isDrag = true
                    if (isDrag) {
                        lp.x = (startX + dx).toInt()
                        lp.y = (startY + dy).toInt()
                        try { windowManager?.updateViewLayout(bubbleView, lp) } catch (_: Exception) {}
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (isDrag) {
                        // Snap to nearest vertical edge
                        val midX = lp.x + bubblePx / 2
                        lp.x = if (midX < screenW / 2) dpToPx(14)
                                else screenW - bubblePx - dpToPx(14)
                        lp.y = lp.y.coerceIn(dpToPx(80), screenH - bubblePx - dpToPx(80))
                        try { windowManager?.updateViewLayout(bubbleView, lp) } catch (_: Exception) {}
                    } else {
                        // Tap → always bring the app to foreground first so the JS
                        // navigation call has an active Activity to work with.
                        bringAppToFront()
                        // Then notify JS so it can start listening / handle the tap.
                        try { onEvent?.invoke("onVoxOverlayTap", "") } catch (_: Exception) {}
                    }
                    true
                }
                else -> false
            }
        }
    }

    private fun bringAppToFront() {
        val intent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra("LAUNCH_FROM_OVERLAY", true)
        } ?: return
        startActivity(intent)
    }

    // ── Speech recognition loop ───────────────────────────────────────────────
    private fun startRecognitionLoop() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            Log.w(TAG, "SpeechRecognizer not available on this device")
            return
        }
        mainHandler.post { startOneShotRecognition() }
    }

    private fun stopRecognitionLoop() {
        restartPending = false
        mainHandler.removeCallbacksAndMessages(null)
        mainHandler.post {
            try { speechRecognizer?.cancel() } catch (_: Exception) {}
            try { speechRecognizer?.destroy() } catch (_: Exception) {}
            speechRecognizer = null
            isRecognizing = false
        }
    }

    private fun scheduleRestart(delayMs: Long = 600) {
        if (restartPending) return
        restartPending = true
        mainHandler.postDelayed({
            restartPending = false
            if (state == STATE_IDLE || state == STATE_WAKE) {
                startOneShotRecognition()
            }
        }, delayMs)
    }

    private fun startOneShotRecognition() {
        if (isRecognizing) return
        try {
            if (speechRecognizer == null)
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)

            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 500L)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS,
                    if (expectingCmd) 2000L else 4000L)
            }
            speechRecognizer!!.setRecognitionListener(recognitionListener)
            speechRecognizer!!.startListening(intent)
            isRecognizing = true
        } catch (e: Exception) {
            Log.e(TAG, "startListening error", e)
            isRecognizing = false
            scheduleRestart(2000)
        }
    }

    private val recognitionListener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEvent(eventType: Int, params: Bundle?) {}

        override fun onPartialResults(partialResults: Bundle?) {
            val partial = partialResults
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull()?.lowercase() ?: return

            if (!expectingCmd) {
                val found = WAKE_WORDS.find { partial.contains(it) }
                if (found != null) {
                    Log.i(TAG, "Wake word detected in partial: $partial")
                    // Stop current session and start command session
                    try { speechRecognizer?.cancel() } catch (_: Exception) {}
                    isRecognizing = false
                    expectingCmd = true
                    state = STATE_WAKE
                    onEvent?.invoke("onVoxWakeWord", "")
                    mainHandler.postDelayed({ startOneShotRecognition() }, 200)
                }
            }
        }

        override fun onResults(results: Bundle?) {
            isRecognizing = false
            val text = results
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull()?.trim() ?: ""

            Log.i(TAG, "onResults: \"$text\" expectingCmd=$expectingCmd")

            if (expectingCmd && text.isNotBlank()) {
                expectingCmd = false
                // Strip wake word prefix if present
                val cmd = WAKE_WORDS.fold(text.lowercase()) { acc, w -> acc.removePrefix(w).trim() }
                    .ifBlank { text }
                state = STATE_PROCESSING
                onEvent?.invoke("onVoxCommand", cmd)
                // JS will call setState("idle") when done; fall back after 30 s
                mainHandler.postDelayed({
                    if (state == STATE_PROCESSING) {
                        state = STATE_IDLE
                        scheduleRestart()
                    }
                }, 30_000)
            } else {
                expectingCmd = false
                if (state == STATE_IDLE || state == STATE_WAKE) scheduleRestart()
            }
        }

        override fun onError(error: Int) {
            isRecognizing = false
            expectingCmd = false
            Log.w(TAG, "SpeechRecognizer error: $error")
            // Errors 5 (client) and 6 (insufficient permissions) don't get retried endlessly
            val delay = when (error) {
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> 1500L
                SpeechRecognizer.ERROR_NO_MATCH,
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT  -> 300L
                else                                   -> 800L
            }
            if (state == STATE_IDLE || state == STATE_WAKE) scheduleRestart(delay)
        }

        override fun onEndOfSpeech() {}
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private fun dpToPx(dp: Int): Int {
        val dm = resources.displayMetrics
        return (dp * dm.density).toInt()
    }

    private fun resolveScreenSize() {
        val wm = getSystemService(WINDOW_SERVICE) as WindowManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val bounds = wm.currentWindowMetrics.bounds
            screenW = bounds.width(); screenH = bounds.height()
        } else {
            val dm = DisplayMetrics()
            @Suppress("DEPRECATION") wm.defaultDisplay.getRealMetrics(dm)
            screenW = dm.widthPixels; screenH = dm.heightPixels
        }
    }

    // ── Custom bubble View ────────────────────────────────────────────────────
    inner class BubbleView(context: android.content.Context) : View(context) {
        private val clipPaint   = Paint(Paint.ANTI_ALIAS_FLAG)
        private val ringPaint   = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
        private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        private var currentState = STATE_IDLE

        // The Vox logo bitmap (vox_bubble.png bundled in res/drawable)
        private var logoBitmap: android.graphics.Bitmap? = null
        private var bitmapShader: android.graphics.BitmapShader? = null

        // Pulse animation
        private var pulseScale = 1f
        private var pulseUp    = true
        private val pulseRunnable = object : Runnable {
            override fun run() {
                val active = currentState != STATE_IDLE
                if (active) {
                    pulseScale = if (pulseUp) (pulseScale + 0.02f).coerceAtMost(1.14f)
                                 else         (pulseScale - 0.02f).coerceAtLeast(0.88f)
                    if (pulseScale >= 1.14f) pulseUp = false
                    if (pulseScale <= 0.88f) pulseUp = true
                    invalidate()
                    mainHandler.postDelayed(this, 30)
                } else {
                    pulseScale = 1f
                    invalidate()
                }
            }
        }

        init { loadBitmap() }

        private fun loadBitmap() {
            try {
                val pkg  = context.packageName
                val resId = context.resources.getIdentifier("vox_bubble", "drawable", pkg)
                if (resId != 0) {
                    logoBitmap = android.graphics.BitmapFactory.decodeResource(context.resources, resId)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Could not load vox_bubble drawable: ${e.message}")
            }
        }

        private fun rebuildShader(w: Int, h: Int) {
            val bmp = logoBitmap ?: return
            // Scale bitmap to fill the view
            val scaled = android.graphics.Bitmap.createScaledBitmap(bmp, w, h, true)
            bitmapShader = android.graphics.BitmapShader(
                scaled,
                android.graphics.Shader.TileMode.CLAMP,
                android.graphics.Shader.TileMode.CLAMP
            )
            clipPaint.shader = bitmapShader
        }

        override fun onSizeChanged(w: Int, h: Int, oldW: Int, oldH: Int) {
            super.onSizeChanged(w, h, oldW, oldH)
            if (w > 0 && h > 0) rebuildShader(w, h)
        }

        fun setState(s: String) {
            currentState = s
            mainHandler.removeCallbacks(pulseRunnable)
            if (s != STATE_IDLE) mainHandler.post(pulseRunnable) else invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            val cx = width  / 2f
            val cy = height / 2f
            val base = (width / 2f - dpToPx(3)).coerceAtLeast(8f)
            val r    = base * pulseScale

            // Drop shadow
            shadowPaint.color = Color.argb(70, 0, 0, 0)
            canvas.drawCircle(cx, cy + dpToPx(3), r, shadowPaint)

            if (clipPaint.shader != null) {
                // Save + scale around center for pulse, then clip-draw the logo bitmap
                canvas.save()
                canvas.scale(pulseScale, pulseScale, cx, cy)
                canvas.drawCircle(cx, cy, base, clipPaint)
                canvas.restore()
            } else {
                // Fallback: plain purple circle with "Vox" text if bitmap didn't load
                val fallback = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.parseColor("#7C3AED")
                }
                canvas.drawCircle(cx, cy, r, fallback)
                val tp = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.WHITE
                    textAlign = Paint.Align.CENTER
                    textSize  = dpToPx(18).toFloat()
                    isFakeBoldText = true
                }
                val fm = tp.fontMetrics
                canvas.drawText("Vox", cx, cy - (fm.ascent + fm.descent) / 2f, tp)
            }

            // Colored state ring (drawn outside so it doesn't obscure the logo)
            if (currentState != STATE_IDLE) {
                val ringColor = when (currentState) {
                    STATE_WAKE, STATE_LISTENING -> Color.parseColor("#EF4444")
                    STATE_SPEAKING             -> Color.parseColor("#06B6D4")
                    STATE_PROCESSING           -> Color.parseColor("#F97316")
                    else                       -> Color.parseColor("#7C3AED")
                }
                ringPaint.color = ringColor
                ringPaint.strokeWidth = dpToPx(3).toFloat()
                ringPaint.alpha = 220
                canvas.drawCircle(cx, cy, r + dpToPx(2), ringPaint)
            }
        }
    }
}
