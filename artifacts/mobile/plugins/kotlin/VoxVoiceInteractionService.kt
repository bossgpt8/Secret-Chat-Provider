package com.boss.assistant

import android.content.Intent
import android.os.Bundle
import android.service.voice.VoiceInteractionService
import android.util.Log

/**
 * Registers Vox as a recognised Android digital assistant.
 * Once the user sets Vox as the default assistant in
 * Settings → Apps → Default apps → Digital assistant app,
 * long-pressing the home button (or the side button on Pixel)
 * will launch the app directly into listening mode.
 */
class VoxVoiceInteractionService : VoiceInteractionService() {

    companion object {
        private const val TAG = "VoxVoiceInteraction"
    }

    override fun onReady() {
        super.onReady()
        Log.i(TAG, "VoiceInteractionService ready")
    }

    /** Called when the assistant gesture / button is triggered. */
    override fun onLaunchVoiceAssist(state: Bundle?) {
        Log.i(TAG, "onLaunchVoiceAssist – launching MainActivity")
        val intent = Intent(this, Class.forName("com.boss.assistant.MainActivity")).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra("LAUNCH_FROM_ASSISTANT", true)
        }
        startActivity(intent)
    }

    override fun onGetSupportedVoiceActions(voiceActions: Set<String>): Set<String> {
        // Accept all voice actions so the system routes them to us
        return voiceActions
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "VoiceInteractionService destroyed")
    }
}
