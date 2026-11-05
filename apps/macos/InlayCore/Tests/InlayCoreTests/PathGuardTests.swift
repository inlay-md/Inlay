// SPDX-License-Identifier: Apache-2.0
import Foundation
@testable import InlayCore
import XCTest

final class PathGuardTests: XCTestCase {
    private var root: URL!
    private var outside: URL!

    override func setUpWithError() throws {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent("inlay-pathguard-\(UUID().uuidString)")
        root = base.appendingPathComponent("doc")
        outside = base.appendingPathComponent("outside")
        try FileManager.default.createDirectory(at: root.appendingPathComponent("img"), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: outside, withIntermediateDirectories: true)
        try Data("png".utf8).write(to: root.appendingPathComponent("img/a b.png"))
        try Data("secret".utf8).write(to: outside.appendingPathComponent("secret.txt"))
        try FileManager.default.createSymbolicLink(
            at: root.appendingPathComponent("escape"), withDestinationURL: outside)
        try FileManager.default.createSymbolicLink(
            at: root.appendingPathComponent("img/alias.png"), withDestinationURL: root.appendingPathComponent("img/a b.png"))
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root.deletingLastPathComponent())
    }

    func testResolvesFilesInsideRoot() {
        let g = PathGuard(root: root)
        XCTAssertEqual(g.resolve("img/a%20b.png")?.lastPathComponent, "a b.png")
        XCTAssertEqual(g.resolve("./img/../img/a b.png")?.lastPathComponent, "a b.png")
        XCTAssertEqual(g.resolve("img//a b.png")?.lastPathComponent, "a b.png")
        XCTAssertEqual(g.resolve("img/alias.png")?.lastPathComponent, "a b.png", "symlink inside root resolves to its target")
        XCTAssertNotNil(g.resolve("missing.png"), "non-existent paths inside the root resolve (handler answers 404)")
    }

    func testRejectsTraversalAndEscapes() {
        let g = PathGuard(root: root)
        for bad in [
            "../outside/secret.txt",
            "img/../../outside/secret.txt",
            "%2e%2e/outside/secret.txt",
            "..%2Foutside%2Fsecret.txt",
            "/etc/passwd",
            "\\etc\\passwd",
            "",
            ".",
            "img/..",
            "a\u{0}b",
            "escape/secret.txt",
            "escape",
        ] {
            XCTAssertNil(g.resolve(bad), "should reject \(bad)")
        }
    }

    func testRootIsStandardized() {
        let g = PathGuard(root: URL(fileURLWithPath: root.path + "/./img/.."))
        XCTAssertEqual(g.root.path, root.resolvingSymlinksInPath().path)
    }
}
