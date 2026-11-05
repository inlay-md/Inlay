// SPDX-License-Identifier: Apache-2.0
import Foundation

/// Remembers which quarantined documents the user has trusted and which
/// documents may use the network (ADR-0007). Keyed by file path plus the value
/// of the `com.apple.quarantine` attribute, so a re-downloaded file (new
/// quarantine value) asks again. The file itself is never modified.
final class TrustStore {
    static let shared = TrustStore(defaults: .standard)

    private let defaults: UserDefaults
    private let trustedKey = "live.inlay.trustedDocuments"
    private let networkKey = "live.inlay.networkAllowedDocuments"

    init(defaults: UserDefaults) {
        self.defaults = defaults
    }

    /// Stable identity of a document for trust decisions.
    static func identity(path: String, quarantineValue: String?) -> String {
        "\(path)\u{0}\(quarantineValue ?? "")"
    }

    func isTrusted(path: String, quarantineValue: String?) -> Bool {
        set(forKey: trustedKey).contains(Self.identity(path: path, quarantineValue: quarantineValue))
    }

    func trust(path: String, quarantineValue: String?) {
        var all = set(forKey: trustedKey)
        all.insert(Self.identity(path: path, quarantineValue: quarantineValue))
        defaults.set(Array(all).sorted(), forKey: trustedKey)
    }

    func revokeTrust(path: String, quarantineValue: String?) {
        var all = set(forKey: trustedKey)
        all.remove(Self.identity(path: path, quarantineValue: quarantineValue))
        defaults.set(Array(all).sorted(), forKey: trustedKey)
    }

    func allowsNetwork(path: String) -> Bool {
        set(forKey: networkKey).contains(path)
    }

    func setAllowsNetwork(_ allowed: Bool, path: String) {
        var all = set(forKey: networkKey)
        if allowed { all.insert(path) } else { all.remove(path) }
        defaults.set(Array(all).sorted(), forKey: networkKey)
    }

    private func set(forKey key: String) -> Set<String> {
        Set(defaults.stringArray(forKey: key) ?? [])
    }
}

nonisolated enum Quarantine {
    static let attribute = "com.apple.quarantine"

    static func isQuarantined(_ url: URL) -> Bool {
        value(of: url) != nil
    }

    /// The raw quarantine attribute value (agent, timestamp, origin), or nil when absent.
    static func value(of url: URL) -> String? {
        url.withUnsafeFileSystemRepresentation { path -> String? in
            guard let path else { return nil }
            let length = getxattr(path, attribute, nil, 0, 0, 0)
            guard length >= 0 else { return nil }
            var buffer = [UInt8](repeating: 0, count: Int(length))
            let read = getxattr(path, attribute, &buffer, buffer.count, 0, 0)
            guard read >= 0 else { return nil }
            return String(decoding: buffer.prefix(Int(read)), as: UTF8.self)
        }
    }

    /// Test helper: marks a file as quarantined the way a browser download would.
    @discardableResult
    static func setQuarantine(_ url: URL, value: String = "0083;00000000;Inlay;") -> Bool {
        url.withUnsafeFileSystemRepresentation { path in
            guard let path else { return false }
            return setxattr(path, attribute, value, value.utf8.count, 0, 0) == 0
        }
    }

    static func removeQuarantine(_ url: URL) {
        url.withUnsafeFileSystemRepresentation { path in
            guard let path else { return }
            removexattr(path, attribute, 0)
        }
    }
}
