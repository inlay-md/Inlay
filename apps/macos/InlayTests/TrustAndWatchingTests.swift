// SPDX-License-Identifier: Apache-2.0
@testable import Inlay
import XCTest

/// Quarantine → trust, the network toggle and external change detection (ADR-0007, ADR-0013).
final class TrustAndWatchingTests: XCTestCase {
    private func temporaryCopy(of fixture: String) throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("inlay-trust-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(fixture)
        try FileManager.default.copyItem(at: TestSupport.fixturesDir.appendingPathComponent(fixture), to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return url
    }

    @MainActor func testTrustStoreIsKeyedByPathAndQuarantineValue() {
        let defaults = UserDefaults(suiteName: "live.inlay.tests.\(UUID().uuidString)")!
        let store = TrustStore(defaults: defaults)
        XCTAssertFalse(store.isTrusted(path: "/a.md", quarantineValue: "q1"))
        store.trust(path: "/a.md", quarantineValue: "q1")
        XCTAssertTrue(store.isTrusted(path: "/a.md", quarantineValue: "q1"))
        XCTAssertFalse(store.isTrusted(path: "/a.md", quarantineValue: "q2"), "a re-downloaded file asks again")
        XCTAssertFalse(store.isTrusted(path: "/b.md", quarantineValue: "q1"))
        store.revokeTrust(path: "/a.md", quarantineValue: "q1")
        XCTAssertFalse(store.isTrusted(path: "/a.md", quarantineValue: "q1"))
        XCTAssertFalse(store.allowsNetwork(path: "/a.md"))
        store.setAllowsNetwork(true, path: "/a.md")
        XCTAssertTrue(store.allowsNetwork(path: "/a.md"))
        store.setAllowsNetwork(false, path: "/a.md")
        XCTAssertFalse(store.allowsNetwork(path: "/a.md"))
    }

    @MainActor func testQuarantinedDocumentRendersStaticallyUntilTrustedWithoutTouchingTheFile() async throws {
        let url = try temporaryCopy(of: "widget-interactive.md")
        XCTAssertTrue(Quarantine.setQuarantine(url))
        let before = try Data(contentsOf: url)
        let attrsBefore = try FileManager.default.attributesOfItem(atPath: url.path)
        let doc = MarkdownDocument()
        try doc.read(from: url, ofType: MarkdownDocument.markdownType)
        doc.fileURL = url
        defer { doc.close() }
        XCTAssertTrue(doc.isQuarantined)
        XCTAssertTrue(doc.isUntrusted)
        // Unique path per test, so the shared store has no stale trust for it.
        TrustStore.shared.revokeTrust(path: url.path, quarantineValue: doc.quarantineValue)
        doc.registerContext()

        let handler = MDViewSchemeHandler()
        let untrusted = handler.respond(to: URLRequest(url: URL(string: "mdview://\(doc.docId)/")!))
        let csp = untrusted.headers["Content-Security-Policy"] ?? ""
        XCTAssertTrue(csp.contains("script-src 'nonce-"), csp)
        XCTAssertFalse(csp.contains("script-src 'unsafe-inline'"))
        let html = String(decoding: untrusted.body, as: UTF8.self)
        XCTAssertTrue(html.contains("\"quarantined\":true"))

        let webView = ReadWebView(docId: doc.docId)
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 800, height: 600), styleMask: [.titled], backing: .buffered, defer: false)
        window.contentView = webView
        webView.loadDocument()
        let staticReady = try await TestSupport.poll(webView, "document.querySelector('#inlay-root[data-quarantined]') ? (document.querySelectorAll('.inlay-script-placeholder').length + ':' + document.querySelectorAll('#inlay-root script').length) : ''")
        XCTAssertEqual(staticReady, "1:0", "scripts are replaced by a placeholder and none run")
        let ready = try await webView.evaluateJavaScript("document.getElementById('widget') && document.getElementById('widget').dataset.ready === 'true'") as? Bool
        XCTAssertEqual(ready, false)

        // Trust: the policy and the page change; the file does not.
        var policyChanged = false
        doc.onPolicyChanged = { policyChanged = true }
        doc.trustDocument()
        XCTAssertTrue(policyChanged)
        XCTAssertFalse(doc.isUntrusted)
        let trusted = handler.respond(to: URLRequest(url: URL(string: "mdview://\(doc.docId)/")!))
        XCTAssertTrue((trusted.headers["Content-Security-Policy"] ?? "").contains("script-src 'unsafe-inline' mdview:"))
        webView.reload()
        let widgetReady = try await TestSupport.poll(webView, "document.getElementById('widget') && document.getElementById('widget').dataset.ready === 'true' ? 'yes' : ''")
        XCTAssertEqual(widgetReady, "yes")
        XCTAssertEqual(try Data(contentsOf: url), before)
        XCTAssertEqual(Quarantine.value(of: url), doc.quarantineValue, "the quarantine attribute stays")
        XCTAssertEqual(try FileManager.default.attributesOfItem(atPath: url.path)[.modificationDate] as? Date, attrsBefore[.modificationDate] as? Date)
        TrustStore.shared.revokeTrust(path: url.path, quarantineValue: doc.quarantineValue)
    }

    @MainActor func testAllowNetworkTogglesThePolicyPerDocument() throws {
        let url = try temporaryCopy(of: "fetch-toggle.md")
        let doc = MarkdownDocument()
        try doc.read(from: url, ofType: MarkdownDocument.markdownType)
        doc.fileURL = url
        defer {
            doc.setAllowNetwork(false)
            doc.close()
        }
        let handler = MDViewSchemeHandler()
        let request = URLRequest(url: URL(string: "mdview://\(doc.docId)/")!)
        XCTAssertTrue((handler.respond(to: request).headers["Content-Security-Policy"] ?? "").contains("connect-src 'none'"))
        var changes = 0
        doc.onPolicyChanged = { changes += 1 }
        doc.setAllowNetwork(true)
        XCTAssertEqual(changes, 1)
        XCTAssertTrue(TrustStore.shared.allowsNetwork(path: url.path), "remembered per path")
        XCTAssertTrue((handler.respond(to: request).headers["Content-Security-Policy"] ?? "").contains("connect-src https:"))
        doc.setAllowNetwork(true)
        XCTAssertEqual(changes, 1, "no-op when unchanged")
    }

    @MainActor func testUncoordinatedWriteRefreshesTheDocumentAndTheReadView() async throws {
        let url = try temporaryCopy(of: "gfm-basics.md")
        let doc = MarkdownDocument()
        try doc.read(from: url, ofType: MarkdownDocument.markdownType)
        doc.fileURL = url
        doc.makeWindowControllers()
        defer { doc.close() }
        let controller = try XCTUnwrap(doc.windowControllers.first as? DocumentWindowController)
        let webView = controller.readView
        let first = try await TestSupport.poll(webView, "document.querySelector('#inlay-root h1') ? document.querySelector('#inlay-root h1').textContent : ''")
        XCTAssertEqual(first, "GFM basics")

        // Scroll a little so we can see the position survive the refresh.
        _ = try await webView.evaluateJavaScript("window.scrollTo(0, 300); window.inlayReadView.getPosition().line")

        // Plain write, no file coordination (like `echo >> file` or an editor saving in place).
        try Data("# Changed on disk\n\nNew text.\n".utf8).write(to: url)
        let changed = try await TestSupport.poll(webView, "document.querySelector('#inlay-root h1') && document.querySelector('#inlay-root h1').textContent === 'Changed on disk' ? 'yes' : ''", timeout: 10)
        XCTAssertEqual(changed, "yes")
        XCTAssertEqual(doc.text, "# Changed on disk\n\nNew text.\n")

        // Atomic save (write temp + rename) is how most editors save.
        let tmp = url.deletingLastPathComponent().appendingPathComponent("tmp-\(UUID().uuidString).md")
        try Data("# Renamed into place\n".utf8).write(to: tmp)
        _ = try FileManager.default.replaceItemAt(url, withItemAt: tmp)
        let renamed = try await TestSupport.poll(webView, "document.querySelector('#inlay-root h1') && document.querySelector('#inlay-root h1').textContent === 'Renamed into place' ? 'yes' : ''", timeout: 10)
        XCTAssertEqual(renamed, "yes")
        XCTAssertEqual(try doc.data(ofType: MarkdownDocument.markdownType), Data("# Renamed into place\n".utf8))
    }

    @MainActor func testExternalLinksAndPopupsLeaveTheWebView() {
        let webView = ReadWebView(docId: "d")
        XCTAssertEqual(webView.policy(for: URL(string: "mdview://d/")!, isMainFrame: true), .allow)
        XCTAssertEqual(webView.policy(for: URL(string: "mdview://d/__inlay/assets/x.js")!, isMainFrame: true), .allow)
        XCTAssertEqual(webView.policy(for: URL(string: "mdview://other/")!, isMainFrame: true), .cancel)
        XCTAssertEqual(webView.policy(for: URL(string: "mdview://d/notes/other.md")!, isMainFrame: true), .openMarkdown)
        XCTAssertEqual(webView.policy(for: URL(string: "mdview://d/image.png")!, isMainFrame: true), .cancel)
        XCTAssertEqual(webView.policy(for: URL(string: "mdview://d/image.png")!, isMainFrame: false), .allow)
        XCTAssertEqual(webView.policy(for: URL(string: "https://inlay.live")!, isMainFrame: true), .openExternal)
        XCTAssertEqual(webView.policy(for: URL(string: "mailto:x@example.com")!, isMainFrame: true), .openExternal)
        XCTAssertEqual(webView.policy(for: URL(string: "file:///etc/hosts")!, isMainFrame: true), .cancel)
        XCTAssertEqual(webView.policy(for: URL(string: "javascript:alert(1)")!, isMainFrame: true), .cancel)
    }
}
