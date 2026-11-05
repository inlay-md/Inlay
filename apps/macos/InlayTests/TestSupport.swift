// SPDX-License-Identifier: Apache-2.0
import Foundation

enum TestSupport {
    /// Repository root, derived from this source file's location.
    static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // InlayTests
            .deletingLastPathComponent() // macos
            .deletingLastPathComponent() // apps
            .deletingLastPathComponent() // repo
    }

    static var fixturesDir: URL { repoRoot.appendingPathComponent("fixtures/md", isDirectory: true) }

    static func fixtureFiles() throws -> [URL] {
        try FileManager.default.contentsOfDirectory(at: fixturesDir, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "md" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }
}
