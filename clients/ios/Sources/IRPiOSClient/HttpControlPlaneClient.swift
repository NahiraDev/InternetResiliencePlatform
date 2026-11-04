import Foundation

/**
 * Production HTTP transport for the IRP Control Plane on iOS.
 *
 * Connects the mobile client's `IRPControlPlaneClient` interface to the IRP API:
 *   - POST /api/v1/auth/remote/token     (device credential -> access + refresh token)
 *   - POST /api/v1/auth/remote/refresh   (rotate refresh token)
 *   - GET  /api/v1/remote/devices/:id/snapshot
 *   - GET  /api/v1/remote/devices/:id/analytics
 *   - GET  /api/v1/remote/devices/:id/policy
 *   - POST /api/v1/remote/devices/:id/policy
 *
 * Authentication flow:
 *   1. Device is provisioned with credentialId + secret (out of band, e.g. admin enrollment).
 *   2. Client calls `authenticateWithCredentials` to obtain access + refresh tokens.
 *   3. Access token is used for data plane requests (snapshot, analytics, policy).
 *   4. On a 401 response, `refresh` is called once and the request is retried.
 *
 * Token state is guarded by a serial dispatch queue. Network requests are
 * performed outside the queue so async/await (including token refresh) works
 * correctly without deadlocks.
 */
public final class HttpControlPlaneClient: IRPControlPlaneClient, Sendable {
    private let baseURL: URL
    private let session: URLSession
    private let tokenStore: any IRPSecureTokenStore
    // Serial queue guards mutable token state only.
    private let tokenQueue = DispatchQueue(label: "com.nahiradev.irp.http-control-plane.tokens", qos: .userInitiated)

    private var accessToken: String?
    private var refreshToken: String?

    private let connectTimeout: TimeInterval = 8.0
    private let readTimeout: TimeInterval = 15.0
    private let maxRefreshRetries = 1

    public init(
        baseURL: String = "http://127.0.0.1:3000",
        tokenStore: any IRPSecureTokenStore,
        session: URLSession? = nil,
    ) throws {
        guard let url = URL(string: baseURL) else {
            throw IRPControlPlaneClientError.invalidBaseURL(baseURL)
        }
        self.baseURL = url
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = readTimeout
        config.timeoutIntervalForResource = connectTimeout + readTimeout
        self.session = session ?? URLSession(configuration: config)
        self.tokenStore = tokenStore

        // Restore refresh token from secure store if present
        self.refreshToken = try? tokenStore.read()
    }

    /// Current access token, or nil if not authenticated. Thread-safe via tokenQueue.
    public var currentAccessToken: String? {
        tokenQueue.sync { accessToken }
    }

    /// Whether the client currently holds a valid access token. Thread-safe via tokenQueue.
    public var isAuthenticated: Bool {
        tokenQueue.sync { accessToken != nil }
    }

    /// Clear all cached tokens. Thread-safe via tokenQueue.
    public func signOut() {
        tokenQueue.sync {
            accessToken = nil
            refreshToken = nil
        }
        try? tokenStore.remove()
    }

    // MARK: - IRPControlPlaneClient

    public func enroll(deviceName: String) async throws -> IRPDeviceEnrollment {
        // Enrollment requires admin authorization on the API side (runtime.admin permission).
        // The client provisions credentials out of band (e.g. admin pre-creates the device credential).
        // This method will fail with 401/403 unless the caller has previously obtained an admin access token.
        let body: [String: Any] = [
            "platform": "ios",
            "label": deviceName,
            "scopes": ["runtime.inspect"],
        ]
        let json: String
        do {
            json = try HttpControlPlaneClient.jsonEncode(body)
        } catch {
            throw IRPControlPlaneClientError.serializationError(error)
        }
        let response: [String: Any]
        do {
            response = try await request(method: "POST", path: "/api/v1/auth/remote/devices/enroll", body: json)
        } catch {
            throw IRPControlPlaneClientError.transportError(error)
        }
        guard let data = response["data"] as? [String: Any] else {
            throw IRPControlPlaneClientError.invalidResponse
        }
        return IRPDeviceEnrollment(
            deviceId: data["deviceId"] as? String ?? "",
            deviceName: data["deviceName"] as? String ?? deviceName,
            refreshToken: data["secret"] as? String ?? "",
        )
    }

    public func snapshot(deviceId: String) async throws -> IRPNetworkSnapshot {
        let json: [String: Any]
        do {
            json = try await request(method: "GET", path: "/api/v1/remote/devices/\(deviceId)/snapshot", addAuth: true)
        } catch {
            throw IRPControlPlaneClientError.transportError(error)
        }
        guard let data = json["data"] as? [String: Any] else {
            throw IRPControlPlaneClientError.invalidResponse
        }
        return IRPNetworkSnapshot(
            connection: parseConnection(data["connection"] as? String ?? "unknown"),
            interfaceCount: data["interfaceCount"] as? Int ?? 0,
            defaultRouteAvailable: data["defaultRouteAvailable"] as? Bool ?? false,
            dnsReachable: data["dnsReachable"] as? Bool ?? false,
            capturedAt: (data["capturedAt"] as? String).flatMap { ISO8601DateFormatter().date(from: $0) } ?? Date(),
        )
    }

    public func analytics(deviceId: String) async throws -> IRPAnalyticsSummary {
        let json: [String: Any]
        do {
            json = try await request(method: "GET", path: "/api/v1/remote/devices/\(deviceId)/analytics", addAuth: true)
        } catch {
            throw IRPControlPlaneClientError.transportError(error)
        }
        guard let data = json["data"] as? [String: Any] else {
            throw IRPControlPlaneClientError.invalidResponse
        }
        return IRPAnalyticsSummary(
            sampleCount: data["sampleCount"] as? Int ?? 0,
            availabilityPercent: data["availabilityPercent"] as? Double ?? 0.0,
            medianLatencyMs: data["medianLatencyMs"] as? Double,
            packetLossPercent: data["packetLossPercent"] as? Double,
        )
    }

    public func setPolicy(deviceId: String, policy: IRPPolicy) async throws -> IRPPolicy {
        let body: [String: Any] = ["autonomousMode": policy.autonomousMode]
        let json: String
        do {
            json = try HttpControlPlaneClient.jsonEncode(body)
        } catch {
            throw IRPControlPlaneClientError.serializationError(error)
        }
        let response: [String: Any]
        do {
            response = try await request(method: "POST", path: "/api/v1/remote/devices/\(deviceId)/policy", body: json, addAuth: true)
        } catch {
            throw IRPControlPlaneClientError.transportError(error)
        }
        guard let data = response["data"] as? [String: Any] else {
            throw IRPControlPlaneClientError.invalidResponse
        }
        return IRPPolicy(
            autonomousMode: data["autonomousMode"] as? Bool ?? policy.autonomousMode
        )
    }

    // MARK: - Authentication

    /**
     * Authenticate with device credentials (credentialId + secret).
     * Obtains access + refresh tokens and stores them for subsequent requests.
     */
    public func authenticateWithCredentials(credentialId: String, secret: String) async throws {
        let body: [String: Any] = ["credentialId": credentialId, "secret": secret]
        let json: String
        do {
            json = try HttpControlPlaneClient.jsonEncode(body)
        } catch {
            throw IRPControlPlaneClientError.serializationError(error)
        }
        let response: [String: Any]
        do {
            response = try await request(method: "POST", path: "/api/v1/auth/remote/token", body: json)
        } catch {
            throw IRPControlPlaneClientError.transportError(error)
        }
        guard let data = response["data"] as? [String: Any] else {
            throw IRPControlPlaneClientError.invalidResponse
        }
        guard let access = data["accessToken"] as? String, !access.isEmpty else {
            throw IRPControlPlaneClientError.invalidResponse
        }
        guard let refresh = data["refreshToken"] as? String, !refresh.isEmpty else {
            throw IRPControlPlaneClientError.invalidResponse
        }
        tokenQueue.sync {
            self.accessToken = access
            self.refreshToken = refresh
        }
        try tokenStore.write(refresh)
    }

    /**
     * Rotate the refresh token to obtain a new access token.
     * Returns true if rotation succeeded, false otherwise.
     */
    public func refresh() async -> Bool {
        let current: String? = tokenQueue.sync { refreshToken ?? (try? tokenStore.read()) }
        guard let current = current, !current.isEmpty else {
            return false
        }
        tokenQueue.sync { self.refreshToken = current }
        let body: [String: Any] = ["refreshToken": current]
        let json: String
        do {
            json = try HttpControlPlaneClient.jsonEncode(body)
        } catch {
            return false
        }
        do {
            let response: [String: Any] = try await request(method: "POST", path: "/api/v1/auth/remote/refresh", body: json)
            guard let data = response["data"] as? [String: Any] else { return false }
            tokenQueue.sync {
                self.accessToken = data["accessToken"] as? String
                self.refreshToken = data["refreshToken"] as? String
            }
            if let refresh = tokenQueue.sync({ self.refreshToken }) {
                try? tokenStore.write(refresh)
            }
            return tokenQueue.sync { self.accessToken != nil }
        } catch {
            return false
        }
    }

    // MARK: - Private networking

    private func request(
        method: String,
        path: String,
        body: String? = nil,
        addAuth: Bool = false,
        refreshRetries: Int = 0,
    ) async throws -> [String: Any] {
        // Read the current auth token under lock (sync, quick).
        let token: String? = tokenQueue.sync { addAuth ? self.accessToken : nil }

        do {
            return try await performNetworkRequest(method: method, path: path, body: body, token: token)
        } catch let error as IRPControlPlaneClientError where error.isUnauthorized && addAuth && refreshRetries < maxRefreshRetries {
            // Token expired: rotate and retry once.
            let refreshed = await self.refresh()
            if refreshed {
                return try await request(method: method, path: path, body: body, addAuth: true, refreshRetries: refreshRetries + 1)
            }
            throw error
        }
    }

    private func performNetworkRequest(
        method: String,
        path: String,
        body: String?,
        token: String?,
    ) async throws -> [String: Any] {
        guard let url = URL(string: baseURL.absoluteString + path) else {
            throw IRPControlPlaneClientError.invalidURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body = body {
            request.httpBody = body.data(using: .utf8)
        }

        let (data, urlResponse) = try await session.data(for: request)

        guard let httpResponse = urlResponse as? HTTPURLResponse else {
            throw IRPControlPlaneClientError.invalidResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            let bodyStr = String(data: data, encoding: .utf8) ?? ""
            throw IRPControlPlaneClientError.httpError(
                statusCode: httpResponse.statusCode,
                body: bodyStr,
            )
        }
        do {
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            return json ?? [:]
        } catch {
            throw error
        }
    }

    private static func jsonEncode(_ value: Any) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: value)
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    private func parseConnection(_ value: String) -> IRPConnectionState {
        switch value.lowercased() {
        case "online": return .online
        case "degraded": return .degraded
        case "offline": return .offline
        default: return .unknown
        }
    }
}

// MARK: - Error extensions

extension IRPControlPlaneClientError {
    /// True when this error represents an HTTP 401 Unauthorized response.
    var isUnauthorized: Bool {
        if case .httpError(let statusCode, _) = self {
            return statusCode == 401
        }
        return false
    }
}

public enum IRPControlPlaneClientError: Error, Equatable, Sendable {
    case invalidBaseURL(String)
    case invalidURL
    case invalidResponse
    case transportError(Error)
    case serializationError(Error)
    case httpError(statusCode: Int, body: String)
}
