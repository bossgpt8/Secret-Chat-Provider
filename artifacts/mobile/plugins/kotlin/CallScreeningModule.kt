package com.boss.assistant

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telecom.TelecomManager
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class CallScreeningModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "CallScreeningModule"
        private const val EVENT = "onCallStateChanged"
    }

    private var telephonyManager: TelephonyManager? = null
    private var listenerRegistered = false

    // ── API 31+ (Android 12) callback ────────────────────────────────────────
    private var telephonyCallback: Any? = null   // TelephonyCallback (API 31+)

    // ── Legacy listener (API < 31) ────────────────────────────────────────────
    @Suppress("DEPRECATION")
    private val legacyListener = object : PhoneStateListener() {
        @Deprecated("Deprecated in API 31")
        override fun onCallStateChanged(state: Int, phoneNumber: String?) {
            emitState(state, phoneNumber)
        }
    }

    override fun getName(): String = "CallScreeningModule"

    private fun sendEvent(params: com.facebook.react.bridge.WritableMap) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(EVENT, params)
        } catch (_: Exception) {}
    }

    private fun emitState(state: Int, number: String?) {
        val stateStr = when (state) {
            TelephonyManager.CALL_STATE_RINGING -> "ringing"
            TelephonyManager.CALL_STATE_OFFHOOK -> "offhook"
            TelephonyManager.CALL_STATE_IDLE    -> "idle"
            else -> "unknown"
        }
        val map = Arguments.createMap().apply {
            putString("state", stateStr)
            putString("number", number ?: "")
        }
        sendEvent(map)
    }

    @ReactMethod
    fun startListening(promise: Promise) {
        if (listenerRegistered) { promise.resolve(true); return }
        val hasPerm = ContextCompat.checkSelfPermission(
            reactContext, Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED
        if (!hasPerm) { promise.reject("ERR_PERMISSION", "READ_PHONE_STATE not granted"); return }

        try {
            val tm = reactContext.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            telephonyManager = tm

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                    override fun onCallStateChanged(state: Int) {
                        emitState(state, null)
                    }
                }
                telephonyCallback = cb
                tm.registerTelephonyCallback(
                    reactContext.mainExecutor,
                    cb
                )
            } else {
                @Suppress("DEPRECATION")
                tm.listen(legacyListener, PhoneStateListener.LISTEN_CALL_STATE)
            }
            listenerRegistered = true
            promise.resolve(true)
        } catch (e: Exception) {
            Log.w(TAG, "startListening failed", e)
            promise.reject("ERR_LISTEN", e.message)
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        try {
            val tm = telephonyManager ?: run { promise.resolve(true); return }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (telephonyCallback as? TelephonyCallback)?.let { tm.unregisterTelephonyCallback(it) }
            } else {
                @Suppress("DEPRECATION")
                tm.listen(legacyListener, PhoneStateListener.LISTEN_NONE)
            }
            listenerRegistered = false
            telephonyManager = null
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_STOP", e.message)
        }
    }

    @ReactMethod
    fun answerCall(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            promise.reject("ERR_VERSION", "answerCall requires Android 8+")
            return
        }
        val hasPerm = ContextCompat.checkSelfPermission(
            reactContext, Manifest.permission.ANSWER_PHONE_CALLS
        ) == PackageManager.PERMISSION_GRANTED
        if (!hasPerm) { promise.reject("ERR_PERMISSION", "ANSWER_PHONE_CALLS not granted"); return }
        try {
            val telecom = reactContext.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            telecom.acceptRingingCall()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_ANSWER", e.message)
        }
    }

    @ReactMethod
    fun declineCall(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            promise.reject("ERR_VERSION", "declineCall requires Android 9+")
            return
        }
        val hasPerm = ContextCompat.checkSelfPermission(
            reactContext, Manifest.permission.ANSWER_PHONE_CALLS
        ) == PackageManager.PERMISSION_GRANTED
        if (!hasPerm) { promise.reject("ERR_PERMISSION", "ANSWER_PHONE_CALLS not granted"); return }
        try {
            val telecom = reactContext.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            telecom.endCall()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_DECLINE", e.message)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
