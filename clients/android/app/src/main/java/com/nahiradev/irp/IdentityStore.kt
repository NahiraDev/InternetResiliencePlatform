package com.nahiradev.irp

import android.content.Context

interface IdentityStore {
    fun readDeviceId(): String?
    fun readDeviceName(): String?
    fun write(deviceId: String, deviceName: String)
    fun remove()
}

class InMemoryIdentityStore : IdentityStore {
    private var deviceId: String? = null
    private var deviceName: String? = null

    override fun readDeviceId() = deviceId
    override fun readDeviceName() = deviceName
    override fun write(deviceId: String, deviceName: String) {
        this.deviceId = deviceId
        this.deviceName = deviceName
    }
    override fun remove() {
        deviceId = null
        deviceName = null
    }
}

class AndroidIdentityStore(context: Context) : IdentityStore {
    private val preferences = context.getSharedPreferences("irp_identity", Context.MODE_PRIVATE)

    override fun readDeviceId(): String? = preferences.getString(KEY_DEVICE_ID, null)
    override fun readDeviceName(): String? = preferences.getString(KEY_DEVICE_NAME, null)

    override fun write(deviceId: String, deviceName: String) {
        preferences.edit().putString(KEY_DEVICE_ID, deviceId).putString(KEY_DEVICE_NAME, deviceName).apply()
    }

    override fun remove() {
        preferences.edit().clear().apply()
    }

    private companion object {
        const val KEY_DEVICE_ID = "device_id"
        const val KEY_DEVICE_NAME = "device_name"
    }
}
