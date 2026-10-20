package com.boss.assistant

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

class ZenoDeviceAdmin : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {}
    override fun onDisabled(context: Context, intent: Intent) {}
}
