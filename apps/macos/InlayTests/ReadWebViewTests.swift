// SPDX-License-Identifier: Apache-2.0
@testable import Inlay
import WebKit
import XCTest

/// Loads fixtures in a real WKWebView through the scheme handler and inspects the page.
final class ReadWebViewTests: XCTestCase {
    @MainActor private func open(_ fixture: String) throws -> (MarkdownDocument, ReadWebView, NSWindow) {
        let file = TestSupport.fixturesDir.appendingPathComponent(fixture)
        let doc = MarkdownDocument()
        try doc.read(from: file, ofType: MarkdownDocument.markdownType)
        doc.fileURL = file
        doc.registerContext()
        let webView = ReadWebView(docId: doc.docId)
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 800, height: 600), styleMask: [.titled], backing: .buffered, defer: false)
        window.contentView = webView
        webView.loadDocument()
        return (doc, webView, window)
    }

    @MainActor func testFixtureRendersAndDocumentJSHasNoNativeBridge() async throws {
        let (doc, webView, _) = try open("unicode-text.md")
        defer { doc.close() }
        let heading = try await TestSupport.poll(webView, "document.querySelector('#inlay-root h1') ? document.querySelector('#inlay-root h1').textContent : ''")
        XCTAssertEqual(heading, "Unicode text")
        let bridge = try await webView.evaluateJavaScript("typeof window.webkit === 'undefined' || typeof window.webkit.messageHandlers === 'undefined'") as? Bool
        XCTAssertEqual(bridge, true, "document JS must not see a native message bridge")
        let baseURL = try await webView.evaluateJavaScript("document.getElementById('inlay-root').dataset.baseUrl") as? String
        XCTAssertEqual(baseURL, "mdview://\(doc.docId)/")
        let title = try await webView.evaluateJavaScript("document.title") as? String
        XCTAssertEqual(title, "Unicode text — Inlay")
        let position = await webView.position()
        XCTAssertEqual(position?.line, 1)
    }

    @MainActor func testChartRendersOfflineFromTheVendoredCopy() async throws {
        let (doc, webView, _) = try open("chart-chartjs.md")
        defer { doc.close() }
        let rendered = try await TestSupport.poll(webView, "document.getElementById('sales') ? (document.getElementById('sales').dataset.rendered || '') : ''")
        XCTAssertEqual(rendered, "true")
        let src = try await webView.evaluateJavaScript("document.querySelector('script[data-inlay-vendor]').src") as? String
        XCTAssertEqual(src, "mdview://\(doc.docId)/__inlay/vendor/chart.js/chart.umd.js")
        let handler = MDViewSchemeHandler()
        let vendored = handler.respond(to: URLRequest(url: URL(string: "mdview://\(doc.docId)/__inlay/vendor/chart.js/chart.umd.js")!))
        XCTAssertEqual(vendored.status, 200)
        XCTAssertEqual(vendored.headers["Content-Type"], "text/javascript; charset=utf-8")
        XCTAssertEqual(handler.respond(to: URLRequest(url: URL(string: "mdview://\(doc.docId)/__inlay/vendor/katex/katex.min.css")!)).status, 200)
    }

    @MainActor func testCodeIsHighlightedAndMathRendered() async throws {
        let (doc, webView, _) = try open("highlighting.md")
        defer { doc.close() }
        let highlighted = try await TestSupport.poll(webView, "document.querySelectorAll('pre.shiki').length >= 12 ? String(document.querySelectorAll('pre.shiki').length) : ''")
        XCTAssertEqual(highlighted, "12", "lazy grammar chunks load through the scheme handler")
        let (mathDoc, mathView, _) = try open("math.md")
        defer { mathDoc.close() }
        let katex = try await TestSupport.poll(mathView, "document.querySelectorAll('.katex').length ? String(document.querySelectorAll('.katex').length) : ''")
        XCTAssertEqual(katex, "5")
    }

    @MainActor func testSecurityProbeFindsEveryEscapeBlocked() async throws {
        let (doc, webView, _) = try open("security-probe.md")
        defer { doc.close() }
        var opened: [URL] = []
        webView.externalOpener = { opened.append($0) }
        var markdownOpened: [URL] = []
        webView.markdownOpener = { markdownOpened.append($0) }
        let json = try await TestSupport.poll(webView, "document.getElementById('probe-results') && document.getElementById('probe-results').dataset.complete === 'true' ? document.getElementById('probe-results').textContent : ''", timeout: 15)
        XCTAssertFalse(json.isEmpty, "probe did not complete")
        let report = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
        let results = try XCTUnwrap(report["results"] as? [String: String])
        for key in ["native-bridge", "eval", "function-ctor", "fetch-remote", "fetch-same-origin", "fetch-traversal", "xhr-remote", "websocket", "beacon", "iframe", "window-open", "form-submit", "img-traversal"] {
            XCTAssertTrue(results[key]?.hasPrefix("blocked:") ?? false, "\(key): \(results[key] ?? "missing")")
        }
        XCTAssertEqual(results["native-bridge"], "blocked:no-bridge")
        // Script-initiated window.open is refused by WebKit itself (javaScriptCanOpenWindowsAutomatically = false),
        // so the UI delegate is not even consulted and nothing reaches the external opener.
        XCTAssertEqual(results["window-open"], "blocked:null")
        XCTAssertEqual(webView.refusedPopups, 0)
        XCTAssertEqual(opened, [])
        XCTAssertEqual(markdownOpened, [])
        let violations = try XCTUnwrap(report["violations"] as? [String])
        XCTAssertTrue(violations.contains { $0.hasPrefix("connect-src") })
        XCTAssertTrue(violations.contains { $0.hasPrefix("frame-src") || $0.hasPrefix("child-src") })
        XCTAssertEqual(webView.url?.host, doc.docId, "the page itself did not navigate away")
    }
}
