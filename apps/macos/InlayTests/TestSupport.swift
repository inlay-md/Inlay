// SPDX-License-Identifier: Apache-2.0
import Foundation
import WebKit
import XCTest

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

    /// Evaluates `script` every 100 ms until it returns a non-empty string (or the timeout passes).
    @MainActor
    static func poll(_ webView: WKWebView, _ script: String, timeout: TimeInterval = 10) async throws -> String {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let value = try? await webView.evaluateJavaScript(script) as? String, !value.isEmpty {
                return value
            }
            try await Task.sleep(for: .milliseconds(100))
        }
        return ""
    }
}
