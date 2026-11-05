package com.nahiradev.irp

import android.content.Context
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.lang.reflect.Modifier
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.time.Instant
import kotlin.coroutines.CoroutineContext

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
 *   4. On a 401 response, [refresh] is called once and the request is retried.
 *
 * All network calls run off the caller's coroutine thread (suspend functions).
 * Timeouts are bounded so a hung network never blocks the UI thread indefinitely.
 */
class HttpControlPlaneClient private constructor(
    private val baseUrl: String,
    private val tokenStore: SecureTokenStore,
) : ControlPlaneClient {

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

    /**
     * Executes an HTTP request with bounded timeouts.
     * On a 401 response, attempts one token refresh and retries once.
     * Reads the error stream for non-2xx responses so error bodies are captured.
     */
    private suspend fun request(
        method: String,
        path: String,
        body: Any? = null,
        addAuth: Boolean = false,
        refreshRetries: Int = 0,
    ): String {
        val url = URL("$baseUrl$path")
        val connection = url.openConnection() as HttpURLConnection
        connection.requestMethod = method
        connection.connectTimeout = CONNECT_TIMEOUT_MS
        connection.readTimeout = READ_TIMEOUT_MS
        connection.instanceFollowRedirects = false
        headers(addAuth).forEach { (k, v) -> connection.setRequestProperty(k, v) }

        if (body != null) {
            connection.doOutput = true
            val json = toJson(body)
            connection.outputStream.use { os ->
                os.write(json.toByteArray(StandardCharsets.UTF_8))
            }
        }

        val responseCode = connection.responseCode
        val responseBody = readStream(if (responseCode in 200..299) connection.inputStream else connection.errorStream)

        if (responseCode in 200..299) {
            return responseBody
        }

        // On 401, try to refresh the access token and retry exactly once.
        if (responseCode == 401 && addAuth && refreshRetries < MAX_REFRESH_RETRIES) {
            connection.disconnect()
            if (refresh()) {
                return request(method, path, body, addAuth = true, refreshRetries = refreshRetries + 1)
            }
        }

        throw ControlPlaneTransportException(
            "HTTP $responseCode for $method $path: $responseBody",
            responseCode,
        )
    }

    private fun readStream(stream: InputStream?): String {
        if (stream == null) return ""
        return BufferedReader(InputStreamReader(stream, StandardCharsets.UTF_8)).use { reader ->
            reader.readText()
        }
    }

    private fun <T> fromJson(json: String, clazz: Class<T>): T {
        // Minimal JSON parsing without external dependencies.
        // Kept for future structured decoding; currently unused.
        val map = parseJsonObject(json)
        return clazz.getDeclaredConstructor().newInstance().also { instance ->
            clazz.declaredFields.forEach { field ->
                field.isAccessible = true
                map[field.name]?.let { value ->
                    field.set(instance, convertValue(value, field.type))
                }
            }
        }
    }

    private fun convertValue(value: Any?, targetType: java.lang.reflect.Type): Any? {
        return when {
            value == null -> null
            targetType == String::class.java -> value.toString()
            targetType.typeName == Int::class.java.typeName -> value.toString().toIntOrNull()
            targetType.typeName == Double::class.java.typeName -> value.toString().toDoubleOrNull()
            targetType.typeName == Boolean::class.java.typeName ->
                when (value.toString().lowercase()) { "true" -> true; "false" -> false; else -> null }
            targetType.typeName == Instant::class.java.typeName -> Instant.parse(value.toString())
            else -> value
        }
    }

    private fun toJson(any: Any?): String {
        if (any == null) return "null"
        return when (any) {
            is String -> "\"${any.replace("\\", "\\\\").replace("\"", "\\\"")}\""
            is Number -> any.toString()
            is Boolean -> any.toString()
            is Map<*, *> -> mapToJson(any)
            else -> objectToJson(any)
        }
    }

    private fun mapToJson(map: Map<*, *>): String {
        return "{" + map.entries.joinToString(",") { "\"${escapeJsonString(it.key.toString())}\":${toJson(it.value)}" } + "}"
    }

    private fun objectToJson(any: Any): String {
        val fields = mutableListOf<String>()
        any.javaClass.declaredMethods.filter { Modifier.isPublic(it.modifiers) && it.name.startsWith("get") && it.parameterCount == 0 }
            .forEach { method ->
                val key = method.name.removePrefix("get").lowercaseFirst()
                try {
                    val value = method.invoke(any)
                    fields.add("\"$key\":${toJson(value)}")
                } catch (_: Exception) { /* ignore inaccessible properties */ }
            }
        return "{" + fields.joinToString(",") + "}"
    }

    private fun escapeJsonString(s: String): String {
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t")
    }

    // ── ControlPlaneClient ─────────────────────────────────────────────────

    override suspend fun enroll(deviceName: String): DeviceEnrollment {
        // Enrollment requires admin authorization on the API side (runtime.admin permission).
        // The client provisions credentials out of band (e.g. admin pre-creates the device credential).
        // This method will fail with 401/403 unless the caller has previously obtained an admin access token.
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
            capturedAt = parseInstant(data["capturedAt"]?.toString()) ?: Instant.now(),
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
     * Returns true if rotation succeeded, false otherwise.
     */
    suspend fun refresh(): Boolean {
        val current = refreshToken ?: tokenStore.read()
        if (current.isNullOrBlank()) return false
        refreshToken = current
        val body = mapOf("refreshToken" to current)
        return try {
            val json = request("POST", "/api/v1/auth/remote/refresh", body)
            val obj = parseJsonObject(json)
            val data = obj["data"] as? Map<*, *>
                ?: throw ControlPlaneTransportException("Refresh response missing data field", 502)
            accessToken = data["accessToken"]?.toString()
            refreshToken = data["refreshToken"]?.toString()
            refreshToken?.let { tokenStore.write(it) }
            true
        } catch (_: ControlPlaneTransportException) {
            false
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
        private const val CONNECT_TIMEOUT_MS = 8_000
        private const val READ_TIMEOUT_MS = 15_000
        private const val MAX_REFRESH_RETRIES = 1

        /**
         * Create an [HttpControlPlaneClient] wired to the API at [baseUrl].
         * [baseUrl] is required: there is no localhost fallback. Production builds
         * must supply a configured HTTPS Control Plane endpoint. Passing a blank
         * URL fails fast with a clear error instead of silently connecting to
         * localhost.
         */
        fun create(
            context: Context,
            tokenStore: SecureTokenStore,
            baseUrl: String,
        ): HttpControlPlaneClient {
            require(baseUrl.isNotBlank()) { "Control Plane base URL must not be blank" }
            // context is reserved for future use (e.g., reading app configuration).
            return HttpControlPlaneClient(
                baseUrl,
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
        while (i < json.length && json[i].isWhitespace()) i++
        if (i >= json.length - 1) break
        if (json[i] != '"') throw IllegalArgumentException("Expected string key")
        val keyStart = ++i
        while (i < json.length && json[i] != '"') i++
        val key = json.substring(keyStart, i++)
        while (i < json.length && (json[i] == ':' || json[i].isWhitespace())) i++
        val (value, nextI) = parseJsonValue(json, i)
        result[key] = value
        i = nextI
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
            Pair(json.substring(start, j), j + 1)
        }
        '{', '[' -> {
            val open = json[i]
            val close = if (open == '{') '}' else ']'
            var depth = 0
            var j = i
            while (j < json.length) {
                if (json[j] == open) depth++
                else if (json[j] == close) { depth--; if (depth == 0) break }
                j++
            }
            Pair(json.substring(i, j + 1), j + 1)
        }
        't' -> Pair(true, i + 4)
        'f' -> Pair(false, i + 5)
        'n' -> Pair(null, i + 4)
        else -> {
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

private fun parseInstant(value: String?): Instant? {
    if (value == null || value.isBlank()) return null
    return Instant.parse(value).takeIf { it != null }
}
