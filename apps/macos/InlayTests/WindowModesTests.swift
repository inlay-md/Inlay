// SPDX-License-Identifier: Apache-2.0
@testable import Inlay
import WebKit
import XCTest

/// Read / Source / Split in one window: pane visibility, position carry-over, Split re-render and
/// scroll sync (ADR-0010), the conflict banner (ADR-0030).
final class WindowModesTests: XCTestCase {
    private func temporaryCopy(of fixture: String) throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("inlay-modes-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(fixture)
        try FileManager.default.copyItem(at: TestSupport.fixturesDir.appendingPathComponent(fixture), to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return url
    }

    @MainActor private func open(_ url: URL) async throws -> (MarkdownDocument, DocumentWindowController) {
        UserDefaults.standard.removeObject(forKey: ViewMode.defaultsKey)
        let doc = MarkdownDocument()
        try doc.read(from: url, ofType: MarkdownDocument.markdownType)
        doc.fileURL = url
        doc.makeWindowControllers()
        let controller = try XCTUnwrap(doc.windowControllers.first as? DocumentWindowController)
        controller.window?.setFrame(NSRect(x: 0, y: 0, width: 1000, height: 700), display: false)
        _ = try await TestSupport.poll(controller.editorView, "window.inlayEditor ? 'ready' : ''", timeout: 15)
        _ = try await TestSupport.poll(controller.readView, "window.inlayReadView ? 'ready' : ''", timeout: 15)
        return (doc, controller)
    }

    @MainActor private func settle() async throws {
        try await Task.sleep(for: .milliseconds(400))
    }

    @MainActor func testModesShowTheRightPanesAndRemember() async throws {
        let (doc, controller) = try await open(try temporaryCopy(of: "gfm-basics.md"))
        defer { doc.close() }
        XCTAssertEqual(controller.mode, .read)
        XCTAssertTrue(controller.editorView.superview?.isHidden ?? false, "source pane hidden in Read")
        XCTAssertFalse(controller.readView.superview?.isHidden ?? true)
        XCTAssertTrue(controller.sourceHeader.isHidden)

        controller.setMode(.source)
        try await settle()
        XCTAssertEqual(controller.mode, .source)
        XCTAssertFalse(controller.editorView.superview?.isHidden ?? true)
        XCTAssertTrue(controller.readView.superview?.isHidden ?? false)
        XCTAssertEqual(UserDefaults.standard.string(forKey: ViewMode.defaultsKey), "source")

        controller.setMode(.split)
        try await settle()
        XCTAssertFalse(controller.editorView.superview?.isHidden ?? true)
        XCTAssertFalse(controller.readView.superview?.isHidden ?? true)
        XCTAssertFalse(controller.sourceHeader.isHidden, "pane headers only in Split")
        XCTAssertFalse(controller.readHeader.isHidden)
        XCTAssertEqual(controller.readHeader.detail, "scroll synced")

        // Menu validation reflects the mode.
        let item = NSMenuItem(title: "Split", action: #selector(DocumentWindowController.showSplitMode(_:)), keyEquivalent: "")
        XCTAssertTrue(controller.validateMenuItem(item))
        XCTAssertEqual(item.state, .on)
        controller.showReadMode(nil)
        try await settle()
        XCTAssertEqual(controller.mode, .read)
        UserDefaults.standard.removeObject(forKey: ViewMode.defaultsKey)
    }

    @MainActor func testSwitchingModesCarriesTheSourceLineOver() async throws {
        let (doc, controller) = try await open(try temporaryCopy(of: "perf-10k-lines.md"))
        defer { doc.close() }
        controller.setMode(.source)
        try await settle()
        _ = try await controller.editorView.evaluateJavaScript("window.inlayEditor.setCursorSourceLine(4000); window.inlayEditor.scrollToSourceLine(4000); true")
        try await settle()
        let editorLine = await controller.editorView.position()?.line ?? 0
        XCTAssertGreaterThanOrEqual(editorLine, 3990)

        controller.setMode(.read)
        let readLine = try await TestSupport.poll(controller.readView, "(() => { const l = window.inlayReadView.getPosition().line; return l > 3900 ? String(l) : ''; })()")
        XCTAssertFalse(readLine.isEmpty, "Read view scrolled to the editor's line")

        _ = try await controller.readView.evaluateJavaScript("window.inlayReadView.scrollToSourceLine(8000)")
        try await settle()
        controller.setMode(.source)
        let back = try await TestSupport.poll(controller.editorView, "(() => { const p = window.inlayEditor.getPosition(); return p.cursorLine > 7900 ? String(p.cursorLine) : ''; })()")
        XCTAssertFalse(back.isEmpty, "editor cursor moved to the Read view's line")
        UserDefaults.standard.removeObject(forKey: ViewMode.defaultsKey)
    }

    @MainActor func testSplitReRendersEditsAndFollowsTheEditor() async throws {
        let (doc, controller) = try await open(try temporaryCopy(of: "perf-10k-lines.md"))
        defer { doc.close() }
        controller.setMode(.split)
        try await settle()
        // An edit at the top reaches the Read pane through the debounced live-content pull.
        _ = try await controller.editorView.evaluateJavaScript("window.inlayEditor.view.dispatch({ changes: { from: 0, insert: '# Live heading\\n\\n' } }); true")
        let heading = try await TestSupport.poll(controller.readView, "document.querySelector('#inlay-root h1') && document.querySelector('#inlay-root h1').textContent === 'Live heading' ? 'yes' : ''", timeout: 10)
        XCTAssertEqual(heading, "yes")
        XCTAssertTrue(doc.text.hasPrefix("# Live heading"), "the mirror followed the editor")
        XCTAssertTrue(doc.isDocumentEdited)

        // Scrolling the editor scrolls the Read pane (source → read).
        _ = try await controller.editorView.evaluateJavaScript("window.inlayEditor.scrollToSourceLine(6000); true")
        let followed = try await TestSupport.poll(controller.readView, "(() => { const l = window.inlayReadView.getPosition().line; return l > 5900 ? String(l) : ''; })()", timeout: 10)
        XCTAssertFalse(followed.isEmpty, "Read pane followed the editor's top line")
        XCTAssertNotNil(controller.splitView.syncFraction)
        XCTAssertTrue(controller.sourceHeader.detail.hasPrefix("Ln "), controller.sourceHeader.detail)
        UserDefaults.standard.removeObject(forKey: ViewMode.defaultsKey)
    }

    @MainActor func testConflictBannerAppearsAndItsButtonsResolveIt() async throws {
        let url = try temporaryCopy(of: "gfm-basics.md")
        let (doc, controller) = try await open(url)
        defer { doc.close() }
        XCTAssertTrue(controller.conflictBanner.isHidden)
        _ = try await controller.editorView.evaluateJavaScript("window.inlayEditor.view.dispatch({ changes: { from: 0, insert: 'MINE ' } }); true")
        _ = try await TestSupport.poll(controller.editorView, "window.inlayEditor.isDirty() ? 'yes' : ''")
        try await settle()
        XCTAssertTrue(doc.isDocumentEdited)

        try Data("# Theirs\n".utf8).write(to: url)
        let deadline = Date().addingTimeInterval(5)
        while controller.conflictBanner.isHidden && Date() < deadline {
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertFalse(controller.conflictBanner.isHidden, "the watcher raised the conflict banner")
        XCTAssertTrue(doc.hasConflict)
        XCTAssertTrue(doc.text.hasPrefix("MINE "), "edits kept")

        controller.conflictBanner.onKeep?()
        XCTAssertTrue(controller.conflictBanner.isHidden)
        XCTAssertTrue(doc.isDocumentEdited)
        XCTAssertTrue(doc.text.hasPrefix("MINE "))

        // Raise it again and reload from disk this time.
        try Data("# Theirs 2\n".utf8).write(to: url)
        XCTAssertFalse(doc.reloadIfChangedOnDisk())
        XCTAssertFalse(controller.conflictBanner.isHidden)
        controller.conflictBanner.onReload?()
        XCTAssertTrue(controller.conflictBanner.isHidden)
        XCTAssertFalse(doc.isDocumentEdited)
        XCTAssertEqual(doc.text, "# Theirs 2\n")
        let reloaded = try await TestSupport.poll(controller.editorView, "window.inlayEditor.getContent() === '# Theirs 2\\n' ? 'yes' : ''")
        XCTAssertEqual(reloaded, "yes")
        UserDefaults.standard.removeObject(forKey: ViewMode.defaultsKey)
    }
}
