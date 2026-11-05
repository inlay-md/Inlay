// SPDX-License-Identifier: Apache-2.0
@testable import Inlay
import WebKit
import XCTest

final class MDViewSchemeHandlerTests: XCTestCase {
    private let docId = "test-doc"

    /// Registers the test document for this test and schedules its removal.
    @MainActor private func makeHandler(quarantined: Bool = false, allowNetwork: Bool = false) -> MDViewSchemeHandler {
        MDViewRegistry.shared.register(
            MDViewDocumentContext(
                folderURL: TestSupport.fixturesDir,
                path: TestSupport.fixturesDir.appendingPathComponent("gfm-basics.md").path,
                quarantined: quarantined,
                allowNetwork: allowNetwork,
                sourceProvider: { ("# Hello </script><script>alert(1)</script>", false) }
            ),
            for: docId
        )
        let id = docId
        addTeardownBlock { @MainActor in MDViewRegistry.shared.unregister(id) }
        return MDViewSchemeHandler()
    }

    @MainActor private func get(_ handler: MDViewSchemeHandler, _ path: String, doc: String? = nil) -> MDViewSchemeHandler.Response {
        handler.respond(to: URLRequest(url: URL(string: "mdview://\(doc ?? docId)\(path)")!))
    }

    @MainActor func testShellEmbedsSourceWithCSP() throws {
        let handler = makeHandler()
        let r = get(handler, "/")
        XCTAssertEqual(r.status, 200)
        XCTAssertEqual(r.headers["Content-Type"], "text/html; charset=utf-8")
        let html = String(decoding: r.body, as: UTF8.self)
        XCTAssertTrue(html.contains("<script type=\"application/json\" id=\"inlay-source\">"))
        XCTAssertTrue(html.contains("<\\/script><script>alert(1)<\\/script>"), "</ must be escaped inside the JSON embed")
        XCTAssertTrue(html.contains("\"baseURL\":\"mdview:\\/\\/test-doc\\/\"") || html.contains("\"baseURL\":\"mdview://test-doc/\""))
        XCTAssertTrue(html.contains("/__inlay/assets/"), "runtime assets live under the reserved prefix")
        let csp = r.headers["Content-Security-Policy"] ?? ""
        XCTAssertTrue(csp.contains("connect-src 'none'"))
        XCTAssertTrue(csp.contains("script-src 'unsafe-inline' mdview: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com"))
        XCTAssertTrue(csp.contains("default-src 'none'"))
        XCTAssertTrue(csp.contains("frame-src 'none'"))
        XCTAssertTrue(csp.contains("img-src mdview: data: blob: https:"))
    }

    @MainActor func testUntrustedAndNetworkPolicies() {
        let untrusted = MDViewSchemeHandler.contentSecurityPolicy(trusted: false, allowNetwork: false, nonce: "abc")
        XCTAssertTrue(untrusted.contains("script-src 'nonce-abc' mdview:"))
        XCTAssertFalse(untrusted.contains("script-src 'unsafe-inline'"))
        let open = MDViewSchemeHandler.contentSecurityPolicy(trusted: true, allowNetwork: true)
        XCTAssertTrue(open.contains("connect-src https:"))
        XCTAssertTrue(open.contains("script-src 'unsafe-inline' mdview: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com https:"))
        let handler = makeHandler(quarantined: true)
        let csp = get(handler, "/").headers["Content-Security-Policy"] ?? ""
        XCTAssertTrue(csp.contains("'nonce-"), "quarantined documents get the nonce-only policy")
        XCTAssertFalse(csp.contains("script-src 'unsafe-inline'"))
    }

    @MainActor func testRuntimeAssetsAreServedFromTheBundle() throws {
        let handler = makeHandler()
        let shell = String(decoding: get(handler, "/").body, as: UTF8.self)
        let regex = try NSRegularExpression(pattern: #"/__inlay/(assets/[A-Za-z0-9_.-]+\.js)"#)
        let match = regex.firstMatch(in: shell, range: NSRange(shell.startIndex..., in: shell))
        let assetPath = match.flatMap { Range($0.range(at: 1), in: shell) }.map { String(shell[$0]) }
        let path = try XCTUnwrap(assetPath)
        let r = get(handler, "/__inlay/\(path)")
        XCTAssertEqual(r.status, 200)
        XCTAssertEqual(r.headers["Content-Type"], "text/javascript; charset=utf-8")
        XCTAssertGreaterThan(r.body.count, 100)
        XCTAssertEqual(get(handler, "/__inlay/../index.html").status, 403)
        XCTAssertEqual(get(handler, "/__inlay/nope.js").status, 404)
    }

    @MainActor func testDocumentFolderFilesAndTraversal() {
        let handler = makeHandler()
        let ok = get(handler, "/assets/sample.svg")
        XCTAssertEqual(ok.status, 200)
        XCTAssertEqual(ok.headers["Content-Type"], "image/svg+xml")
        XCTAssertEqual(get(handler, "/gfm-basics.md").status, 200)
        XCTAssertEqual(get(handler, "/../package.json").status, 403)
        XCTAssertEqual(get(handler, "/..%2F..%2Fpackage.json").status, 403)
        XCTAssertEqual(get(handler, "/assets/%2e%2e/%2e%2e/package.json").status, 403)
        XCTAssertEqual(get(handler, "/does-not-exist.png").status, 404)
        XCTAssertEqual(get(handler, "/assets").status, 404, "directories are not listed")
    }

    @MainActor func testUnknownDocumentAndBadRequests() {
        let handler = makeHandler()
        XCTAssertEqual(get(handler, "/", doc: "nobody").status, 404)
        XCTAssertEqual(handler.respond(to: URLRequest(url: URL(string: "https://example.com/")!)).status, 400)
    }
}
