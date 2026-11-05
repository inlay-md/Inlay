// SPDX-License-Identifier: Apache-2.0
import Foundation

/// App settings as the web core's `Settings` JSON (packages/host-api/src/settings.ts owns the
/// schema and validates what it reads; native stores the dictionary and merges patches).
final class SettingsStore {
    static let shared = SettingsStore(defaults: .standard)

    private let defaults: UserDefaults
    private let key = "live.inlay.settings"

    init(defaults: UserDefaults) {
        self.defaults = defaults
    }

    func current() -> [String: Any] {
        (defaults.dictionary(forKey: key)) ?? [:]
    }

    /// Deep-merges `patch` into the stored settings and returns the result.
    @discardableResult
    func update(_ patch: [String: Any]) -> [String: Any] {
        let merged = Self.merge(current(), patch)
        defaults.set(merged, forKey: key)
        return merged
    }

    static func merge(_ base: [String: Any], _ patch: [String: Any]) -> [String: Any] {
        var out = base
        for (key, value) in patch {
            if let sub = value as? [String: Any], let existing = out[key] as? [String: Any] {
                out[key] = merge(existing, sub)
            } else {
                out[key] = value
            }
        }
        return out
    }
}
