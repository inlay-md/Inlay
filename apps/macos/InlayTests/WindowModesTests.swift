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
        let window = try XCTUnwrap(controller.window)
        // On screen, as in real use. A window that is never ordered in leaves both pages hidden
        // (document.visibilityState "hidden"), and WebKit throttles hidden pages: on a busy machine the
        // Split re-render of the 10k-line edit then missed its 10 s window (2 of 10 runs locally, under
        // load), and CI failed at random at different steps of the Split test.
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1000, height: 700)
        window.setFrame(NSRect(x: screen.minX, y: screen.minY, width: 1000, height: 700), display: true)
        window.orderFrontRegardless()
        _ = try await TestSupport.poll(controller.editorView, "window.inlayEditor ? 'ready' : ''", timeout: 15)
        _ = try await TestSupport.poll(controller.readView, "window.inlayReadView ? 'ready' : ''", timeout: 15)
        // Not asserted (a runner without a usable display would fail every test); reported in failure messages.
        _ = try await TestSupport.poll(controller.editorView, "document.visibilityState === 'visible' ? 'yes' : ''", timeout: 5)
        _ = try await TestSupport.poll(controller.readView, "document.visibilityState === 'visible' ? 'yes' : ''", timeout: 5)
        return (doc, controller)
    }

    /// `document.visibilityState` of both panes, for failure messages.
    @MainActor private func visibility(_ controller: DocumentWindowController) async -> String {
        let editor = (try? await controller.editorView.evaluateJavaScript("document.visibilityState") as? String) ?? "?"
        let read = (try? await controller.readView.evaluateJavaScript("document.visibilityState") as? String) ?? "?"
        return "editor page \(editor), read page \(read)"
    }

    /// Mode switches finish asynchronously (positions are pulled from the webviews first).
    @MainActor private func settle(_ controller: DocumentWindowController, mode: ViewMode) async throws {
        let deadline = Date().addingTimeInterval(10)
        while controller.mode != mode && Date() < deadline {
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertEqual(controller.mode, mode)
        try await Task.sleep(for: .milliseconds(200))
    }

    @MainActor func testModesShowTheRightPanesAndRemember() async throws {
        let (doc, controller) = try await open(try temporaryCopy(of: "gfm-basics.md"))
        defer { doc.close() }
        XCTAssertEqual(controller.mode, .read)
        XCTAssertTrue(controller.sourceItem.isCollapsed, "source pane collapsed in Read")
        XCTAssertFalse(controller.readItem.isCollapsed)
        XCTAssertTrue(controller.sourceHeader.isHidden)
        controller.window?.layoutIfNeeded()
        XCTAssertGreaterThan(controller.readView.frame.width, 900, "the Read pane fills the window")

        controller.setMode(.source)
        try await settle(controller, mode: .source)
        XCTAssertFalse(controller.sourceItem.isCollapsed)
        XCTAssertTrue(controller.readItem.isCollapsed)
        controller.window?.layoutIfNeeded()
        XCTAssertGreaterThan(controller.editorView.frame.width, 900, "the Source pane fills the window")
        XCTAssertEqual(UserDefaults.standard.string(forKey: ViewMode.defaultsKey), "source")

        controller.setMode(.split)
        try await settle(controller, mode: .split)
        XCTAssertFalse(controller.sourceItem.isCollapsed)
        XCTAssertFalse(controller.readItem.isCollapsed)
        controller.window?.layoutIfNeeded()
        XCTAssertGreaterThan(controller.editorView.frame.width, 300, "both panes share the window")
        XCTAssertGreaterThan(controller.readView.frame.width, 300)
        XCTAssertFalse(controller.sourceHeader.isHidden, "pane headers only in Split")
        XCTAssertFalse(controller.readHeader.isHidden)
        XCTAssertEqual(controller.readHeader.detail, "scroll synced")

        // Menu validation reflects the mode.
        let item = NSMenuItem(title: "Split", action: #selector(DocumentWindowController.showSplitMode(_:)), keyEquivalent: "")
        XCTAssertTrue(controller.validateMenuItem(item))
        XCTAssertEqual(item.state, .on)
        controller.showReadMode(nil)
        try await settle(controller, mode: .read)
        UserDefaults.standard.removeObject(forKey: ViewMode.defaultsKey)
    }

    @MainActor func testWysiwygModeShowsTheEditorPaneAndSwitchesThePage() async throws {
        let (doc, controller) = try await open(try temporaryCopy(of: "gfm-basics.md"))
        defer { doc.close() }
        XCTAssertEqual(doc.editorStartMode, "source")
        controller.setMode(.wysiwyg)
        try await settle(controller, mode: .wysiwyg)
        XCTAssertFalse(controller.sourceItem.isCollapsed)
        XCTAssertTrue(controller.readItem.isCollapsed)
        XCTAssertEqual(doc.editorStartMode, "wysiwyg", "a reloaded page would start in WYSIWYG")
        let pageMode = try await TestSupport.poll(controller.editorView, "window.inlayEditor.mode === 'wysiwyg' && window.inlayEditor.wysiwygView ? 'wysiwyg' : ''", timeout: 15)
        XCTAssertEqual(pageMode, "wysiwyg")
        let item = NSMenuItem(title: "WYSIWYG", action: #selector(DocumentWindowController.showWysiwygMode(_:)), keyEquivalent: "")
        XCTAssertTrue(controller.validateMenuItem(item))
        XCTAssertEqual(item.state, .on)
        let refresh = NSMenuItem(title: "Refresh", action: #selector(DocumentWindowController.refreshReadView(_:)), keyEquivalent: "")
        XCTAssertFalse(controller.validateMenuItem(refresh), "no Read pane to refresh")
        XCTAssertEqual(DocumentWindowController.segmentIndex(of: .wysiwyg), 1)

        // Back to Source: the page switches too; a caret line set in Source survives the switch back.
        controller.setMode(.source)
        try await settle(controller, mode: .source)
        let back = try await TestSupport.poll(controller.editorView, "window.inlayEditor.mode === 'source' ? 'source' : ''")
        XCTAssertEqual(back, "source")
        _ = try await controller.editorView.evaluateJavaScript("window.inlayEditor.setCursorSourceLine(30); true")
        controller.setMode(.wysiwyg)
        try await settle(controller, mode: .wysiwyg)
        let carried = try await TestSupport.poll(controller.editorView, "(() => { const p = window.inlayEditor.getPosition(); return p.cursorLine === 30 ? 'yes' : ''; })()")
        XCTAssertEqual(carried, "yes", "the caret line survives Source → WYSIWYG")
        // Read takes over at the WYSIWYG viewport's top line (at or above the caret's line 30).
        controller.setMode(.read)
        try await settle(controller, mode: .read)
        XCTAssertTrue(controller.sourceItem.isCollapsed)
        XCTAssertFalse(controller.readItem.isCollapsed)
        XCTAssertGreaterThanOrEqual(controller.syncedLine, 1)
        XCTAssertLessThanOrEqual(controller.syncedLine, 30)
        UserDefaults.standard.removeObject(forKey: ViewMode.defaultsKey)
    }

    @MainActor func testSwitchingModesCarriesTheSourceLineOver() async throws {
        let (doc, controller) = try await open(try temporaryCopy(of: "perf-10k-lines.md"))
        defer { doc.close() }
        controller.setMode(.source)
        try await settle(controller, mode: .source)
        _ = try await controller.editorView.evaluateJavaScript("window.inlayEditor.setCursorSourceLine(4000); window.inlayEditor.scrollToSourceLine(4000); true")
        // CodeMirror applies the scroll on its next measure cycle; the CI runner takes a while to get there.
        let editorLine = try await TestSupport.poll(controller.editorView, "(() => { const l = window.inlayEditor.getPosition().line; return l >= 3990 ? String(l) : ''; })()", timeout: 15)
        XCTAssertFalse(editorLine.isEmpty, "editor scrolled to line 4000")

        controller.setMode(.read)
        let readLine = try await TestSupport.poll(controller.readView, "(() => { const l = window.inlayReadView.getPosition().line; return l > 3900 ? String(l) : ''; })()")
        XCTAssertFalse(readLine.isEmpty, "Read view scrolled to the editor's line")

        _ = try await controller.readView.evaluateJavaScript("window.inlayReadView.scrollToSourceLine(8000)")
        let readAt = try await TestSupport.poll(controller.readView, "(() => { const l = window.inlayReadView.getPosition().line; return l > 7900 ? String(l) : ''; })()")
        XCTAssertFalse(readAt.isEmpty, "Read view scrolled to line 8000")
        try await settle(controller, mode: .read)
        controller.setMode(.source)
        let back = try await TestSupport.poll(controller.editorView, "(() => { const p = window.inlayEditor.getPosition(); return p.cursorLine > 7900 ? String(p.cursorLine) : ''; })()")
        XCTAssertFalse(back.isEmpty, "editor cursor moved to the Read view's line")
        UserDefaults.standard.removeObject(forKey: ViewMode.defaultsKey)
    }

    @MainActor func testSplitReRendersEditsAndFollowsTheEditor() async throws {
        let (doc, controller) = try await open(try temporaryCopy(of: "perf-10k-lines.md"))
        // Also on the early returns below: the saved mode must not leak into other tests.
        defer {
            doc.close()
            UserDefaults.standard.removeObject(forKey: ViewMode.defaultsKey)
        }
        controller.setMode(.split)
        try await settle(controller, mode: .split)
        // An edit at the top reaches the Read pane through the debounced live-content pull.
        _ = try await controller.editorView.evaluateJavaScript("window.inlayEditor.view.dispatch({ changes: { from: 0, insert: '# Live heading\\n\\n' } }); true")
        let heading = try await TestSupport.poll(controller.readView, "document.querySelector('#inlay-root h1') && document.querySelector('#inlay-root h1').textContent === 'Live heading' ? 'yes' : ''", timeout: 10)
        if heading != "yes" {
            let pages = await visibility(controller)
            XCTFail("Read pane did not re-render the edit (mirror updated: \(doc.text.hasPrefix("# Live heading")); \(pages))")
            return
        }
        XCTAssertTrue(doc.text.hasPrefix("# Live heading"), "the mirror followed the editor")
        XCTAssertTrue(doc.isDocumentEdited)

        // Scrolling the editor scrolls the Read pane (source → read). Two steps, so a failure says which side stalled.
        _ = try await controller.editorView.evaluateJavaScript("window.inlayEditor.scrollToSourceLine(6000); true")
        let editorLine = try await TestSupport.poll(controller.editorView, "(() => { const l = window.inlayEditor.getPosition().line; return l > 5900 ? String(l) : ''; })()", timeout: 15)
        if editorLine.isEmpty {
            let pages = await visibility(controller)
            XCTFail("editor did not scroll to line 6000 (\(pages))")
            return
        }
        let followed = try await TestSupport.poll(controller.readView, "(() => { const l = window.inlayReadView.getPosition().line; return l > 5900 ? String(l) : ''; })()", timeout: 15)
        if followed.isEmpty {
            let readLine = (try? await controller.readView.evaluateJavaScript("String(window.inlayReadView.getPosition().line)") as? String) ?? "?"
            let pages = await visibility(controller)
            XCTFail("Read pane did not follow the editor's top line \(editorLine): it is at \(readLine), native last synced \(controller.syncedLine) (\(pages))")
        }
        XCTAssertNotNil(controller.splitView.syncFraction)
        XCTAssertTrue(controller.sourceHeader.detail.hasPrefix("Ln "), controller.sourceHeader.detail)
    }

    @MainActor func testConflictBannerAppearsAndItsButtonsResolveIt() async throws {
        let url = try temporaryCopy(of: "gfm-basics.md")
        let (doc, controller) = try await open(url)
        defer { doc.close() }
        XCTAssertTrue(controller.conflictBanner.isHidden)
        _ = try await controller.editorView.evaluateJavaScript("window.inlayEditor.view.dispatch({ changes: { from: 0, insert: 'MINE ' } }); true")
        _ = try await TestSupport.poll(controller.editorView, "window.inlayEditor.isDirty() ? 'yes' : ''")
        // The change count and the mirror both arrive over the bridge (debounced); wait for them.
        let editedDeadline = Date().addingTimeInterval(5)
        while !(doc.isDocumentEdited && doc.text.hasPrefix("MINE ")) && Date() < editedDeadline {
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertTrue(doc.isDocumentEdited)
        XCTAssertTrue(doc.text.hasPrefix("MINE "), "the mirror caught up")

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
