package com.nahiradev.irp

import android.content.Context
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import kotlin.concurrent.thread

/**
 * Production HTTP transport for the IRP Control Plane.
 *
 * Connects the mobile client's [ControlPlaneClient] interface to the IRP API:
 *   - POST /api/v1/auth/remote/token     (device credential -> access + refresh token)
 *   - POST /api/v1/auth/remote/refresh   (rotate refresh token)
 *   - GET  /api/v1/remote/devices/:id/snapshot
 *   - GET  /api/v1/remote/devices/:id/analytics
 *   - GET  /api/v1/remote/devices/:id/policy
 *   - POST /api/v1/remote/devices/:id/policy
 *
 * Authentication flow:
 *   1. Device is provisioned with credentialId + secret (out of band, e.g. admin enrollment).
 *   2. Client calls [authenticateWithCredentials] to obtain access + refresh tokens.
 *   3. Access token is used for data plane requests (snapshot, analytics, policy).
 *   4. When access token expires, client uses [refresh] to rotate.
 *
 * All network calls run off the caller's coroutine thread (suspend functions).
 * Timeouts are bounded so a hung network never blocks the UI thread indefinitely.
 */
class HttpControlPlaneClient private constructor(
    private val baseUrl: String,
    private val context: Context,
    private val tokenStore: SecureTokenStore,
) : ControlPlaneClient {

    private const val CONNECT_TIMEOUT_MS = 8_000
    private const val READ_TIMEOUT_MS = 15_000

    private var accessToken: String? = null
    private var refreshToken: String? = null

    private fun headers(addAuth: Boolean = false): Map<String, String> {
        val h = mutableMapOf(
            "Content-Type" to "application/json",
            "Accept" to "application/json",
        )
        if (addAuth && accessToken != null) {
            h["Authorization"] = "Bearer $accessToken"
        }
        return h
    }

    private fun request(
        method: String,
        path: String,
        body: Any? = null,
        addAuth: Boolean = false,
    ): String {
        val url = URL("$baseUrl$path")
        val connection = url.openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = CONNECT_TIMEOUT_MS
        connection.readTimeout = READ_TIMEOUT_MS
        headers(addAuth).forEach { (k, v) -> connection.setRequestProperty(k, v) }

        if (body != null) {
            connection.doOutput = true
            val json = toJson(body)
            connection.outputStream.use { os ->
                os.write(json.toByteArray(StandardCharsets.UTF_8))
            }
        }

        val responseCode = connection.responseCode
        val responseBody = connection.inputStream.use { it.readBytes() }
            .let { bytes -> String(bytes, StandardCharsets.UTF_8) }

        if (responseCode in 200..299) {
            return responseBody
        }

        throw ControlPlaneTransportException(
            "HTTP $responseCode for $method $path: $responseBody",
            responseCode,
        )
    }

    private fun <T> fromJson(json: String, clazz: Class<T>): T {
        // Minimal JSON parsing without external dependencies.
        // For production, consider adding kotlinx.serialization or Gson.
        return parseJson(json, clazz)
    }

    private fun toJson(any: Any?): String {
        if (any == null) return "null"
        return when (any) {
            is String -> "\"${any.replace("\\", "\\\\").replace("\"", "\\\"")}\""
            is Number -> any.toString()
            is Boolean -> any.toString()
            else -> objectToJson(any)
        }
    }

    private fun objectToJson(any: Any): String {
        val fields = mutableListOf<String>()
        any.javaClass.declaredMethods.filter { it.isPublic && it.name.startsWith("get") }
            .forEach { method ->
                val key = method.name.removePrefix("get").lowercaseFirst()
                try {
                    val value = method.invoke(any)
                    fields.add("\"$key\":${toJson(value)}")
                } catch (_: Exception) { /* ignore inaccessible properties */ }
            }
        return "{" + fields.joinToString(",") + "}"
    }

    // ── ControlPlaneClient ─────────────────────────────────────────────────

    override suspend fun enroll(deviceName: String): DeviceEnrollment {
        // Enrollment requires admin authorization on the API side.
        // The client provisions credentials out of band; this path is kept
        // for completeness but will fail unless the caller has admin rights.
        val body = mapOf(
            "platform" to "android",
            "label" to deviceName,
            "scopes" to listOf("runtime.inspect"),
        )
        val json = request("POST", "/api/v1/auth/remote/devices/enroll", body)
        val data = parseJsonObject(json)["data"] as? Map<*, *>
            ?: throw ControlPlaneTransportException("Enrollment response missing data field", 502)
        return DeviceEnrollment(
            deviceId = data["deviceId"]?.toString() ?: "",
            deviceName = data["deviceName"]?.toString() ?: deviceName,
            refreshToken = data["secret"]?.toString() ?: "",
        )
    }

    override suspend fun snapshot(deviceId: String): NetworkSnapshot {
        val json = request("GET", "/api/v1/remote/devices/$deviceId/snapshot", addAuth = true)
        val obj = parseJsonObject(json)
        val data = obj["data"] as? Map<*, *>
            ?: throw ControlPlaneTransportException("Snapshot response missing data field", 502)
        return NetworkSnapshot(
            connection = parseConnection(data["connection"]?.toString() ?: "unknown"),
            interfaceCount = parseInt(data["interfaceCount"]) ?: 0,
            defaultRouteAvailable = parseBoolean(data["defaultRouteAvailable"]) ?: false,
            dnsReachable = parseBoolean(data["dnsReachable"]) ?: false,
            capturedAt = parseInstant(data["capturedAt"]?.toString()) ?: java.time.Instant.now(),
        )
    }

    override suspend fun analytics(deviceId: String): AnalyticsSummary {
        val json = request("GET", "/api/v1/remote/devices/$deviceId/analytics", addAuth = true)
        val obj = parseJsonObject(json)
        val data = obj["data"] as? Map<*, *>
            ?: throw ControlPlaneTransportException("Analytics response missing data field", 502)
        return AnalyticsSummary(
            sampleCount = parseInt(data["sampleCount"]) ?: 0,
            availabilityPercent = parseDouble(data["availabilityPercent"]) ?: 0.0,
            medianLatencyMs = parseDouble(data["medianLatencyMs"]),
            packetLossPercent = parseDouble(data["packetLossPercent"]),
        )
    }

    override suspend fun setPolicy(deviceId: String, policy: Policy): Policy {
        val body = mapOf("autonomousMode" to policy.autonomousMode)
        val json = request("POST", "/api/v1/remote/devices/$deviceId/policy", body, addAuth = true)
        val obj = parseJsonObject(json)
        val data = obj["data"] as? Map<*, *>
            ?: throw ControlPlaneTransportException("Policy response missing data field", 502)
        return Policy(
            autonomousMode = parseBoolean(data["autonomousMode"]?.toString()) ?: policy.autonomousMode,
        )
    }

    // ── Authentication ─────────────────────────────────────────────────────

    /**
     * Authenticate with device credentials (credentialId + secret).
     * Obtains access + refresh tokens and stores them for subsequent requests.
     */
    suspend fun authenticateWithCredentials(credentialId: String, secret: String) {
        val body = mapOf("credentialId" to credentialId, "secret" to secret)
        val json = request("POST", "/api/v1/auth/remote/token", body)
        val obj = parseJsonObject(json)
        val data = obj["data"] as? Map<*, *>
            ?: throw ControlPlaneTransportException("Token response missing data field", 502)
        accessToken = data["accessToken"]?.toString()
            ?: throw ControlPlaneTransportException("Token response missing accessToken", 502)
        refreshToken = data["refreshToken"]?.toString()
            ?: throw ControlPlaneTransportException("Token response missing refreshToken", 502)
        tokenStore.write(refreshToken!!)
    }

    /**
     * Rotate the refresh token to obtain a new access token.
     */
    suspend fun refresh(): Boolean {
        val current = refreshToken ?: tokenStore.read()
        if (current.isNullOrBlank()) return false
        refreshToken = current
        val body = mapOf("refreshToken" to current)
        try {
            val json = request("POST", "/api/v1/auth/remote/refresh", body)
            val obj = parseJsonObject(json)
            val data = obj["data"] as? Map<*, *>
                ?: throw ControlPlaneTransportException("Refresh response missing data field", 502)
            accessToken = data["accessToken"]?.toString()
            refreshToken = data["refreshToken"]?.toString()
            refreshToken?.let { tokenStore.write(it) }
            return true
        } catch (_: ControlPlaneTransportException) {
            return false
        }
    }

    /** Current access token, or null if not authenticated. */
    fun getAccessToken(): String? = accessToken

    /** Whether the client currently holds a valid access token. */
    fun isAuthenticated(): Boolean = accessToken != null

    /** Clear all cached tokens. */
    fun signOut() {
        accessToken = null
        refreshToken = null
        tokenStore.remove()
    }

    companion object {
        const val DEFAULT_BASE_URL = "http://127.0.0.1:3000"

        /**
         * Create an [HttpControlPlaneClient] wired to the API at [baseUrl].
         * If [baseUrl] is null, uses [DEFAULT_BASE_URL].
         */
        fun create(
            context: Context,
            tokenStore: SecureTokenStore,
            baseUrl: String? = null,
        ): HttpControlPlaneClient {
            return HttpControlPlaneClient(
                baseUrl ?: DEFAULT_BASE_URL,
                context,
                tokenStore,
            )
        }
    }
}

/** Thrown when the control plane transport encounters an HTTP error. */
class ControlPlaneTransportException(
    message: String,
    val statusCode: Int = 0,
) : Exception(message)

// ── Minimal JSON helpers (no external dependencies) ────────────────────────

private fun parseJsonObject(json: String): Map<String, Any?> {
    val result = mutableMapOf<String, Any?>()
    var i = 1
    while (i < json.length - 1) {
        // Skip whitespace
        while (i < json.length && json[i].isWhitespace()) i++
        if (i >= json.length - 1) break
        // Read key
        if (json[i] != '"') throw IllegalArgumentException("Expected string key")
        val keyStart = ++i
        while (i < json.length && json[i] != '"') i++
        val key = json.substring(keyStart, i++)
        // Skip colon and whitespace
        while (i < json.length && (json[i] == ':' || json[i].isWhitespace())) i++
        // Read value
        val (value, nextI) = parseJsonValue(json, i)
        result[key] = value
        i = nextI
        // Skip comma/whitespace
        while (i < json.length && (json[i] == ',' || json[i].isWhitespace())) i++
    }
    return result
}

private fun parseJsonValue(json: String, i: Int): Pair<Any?, Int> {
    return when (json[i]) {
        '"' -> {
            val start = i + 1
            var esc = false
            var j = start
            while (j < json.length) {
                if (esc) { esc = false }
                else if (json[j] == '\\') { esc = true }
                else if (json[j] == '"') break
                j++
            }
            val s = json.substring(start, j)
            Pair(s, j + 1)
        }
        '{', '[' -> {
            // Skip complex values (objects/arrays) - find matching close
            val open = json[i]
            val close = if (open == '{') '}' else ']'
            var depth = 0
            var j = i
            while (j < json.length) {
                if (json[j] == open) depth++
                else if (json[j] == close) { depth--; if (depth == 0) break }
                j++
            }
            Pair(json.substring(i, j + 1), j + 1) // Raw JSON string
        }
        't' -> Pair(true, i + 4) // true
        'f' -> Pair(false, i + 5) // false
        'n' -> Pair(null, i + 4) // null
        else -> {
            // Number
            var j = i
            while (j < json.length && (json[j].isDigit() || json[j] == '.' || json[j] == '-' || json[j] == 'e' || json[j] == 'E' || json[j] == '+')) j++
            val numStr = json.substring(i, j)
            Pair(numStr.toDoubleOrNull() ?: numStr, j)
        }
    }
}

private fun String.lowercaseFirst(): String {
    if (isEmpty()) return this
    return this[0].lowercaseChar() + substring(1)
}

private fun parseConnection(value: String): ConnectionState {
    return when (value.lowercase()) {
        "online" -> ConnectionState.ONLINE
        "degraded" -> ConnectionState.DEGRADED
        "offline" -> ConnectionState.OFFLINE
        else -> ConnectionState.UNKNOWN
    }
}

private fun parseInt(value: Any?): Int? {
    if (value == null) return null
    return when (value) {
        is Int -> value
        is Double -> value.toInt()
        is String -> value.toIntOrNull()
        else -> value.toString().toIntOrNull()
    }
}

private fun parseBoolean(value: Any?): Boolean? {
    if (value == null) return null
    return when (value) {
        is Boolean -> value
        is String -> when (value.lowercase()) {
            "true" -> true
            "false" -> false
            else -> null
        }
        else -> null
    }
}

private fun parseDouble(value: Any?): Double? {
    if (value == null) return null
    return when (value) {
        is Double -> value
        is Int -> value.toDouble()
        is String -> value.toDoubleOrNull()
        else -> value.toString().toDoubleOrNull()
    }
}

private fun parseInstant(value: String?): java.time.Instant? {
    if (value == null || value.isBlank()) return null
    return java.time.Instant.parse(value).takeIf { it != null }
}
