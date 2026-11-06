// SPDX-License-Identifier: Apache-2.0
@testable import Inlay
import WebKit
import XCTest

/// Saving through the real NSDocument with the live editor as the content source (ADR-0005),
/// the bridge (ADR-0029) and the on-disk conflict (ADR-0030).
final class EditorDocumentTests: XCTestCase {
    private func temporaryCopy(of fixture: String) throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("inlay-editor-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(fixture)
        try FileManager.default.copyItem(at: TestSupport.fixturesDir.appendingPathComponent(fixture), to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return url
    }

    /// Opens a fixture in a document whose window hosts a real editor webview and waits for the editor.
    /// With `wysiwyg` the window starts in WYSIWYG (the page gets `DocumentInfo.mode`, ADR-0033) and the
    /// wait includes the Milkdown document being up.
    @MainActor private func openInEditor(_ url: URL, wysiwyg: Bool = false) async throws -> (MarkdownDocument, EditorWebView) {
        UserDefaults.standard.set(wysiwyg ? ViewMode.wysiwyg.rawValue : ViewMode.source.rawValue, forKey: ViewMode.defaultsKey)
        addTeardownBlock { UserDefaults.standard.removeObject(forKey: ViewMode.defaultsKey) }
        let doc = MarkdownDocument()
        try doc.read(from: url, ofType: MarkdownDocument.markdownType)
        doc.fileURL = url
        doc.makeWindowControllers()
        let controller = try XCTUnwrap(doc.windowControllers.first as? DocumentWindowController)
        XCTAssertEqual(controller.mode, wysiwyg ? .wysiwyg : .source)
        let editor = controller.editorView
        let probe = wysiwyg
            ? "window.inlayEditor && window.inlayWebKitHost && window.inlayEditor.mode === 'wysiwyg' && window.inlayEditor.wysiwygView ? 'ready' : ''"
            : "window.inlayEditor && window.inlayWebKitHost ? 'ready' : ''"
        let ready = try await TestSupport.poll(editor, probe, timeout: 20)
        XCTAssertEqual(ready, "ready", "editor did not come up for \(url.lastPathComponent)")
        return (doc, editor)
    }

    /// Waits until WYSIWYG has verified every block (deferred, ADR-0032).
    @MainActor private func waitForVerification(_ editor: EditorWebView) async throws {
        let verified = try await TestSupport.poll(editor, "window.inlayEditor.stats.wysiwyg && window.inlayEditor.stats.wysiwyg.pending === 0 ? 'yes' : ''", timeout: 20)
        XCTAssertEqual(verified, "yes", "block verification finished")
    }

    @MainActor private func save(_ doc: MarkdownDocument, to url: URL, operation: NSDocument.SaveOperationType = .saveToOperation) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            doc.save(to: url, ofType: MarkdownDocument.markdownType, for: operation) { error in
                if let error { continuation.resume(throwing: error) } else { continuation.resume() }
            }
        }
    }

    /// Polls until the file at `url` satisfies `predicate` (saves triggered through the action methods complete asynchronously).
    @MainActor private func waitForDisk(_ url: URL, timeout: TimeInterval = 10, _ predicate: (Data) -> Bool) async throws -> Data {
        let deadline = Date().addingTimeInterval(timeout)
        var data = (try? Data(contentsOf: url)) ?? Data()
        while !predicate(data) && Date() < deadline {
            try await Task.sleep(for: .milliseconds(100))
            data = (try? Data(contentsOf: url)) ?? Data()
        }
        return data
    }

    @MainActor private func waitForMirror(_ doc: MarkdownDocument, prefix: String) async throws {
        let deadline = Date().addingTimeInterval(5)
        while !doc.text.hasPrefix(prefix) && Date() < deadline {
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTAssertTrue(doc.text.hasPrefix(prefix), "the mirror caught up: \(doc.text.prefix(20))")
    }

    @MainActor func testEveryFixtureSavesByteIdenticalThroughTheLiveEditor() async throws {
        for file in try TestSupport.fixtureFiles() {
            let original = try Data(contentsOf: file)
            let (doc, editor) = try await openInEditor(file)
            defer { doc.close() }
            if doc.decodable {
                let live = try await editor.requestContent()
                XCTAssertEqual(live, doc.text, "the editor holds the decoded text: \(file.lastPathComponent)")
            }
            let out = FileManager.default.temporaryDirectory.appendingPathComponent("inlay-\(UUID().uuidString).md")
            defer { try? FileManager.default.removeItem(at: out) }
            try await save(doc, to: out)
            XCTAssertEqual(try Data(contentsOf: out), original, "bytes differ for \(file.lastPathComponent)")
            XCTAssertFalse(doc.lastSaveUsedMirror, "\(file.lastPathComponent) saved from the mirror")
        }
    }

    @MainActor func testEveryFixtureSavesByteIdenticalThroughWysiwyg() async throws {
        var islandFixtures: [String] = []
        for file in try TestSupport.fixtureFiles() {
            let original = try Data(contentsOf: file)
            let (doc, editor) = try await openInEditor(file, wysiwyg: true)
            defer { doc.close() }
            if doc.decodable {
                try await waitForVerification(editor)
                let live = try await editor.requestContent()
                XCTAssertEqual(live, doc.text, "WYSIWYG splices the decoded text back: \(file.lastPathComponent)")
                if let islands = try await editor.evaluateJavaScript("window.inlayEditor.stats.wysiwyg.islands") as? Int, islands > 0 {
                    islandFixtures.append(file.lastPathComponent)
                }
            }
            let out = FileManager.default.temporaryDirectory.appendingPathComponent("inlay-\(UUID().uuidString).md")
            defer { try? FileManager.default.removeItem(at: out) }
            try await save(doc, to: out)
            XCTAssertEqual(try Data(contentsOf: out), original, "bytes differ for \(file.lastPathComponent)")
            XCTAssertFalse(doc.lastSaveUsedMirror, "\(file.lastPathComponent) saved from the mirror")
        }
        XCTAssertFalse(islandFixtures.contains("gfm-basics.md"), "pure GFM has no islands")
        XCTAssertTrue(islandFixtures.contains("front-matter.md"), "front matter is an island")
    }

    @MainActor func testAWysiwygEditChangesOnlyItsBlockAndSavesThroughTheLiveEditor() async throws {
        let url = try temporaryCopy(of: "gfm-basics.md")
        let original = try Data(contentsOf: url)
        let (doc, editor) = try await openInEditor(url, wysiwyg: true)
        defer { doc.close() }
        // Type at the start of "Final paragraph." through ProseMirror itself.
        _ = try await editor.evaluateJavaScript("(() => { const v = window.inlayEditor.wysiwygView; let pos = -1; v.state.doc.descendants((n, p) => { if (pos < 0 && n.isText && n.text.startsWith('Final paragraph')) pos = p; return pos < 0; }); v.dispatch(v.state.tr.insertText('Ẹdited ', pos)); return pos; })()")
        let edited = try await TestSupport.poll(editor, "window.inlayEditor.isDirty() ? 'yes' : ''")
        XCTAssertEqual(edited, "yes")
        try await Task.sleep(for: .milliseconds(300))
        XCTAssertTrue(doc.isDocumentEdited, "setDirty(true) reached NSDocument")

        doc.save(nil)
        let marker = Data("Final paragraph.".utf8)
        let range = try XCTUnwrap(original.range(of: marker))
        var expected = original
        expected.insert(contentsOf: Data("Ẹdited ".utf8), at: range.lowerBound)
        let saved = try await waitForDisk(url) { $0 == expected }
        XCTAssertEqual(saved, expected, "only the edited block's bytes differ")
        XCTAssertEqual(doc.fileData, saved)
        let clean = try await TestSupport.poll(editor, "window.inlayEditor.isDirty() ? '' : 'clean'")
        XCTAssertEqual(clean, "clean", "documentSaved made WYSIWYG clean again")
    }

    @MainActor func testAnEditChangesOnlyItsBytesAndMarksTheDocumentEdited() async throws {
        let url = try temporaryCopy(of: "mixed-line-endings.md")
        let original = try Data(contentsOf: url)
        let (doc, editor) = try await openInEditor(url)
        defer { doc.close() }
        // Insert at the start of editor line 3 ("Most lines end with CRLF.") through CodeMirror itself.
        _ = try await editor.evaluateJavaScript("(() => { const v = window.inlayEditor.view; const from = v.state.doc.line(3).from; v.dispatch({ changes: { from, insert: 'Ẹdited ' } }); return true; })()")
        let edited = try await TestSupport.poll(editor, "window.inlayEditor.isDirty() ? 'yes' : ''")
        XCTAssertEqual(edited, "yes")
        let dirty = try await TestSupport.poll(editor, "'x'") // one more hop so the setDirty message lands
        XCTAssertEqual(dirty, "x")
        try await Task.sleep(for: .milliseconds(200))
        XCTAssertTrue(doc.isDocumentEdited, "setDirty(true) reached NSDocument")

        // The real Save action: pulls the live text (the mirror may not have caught up), then writes.
        doc.save(nil)
        let marker = Data("Most lines end with CRLF.".utf8)
        let range = try XCTUnwrap(original.range(of: marker))
        var expected = original
        expected.insert(contentsOf: Data("Ẹdited ".utf8), at: range.lowerBound)
        let saved = try await waitForDisk(url) { $0 == expected }
        XCTAssertEqual(saved, expected, "only the inserted bytes differ; CRLF, LF and CR all survive")
        XCTAssertEqual(doc.fileData, saved, "the document knows what it wrote")
        XCTAssertFalse(doc.reloadIfChangedOnDisk(), "our own save is not an external change")
        let clean = try await TestSupport.poll(editor, "window.inlayEditor.isDirty() ? '' : 'clean'")
        XCTAssertEqual(clean, "clean", "documentSaved made the editor clean again")
    }

    @MainActor func testUndecodableDocumentsStayByteIdenticalAndReadOnly() async throws {
        let file = TestSupport.fixturesDir.appendingPathComponent("undecodable.md")
        let (doc, editor) = try await openInEditor(file)
        defer { doc.close() }
        XCTAssertFalse(doc.decodable)
        let readOnly = try await editor.evaluateJavaScript("window.inlayEditor.view.state.readOnly") as? Bool
        XCTAssertEqual(readOnly, true)
        let out = FileManager.default.temporaryDirectory.appendingPathComponent("inlay-\(UUID().uuidString).md")
        defer { try? FileManager.default.removeItem(at: out) }
        try await save(doc, to: out)
        XCTAssertEqual(try Data(contentsOf: out), try Data(contentsOf: file))
    }

    @MainActor func testSaveFallsBackToTheMirrorWhenTheEditorDoesNotAnswer() async throws {
        let url = try temporaryCopy(of: "gfm-basics.md")
        let doc = MarkdownDocument()
        try doc.read(from: url, ofType: MarkdownDocument.markdownType)
        doc.fileURL = url
        defer { doc.close() }
        var warned = false
        doc.onSavedFromMirror = { warned = true }
        doc.liveContentSource = { throw EditorWebView.EditorError.notResponsive }
        doc.updateChangeCount(.changeDone)
        let original = try Data(contentsOf: url)
        try Data("stale".utf8).write(to: url) // so the save visibly writes
        doc.save(nil)
        let saved = try await waitForDisk(url) { $0 == original }
        XCTAssertEqual(saved, original, "the mirror is the last known text")
        XCTAssertTrue(warned, "the window is told the save came from the mirror")
        XCTAssertFalse(doc.lastSaveUsedMirror, "flag consumed by the warning")
    }

    @MainActor func testAutosaveSaveAsAndRevertGoThroughTheLiveEditor() async throws {
        let url = try temporaryCopy(of: "gfm-basics.md")
        let (doc, editor) = try await openInEditor(url)
        defer { doc.close() }
        _ = try await editor.evaluateJavaScript("(() => { const v = window.inlayEditor.view; v.dispatch({ changes: { from: 0, insert: 'AUTOSAVED ' } }); return true; })()")
        _ = try await TestSupport.poll(editor, "window.inlayEditor.isDirty() ? 'yes' : ''")
        try await waitForMirror(doc, prefix: "AUTOSAVED ")
        XCTAssertTrue(doc.isDocumentEdited)

        // Autosave in place writes the mirror (≤ 0.5 s behind); the editor's clean baseline moves only on Save / Save As.
        try await save(doc, to: url, operation: .autosaveInPlaceOperation)
        XCTAssertTrue(String(decoding: try Data(contentsOf: url), as: UTF8.self).hasPrefix("AUTOSAVED # GFM basics"))
        XCTAssertEqual(doc.fileData, try Data(contentsOf: url), "the document knows the bytes it autosaved")
        XCTAssertFalse(doc.reloadIfChangedOnDisk(), "the autosave is not an external change")
        let stillDirty = try await editor.evaluateJavaScript("window.inlayEditor.isDirty()") as? Bool
        XCTAssertEqual(stillDirty, true)

        // Save As to a new URL moves the document there and cleans it.
        let other = url.deletingLastPathComponent().appendingPathComponent("renamed.md")
        try await save(doc, to: other, operation: .saveAsOperation)
        XCTAssertEqual(doc.fileURL, other)
        XCTAssertTrue(String(decoding: try Data(contentsOf: other), as: UTF8.self).hasPrefix("AUTOSAVED # GFM basics"))
        let clean = try await TestSupport.poll(editor, "window.inlayEditor.isDirty() ? '' : 'clean'")
        XCTAssertEqual(clean, "clean")

        // Revert reloads the disk bytes into the document and the editor.
        try Data("# Reverted\n".utf8).write(to: other)
        try doc.revert(toContentsOf: other, ofType: MarkdownDocument.markdownType)
        XCTAssertEqual(doc.text, "# Reverted\n")
        let reverted = try await TestSupport.poll(editor, "window.inlayEditor.getContent() === '# Reverted\\n' ? 'yes' : ''")
        XCTAssertEqual(reverted, "yes")
    }

    @MainActor func testExternalChangeWithUnsavedEditsRaisesAConflictInsteadOfOverwriting() async throws {
        let url = try temporaryCopy(of: "gfm-basics.md")
        let (doc, editor) = try await openInEditor(url)
        defer { doc.close() }
        _ = try await editor.evaluateJavaScript("(() => { window.inlayEditor.view.dispatch({ changes: { from: 0, insert: 'MINE ' } }); return true; })()")
        _ = try await TestSupport.poll(editor, "window.inlayEditor.isDirty() ? 'yes' : ''")
        try await Task.sleep(for: .milliseconds(200))
        XCTAssertTrue(doc.isDocumentEdited)
        var conflictChanges = 0
        doc.onConflictChanged = { conflictChanges += 1 }

        try Data("# Theirs\n".utf8).write(to: url)
        XCTAssertFalse(doc.reloadIfChangedOnDisk())
        XCTAssertTrue(doc.hasConflict)
        XCTAssertEqual(conflictChanges, 1)
        XCTAssertFalse(doc.text.hasPrefix("# Theirs"), "the edits were not overwritten")
        let mine = try await editor.evaluateJavaScript("window.inlayEditor.getContent().startsWith('MINE ')") as? Bool
        XCTAssertEqual(mine, true)
        XCTAssertFalse(doc.reloadIfChangedOnDisk(), "repeated notifications do not re-raise")
        XCTAssertEqual(conflictChanges, 1)

        doc.resolveConflictByReloading()
        XCTAssertFalse(doc.hasConflict)
        XCTAssertFalse(doc.isDocumentEdited)
        XCTAssertEqual(doc.text, "# Theirs\n")
        let theirs = try await TestSupport.poll(editor, "window.inlayEditor.getContent() === '# Theirs\\n' ? 'yes' : ''")
        XCTAssertEqual(theirs, "yes")
    }

    @MainActor func testBridgeDispatchAndEditorPageIsolation() async throws {
        let url = try temporaryCopy(of: "crlf.md")
        let (doc, editor) = try await openInEditor(url)
        defer { doc.close() }
        let info = try XCTUnwrap(try editor.bridge.handle(["method": "openDocument", "args": []]) as? [String: Any])
        XCTAssertEqual(info["eol"] as? String, "\r\n")
        XCTAssertEqual(info["baseURL"] as? String, "mdview://\(doc.docId)/")
        XCTAssertEqual(info["readOnly"] as? Bool, false)
        XCTAssertThrowsError(try editor.bridge.handle(["method": "nope", "args": []]))
        XCTAssertThrowsError(try editor.bridge.handle(["method": "readFile", "args": ["../outside.md"]]))
        XCTAssertTrue(editor.bridge.receivedMethods.contains("openDocument"))

        let handler = MDViewSchemeHandler()
        let page = handler.respond(to: URLRequest(url: editor.pageURL))
        XCTAssertEqual(page.status, 200)
        let csp = page.headers["Content-Security-Policy"] ?? ""
        XCTAssertTrue(csp.contains("script-src mdview:"), csp)
        XCTAssertFalse(csp.contains("unsafe-inline' mdview: https"), "no CDN, no inline scripts on the editor page")
        XCTAssertTrue(csp.contains("connect-src 'none'"))
        XCTAssertFalse(String(decoding: page.body, as: UTF8.self).contains("inlay-source"), "nothing embedded")
        XCTAssertEqual(handler.respond(to: URLRequest(url: URL(string: "mdview://\(doc.docId)/__inlay/editor/../../etc/passwd")!)).status, 403)

        // The Read webview keeps zero message handlers; only the editor sees the bridge.
        let readView = ReadWebView(docId: doc.docId)
        readView.loadDocument()
        let noBridge = try await TestSupport.poll(readView, "document.getElementById('inlay-root') ? String(typeof (window.webkit && window.webkit.messageHandlers)) : ''")
        XCTAssertEqual(noBridge, "undefined")
        let bridged = try await editor.evaluateJavaScript("typeof window.webkit.messageHandlers.inlay.postMessage") as? String
        XCTAssertEqual(bridged, "function")

        XCTAssertEqual(editor.policy(for: editor.pageURL, isMainFrame: true), .allow)
        XCTAssertEqual(editor.policy(for: URL(string: "mdview://\(doc.docId)/")!, isMainFrame: true), .cancel)
        XCTAssertEqual(editor.policy(for: URL(string: "mdview://\(doc.docId)/img.png")!, isMainFrame: false), .allow)
        XCTAssertEqual(editor.policy(for: URL(string: "https://inlay.live")!, isMainFrame: true), .openExternal)
        XCTAssertEqual(MarkdownDocument.detectEol("a\r\nb\nc\r\n"), "\r\n")
        XCTAssertEqual(MarkdownDocument.detectEol("a\rb\rc"), "\r")
        XCTAssertEqual(MarkdownDocument.detectEol("plain"), "\n")
    }

    @MainActor func testDuplicateAndAutosaveCarryTheLiveEditorText() async throws {
        let url = try temporaryCopy(of: "crlf.md")
        let (doc, editor) = try await openInEditor(url)
        defer { doc.close() }
        _ = try await editor.evaluateJavaScript("(() => { window.inlayEditor.view.dispatch({ changes: { from: 0, insert: 'DUP ' } }); return true; })()")
        _ = try await TestSupport.poll(editor, "window.inlayEditor.isDirty() ? 'yes' : ''")
        try await Task.sleep(for: .milliseconds(200))
        XCTAssertFalse(doc.text.hasPrefix("DUP "), "the mirror has not caught up yet; the pull must")

        let before = Set(NSDocumentController.shared.documents.map { ObjectIdentifier($0) })
        doc.duplicate(nil)
        let deadline = Date().addingTimeInterval(10)
        var copy: MarkdownDocument?
        while copy == nil && Date() < deadline {
            try await Task.sleep(for: .milliseconds(100))
            copy = NSDocumentController.shared.documents.first { !before.contains(ObjectIdentifier($0)) } as? MarkdownDocument
        }
        let duplicate = try XCTUnwrap(copy, "Duplicate produced a new document")
        defer { duplicate.close() }
        XCTAssertNil(duplicate.fileURL, "a duplicate is a new untitled document")
        XCTAssertTrue(duplicate.text.hasPrefix("DUP # CRLF file"), "the duplicate holds the live editor text: \(duplicate.text.prefix(30))")
        XCTAssertEqual(MarkdownDocument.detectEol(duplicate.text), "\r\n")
        XCTAssertEqual(try Data(contentsOf: url), try Data(contentsOf: TestSupport.fixturesDir.appendingPathComponent("crlf.md")), "the original file is untouched")

        // The real autosave entry point goes through the save funnel and writes the live text in place.
        _ = try await editor.evaluateJavaScript("(() => { window.inlayEditor.view.dispatch({ changes: { from: 0, insert: 'AUTO ' } }); return true; })()")
        try await waitForMirror(doc, prefix: "AUTO DUP ")
        try await MarkdownDocument.withTimeout(.seconds(10)) { @MainActor in
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                doc.autosave(withImplicitCancellability: false) { error in
                    if let error { continuation.resume(throwing: error) } else { continuation.resume() }
                }
            }
        }
        XCTAssertTrue(String(decoding: try Data(contentsOf: url), as: UTF8.self).hasPrefix("AUTO DUP # CRLF file"))
        XCTAssertEqual(doc.fileData, try Data(contentsOf: url))
    }
}
