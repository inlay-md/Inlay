// SPDX-License-Identifier: Apache-2.0
import Foundation
@testable import InlayCore
import XCTest

final class RenderEngineTests: XCTestCase {
    func testBundledEngineRendersMarkdown() throws {
        let engine = try RenderEngine.bundled()
        XCTAssertFalse(engine.version.isEmpty)
        let result = try engine.render("# Xin chào\n\nTiếng Việt 🙂 <b>x</b>\n")
        XCTAssertEqual(result.meta.title, "Xin chào")
        XCTAssertEqual(result.meta.lineCount, 4)
        XCTAssertTrue(result.html.contains("Tiếng Việt 🙂 &lt;b&gt;x&lt;/b&gt;"))
        XCTAssertFalse(result.meta.hasScripts)
    }

    func testOptionsReachTheBundle() throws {
        let engine = try RenderEngine.bundled()
        var options = RenderOptions()
        options.mode = .static
        let result = try engine.render("<script>1</script>", options: options)
        XCTAssertTrue(result.html.contains("data-render-mode=\"static\""))
        XCTAssertTrue(result.meta.hasScripts)
    }

    func testEmptyDocument() throws {
        let result = try RenderEngine.bundled().render("")
        XCTAssertEqual(result.meta.lineCount, 0)
        XCTAssertNil(result.meta.title)
    }

    func testEngineIsReusableAcrossThreads() throws {
        let engine = try RenderEngine.bundled()
        let group = DispatchGroup()
        let lock = NSLock()
        var failures = 0
        for i in 0..<16 {
            group.enter()
            DispatchQueue.global().async {
                defer { group.leave() }
                do {
                    let r = try engine.render("# Title \(i)")
                    if r.meta.title != "Title \(i)" { lock.lock(); failures += 1; lock.unlock() }
                } catch {
                    lock.lock(); failures += 1; lock.unlock()
                }
            }
        }
        group.wait()
        XCTAssertEqual(failures, 0)
    }

    func testBrokenBundleThrows() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("broken-\(UUID().uuidString).js")
        try Data("this is not javascript (".utf8).write(to: url)
        XCTAssertThrowsError(try RenderEngine(bundleURL: url))
        let noApi = FileManager.default.temporaryDirectory.appendingPathComponent("noapi-\(UUID().uuidString).js")
        try Data("var x = 1;".utf8).write(to: noApi)
        XCTAssertThrowsError(try RenderEngine(bundleURL: noApi))
    }
}
