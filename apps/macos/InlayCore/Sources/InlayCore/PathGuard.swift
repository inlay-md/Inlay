// SPDX-License-Identifier: Apache-2.0
import Foundation

/// Resolves document-relative paths to files strictly inside a root folder.
/// Used by the `mdview://` scheme handler and the Quick Look asset loader so a
/// document can never reference files outside its own folder.
public struct PathGuard: Sendable {
    /// Standardized, symlink-resolved root folder.
    public let root: URL

    public init(root: URL) {
        self.root = root.standardizedFileURL.resolvingSymlinksInPath()
    }

    /// Returns the file URL for `relativePath` when it stays inside the root, else nil.
    /// Accepts percent-encoded input (as it arrives in URLs). Rejects empty paths,
    /// NUL bytes, absolute paths, and any `..` that would climb above the root.
    /// Symlinks inside the root that point outside are rejected as well.
    public func resolve(_ relativePath: String) -> URL? {
        guard let decoded = relativePath.removingPercentEncoding,
              !decoded.isEmpty,
              !decoded.contains("\u{0}"),
              !decoded.hasPrefix("/"),
              !decoded.hasPrefix("\\")
        else { return nil }

        var depth = 0
        var components: [String] = []
        for part in decoded.split(separator: "/", omittingEmptySubsequences: true) {
            switch part {
            case ".": continue
            case "..":
                depth -= 1
                if depth < 0 { return nil }
                components.removeLast()
            default:
                depth += 1
                components.append(String(part))
            }
        }
        guard !components.isEmpty else { return nil }

        var url = root
        for c in components { url.appendPathComponent(c) }
        let standardized = url.standardizedFileURL
        guard isInsideRoot(standardized) else { return nil }
        // If the path exists, make sure symlinks do not escape the root.
        if FileManager.default.fileExists(atPath: standardized.path) {
            let real = standardized.resolvingSymlinksInPath()
            guard isInsideRoot(real) else { return nil }
            return real
        }
        return standardized
    }

    private func isInsideRoot(_ url: URL) -> Bool {
        let rootPath = root.path.hasSuffix("/") ? root.path : root.path + "/"
        return url.path.hasPrefix(rootPath)
    }
}
