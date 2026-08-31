import Foundation

public protocol IRPSecureTokenStore: Sendable {
    func read() throws -> String?
    func write(_ token: String) throws
    func remove() throws
}

public final class IRPMemoryTokenStore: IRPSecureTokenStore, @unchecked Sendable {
    private var token: String?
    private let lock = NSLock()

    public init(token: String? = nil) {
        self.token = token
    }

    public func read() throws -> String? {
        lock.lock()
        defer { lock.unlock() }
        return token
    }

    public func write(_ token: String) throws {
        lock.lock()
        defer { lock.unlock() }
        self.token = token
    }

    public func remove() throws {
        lock.lock()
        defer { lock.unlock() }
        token = nil
    }
}

#if canImport(Security)
import Security

public struct IRPKeychainTokenStore: IRPSecureTokenStore, Sendable {
    private let service: String
    private let account: String

    public init(
        service: String = "com.nahiradev.irp",
        account: String = "control-plane-refresh-token"
    ) {
        self.service = service
        self.account = account
    }

    public func read() throws -> String? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let data = item as? Data else {
                throw IRPKeychainError.invalidStoredValue
            }
            return String(data: data, encoding: .utf8)
        case errSecItemNotFound:
            return nil
        default:
            throw IRPKeychainError.status(status)
        }
    }

    public func write(_ token: String) throws {
        guard let data = token.data(using: .utf8) else {
            throw IRPKeychainError.invalidToken
        }

        let query = baseQuery() as CFDictionary
        let attributes = [kSecValueData as String: data] as CFDictionary
        let updateStatus = SecItemUpdate(query, attributes)

        if updateStatus == errSecItemNotFound {
            var add = baseQuery()
            add[kSecValueData as String] = data
            let addStatus = SecItemAdd(add as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw IRPKeychainError.status(addStatus)
            }
            return
        }

        guard updateStatus == errSecSuccess else {
            throw IRPKeychainError.status(updateStatus)
        }
    }

    public func remove() throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw IRPKeychainError.status(status)
        }
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

public enum IRPKeychainError: Error, Equatable, Sendable {
    case invalidStoredValue
    case invalidToken
    case status(OSStatus)
}
#endif
