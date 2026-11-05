// SPDX-License-Identifier: Apache-2.0
@testable import Inlay
import WebKit
import XCTest

/// Loads a fixture in a real WKWebView through the scheme handler and inspects the page.
final class ReadWebViewTests: XCTestCase {
    @MainActor func testFixtureRendersAndDocumentJSHasNoNativeBridge() async throws {
        let file = TestSupport.fixturesDir.appendingPathComponent("unicode-text.md")
        let doc = MarkdownDocument()
        try doc.read(from: file, ofType: MarkdownDocument.markdownType)
        doc.fileURL = file
        doc.registerContext()
        defer { doc.close() }

        let webView = ReadWebView(docId: doc.docId)
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 800, height: 600), styleMask: [.titled], backing: .buffered, defer: false)
        window.contentView = webView
        webView.loadDocument()

        // Poll until the shell has rendered the document.
        var rendered = false
        for _ in 0..<100 {
            if let value = try? await webView.evaluateJavaScript("document.querySelector('#inlay-root h1') ? document.querySelector('#inlay-root h1').textContent : ''") as? String, !value.isEmpty {
                XCTAssertEqual(value, "Unicode text")
                rendered = true
                break
            }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertTrue(rendered, "Read view did not render within 10 s")

        let bridge = try await webView.evaluateJavaScript("typeof window.webkit === 'undefined' || typeof window.webkit.messageHandlers === 'undefined'") as? Bool
        XCTAssertEqual(bridge, true, "document JS must not see a native message bridge")

        let baseURL = try await webView.evaluateJavaScript("document.getElementById('inlay-root').dataset.baseUrl") as? String
        XCTAssertEqual(baseURL, "mdview://\(doc.docId)/")

        let title = try await webView.evaluateJavaScript("document.title") as? String
        XCTAssertEqual(title, "Unicode text — Inlay")
    }
}
