package com.boss.assistant

import android.content.Context
import android.media.AudioManager
import android.view.KeyEvent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class MediaControlModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "MediaControlModule"

    private fun dispatchKey(keyCode: Int) {
        val am = reactApplicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val down = KeyEvent(KeyEvent.ACTION_DOWN, keyCode)
        val up   = KeyEvent(KeyEvent.ACTION_UP,   keyCode)
        am.dispatchMediaKeyEvent(down)
        am.dispatchMediaKeyEvent(up)
    }

    @ReactMethod
    fun play(promise: Promise) {
        try { dispatchKey(KeyEvent.KEYCODE_MEDIA_PLAY); promise.resolve(true) }
        catch (e: Exception) { promise.reject("ERR_MEDIA", e.message) }
    }

    @ReactMethod
    fun pause(promise: Promise) {
        try { dispatchKey(KeyEvent.KEYCODE_MEDIA_PAUSE); promise.resolve(true) }
        catch (e: Exception) { promise.reject("ERR_MEDIA", e.message) }
    }

    @ReactMethod
    fun playPause(promise: Promise) {
        try { dispatchKey(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE); promise.resolve(true) }
        catch (e: Exception) { promise.reject("ERR_MEDIA", e.message) }
    }

    @ReactMethod
    fun next(promise: Promise) {
        try { dispatchKey(KeyEvent.KEYCODE_MEDIA_NEXT); promise.resolve(true) }
        catch (e: Exception) { promise.reject("ERR_MEDIA", e.message) }
    }

    @ReactMethod
    fun previous(promise: Promise) {
        try { dispatchKey(KeyEvent.KEYCODE_MEDIA_PREVIOUS); promise.resolve(true) }
        catch (e: Exception) { promise.reject("ERR_MEDIA", e.message) }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try { dispatchKey(KeyEvent.KEYCODE_MEDIA_STOP); promise.resolve(true) }
        catch (e: Exception) { promise.reject("ERR_MEDIA", e.message) }
    }
}
