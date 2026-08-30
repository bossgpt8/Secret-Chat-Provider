package com.boss.assistant

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

class VoxDownloadModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val handler = Handler(Looper.getMainLooper())
    private val activePolls = HashMap<Long, Runnable>()

    // BroadcastReceiver for download completion
    private val completionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) ?: return
            if (id == -1L) return
            pollFinalStatus(id)
        }
    }

    init {
        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(completionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            reactContext.registerReceiver(completionReceiver, filter)
        }
    }

    override fun getName() = "VoxDownloadModule"

    override fun onCatalystInstanceDestroy() {
        try { reactApplicationContext.unregisterReceiver(completionReceiver) } catch (_: Exception) {}
        activePolls.values.forEach { handler.removeCallbacks(it) }
        activePolls.clear()
        super.onCatalystInstanceDestroy()
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun modelsDir(): File {
        val dir = File(reactApplicationContext.getExternalFilesDir(null), "VoxModels")
        dir.mkdirs()
        return dir
    }

    private fun dm(): DownloadManager =
        reactApplicationContext.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

    private fun emit(event: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, params)
    }

    // ── Public API ────────────────────────────────────────────────────────────

    @ReactMethod
    fun startDownload(url: String, fileName: String, title: String, promise: Promise) {
        try {
            val dest = File(modelsDir(), fileName)
            // If already downloaded, resolve immediately
            if (dest.exists() && dest.length() > 0) {
                val m = Arguments.createMap()
                m.putDouble("downloadId", -1.0)
                m.putBoolean("alreadyExists", true)
                m.putString("path", dest.absolutePath)
                promise.resolve(m)
                return
            }

            // Reuse an interrupted/pending DownloadManager job instead of
            // enqueueing a second request to the same destination.
            val existingId = findActiveDownloadId(fileName)
            if (existingId != null) {
                startProgressPoll(existingId, fileName)
                val m = Arguments.createMap()
                m.putDouble("downloadId", existingId.toDouble())
                m.putBoolean("alreadyExists", false)
                promise.resolve(m)
                return
            }

            val request = DownloadManager.Request(Uri.parse(url)).apply {
                setTitle(title)
                setDescription("Downloading Vox offline model…")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                setDestinationUri(Uri.fromFile(dest))
                setAllowedOverMetered(true)
                setAllowedOverRoaming(false)
            }

            val downloadId = dm().enqueue(request)
            startProgressPoll(downloadId, fileName)

            val m = Arguments.createMap()
            m.putDouble("downloadId", downloadId.toDouble())
            m.putBoolean("alreadyExists", false)
            promise.resolve(m)
        } catch (e: Exception) {
            promise.reject("ERR_DOWNLOAD_START", e.message)
        }
    }

    @ReactMethod
    fun cancelDownload(downloadId: Double, promise: Promise) {
        try {
            val id = downloadId.toLong()
            dm().remove(id)
            stopProgressPoll(id)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_DOWNLOAD_CANCEL", e.message)
        }
    }

    @ReactMethod
    fun getDownloadStatus(downloadId: Double, promise: Promise) {
        try {
            val status = queryStatus(downloadId.toLong())
            promise.resolve(status)
        } catch (e: Exception) {
            promise.reject("ERR_DOWNLOAD_STATUS", e.message)
        }
    }

    @ReactMethod
    fun isModelDownloaded(fileName: String, promise: Promise) {
        val file = File(modelsDir(), fileName)
        promise.resolve(file.exists() && file.length() > 0)
    }

    @ReactMethod
    fun getModelPath(fileName: String, promise: Promise) {
        val file = File(modelsDir(), fileName)
        if (file.exists() && file.length() > 0) {
            promise.resolve(file.absolutePath)
        } else {
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun getModelSize(fileName: String, promise: Promise) {
        val file = File(modelsDir(), fileName)
        promise.resolve(if (file.exists()) file.length().toDouble() else 0.0)
    }

    @ReactMethod
    fun deleteModel(fileName: String, promise: Promise) {
        try {
            val file = File(modelsDir(), fileName)
            if (file.exists()) file.delete()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_DELETE_MODEL", e.message)
        }
    }

    @ReactMethod
    fun listDownloadedModels(promise: Promise) {
        val dir = modelsDir()
        val files = dir.listFiles() ?: emptyArray()
        val arr = Arguments.createArray()
        for (f in files) {
            val m = Arguments.createMap()
            m.putString("fileName", f.name)
            m.putString("path", f.absolutePath)
            m.putDouble("sizeBytes", f.length().toDouble())
            arr.pushMap(m)
        }
        promise.resolve(arr)
    }

    // ── Progress polling ──────────────────────────────────────────────────────

    private fun startProgressPoll(downloadId: Long, fileName: String) {
        val runnable = object : Runnable {
            override fun run() {
                val status = queryStatus(downloadId)
                val dlStatus = status.getInt("status")

                val progress = Arguments.createMap()
                progress.putDouble("downloadId", downloadId.toDouble())
                progress.putString("fileName", fileName)
                progress.putDouble("downloadedBytes", status.getDouble("downloadedBytes"))
                progress.putDouble("totalBytes", status.getDouble("totalBytes"))
                progress.putDouble("progress", status.getDouble("progress"))
                progress.putInt("status", dlStatus)
                emit("onVoxDownloadProgress", progress)

                when (dlStatus) {
                    DownloadManager.STATUS_SUCCESSFUL, DownloadManager.STATUS_FAILED -> {
                        stopProgressPoll(downloadId)
                        // onVoxDownloadComplete emitted by pollFinalStatus via receiver
                    }
                    else -> handler.postDelayed(this, 500)
                }
            }
        }
        activePolls[downloadId] = runnable
        handler.postDelayed(runnable, 500)
    }

    private fun stopProgressPoll(downloadId: Long) {
        activePolls.remove(downloadId)?.let { handler.removeCallbacks(it) }
    }

    private fun findActiveDownloadId(fileName: String): Long? {
        val cursor = try { dm().query(DownloadManager.Query()) } catch (_: Exception) { null } ?: return null
        cursor.use {
            val idIndex = it.getColumnIndex(DownloadManager.COLUMN_ID)
            val uriIndex = it.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI)
            val statusIndex = it.getColumnIndex(DownloadManager.COLUMN_STATUS)
            if (idIndex < 0 || uriIndex < 0 || statusIndex < 0) return null
            while (it.moveToNext()) {
                val localUri = it.getString(uriIndex) ?: continue
                val status = it.getInt(statusIndex)
                val active = status == DownloadManager.STATUS_PENDING ||
                    status == DownloadManager.STATUS_RUNNING ||
                    status == DownloadManager.STATUS_PAUSED
                if (active && localUri.endsWith("/$fileName")) return it.getLong(idIndex)
            }
        }
        return null
    }

    private fun pollFinalStatus(downloadId: Long) {
        val status = queryStatus(downloadId)
        val dlStatus = status.getInt("status")
        val complete = Arguments.createMap()
        complete.putDouble("downloadId", downloadId.toDouble())
        complete.putString("path", status.getString("localUri") ?: "")
        complete.putBoolean("success", dlStatus == DownloadManager.STATUS_SUCCESSFUL)
        complete.putInt("reason", status.getInt("reason"))
        emit("onVoxDownloadComplete", complete)
        stopProgressPoll(downloadId)
    }

    private fun queryStatus(downloadId: Long): WritableMap {
        val q = DownloadManager.Query().setFilterById(downloadId)
        val cursor: Cursor? = try { dm().query(q) } catch (_: Exception) { null }
        val m = Arguments.createMap()
        if (cursor == null || !cursor.moveToFirst()) {
            m.putInt("status", DownloadManager.STATUS_FAILED)
            m.putDouble("progress", 0.0)
            m.putDouble("downloadedBytes", 0.0)
            m.putDouble("totalBytes", 0.0)
            m.putInt("reason", -1)
            cursor?.close()
            return m
        }
        val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
        val downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
        val total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
        val reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
        val localUri = cursor.getString(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI))
        cursor.close()

        val progress = if (total > 0) downloaded.toDouble() / total.toDouble() else 0.0
        m.putInt("status", status)
        m.putDouble("downloadedBytes", downloaded.toDouble())
        m.putDouble("totalBytes", total.toDouble())
        m.putDouble("progress", progress)
        m.putInt("reason", reason)
        m.putString("localUri", localUri)
        return m
    }

    // Required for RCTEventEmitter
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
