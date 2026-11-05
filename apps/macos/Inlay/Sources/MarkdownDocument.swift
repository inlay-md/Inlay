// SPDX-License-Identifier: Apache-2.0
import AppKit
import InlayCore
import UniformTypeIdentifiers

/// Lets exactly one of several racing tasks win (see `MarkdownDocument.withTimeout`).
final class ResumeOnce: @unchecked Sendable {
    private let lock = NSLock()
    private var claimed = false

    func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if claimed { return false }
        claimed = true
        return true
    }
}

/// NSDocument for Markdown files. The bytes read from disk (`fileData`) are the source of
/// truth for change detection; `text` is the live document: the decoded file until the editor
/// edits it, then whatever the editor last handed over. Saves pull the live text from the
/// editor first (ADR-0005); `text` doubles as the crash mirror. The document also owns the
/// Read view's trust state (quarantine, network), file watching and the on-disk conflict.
final class MarkdownDocument: NSDocument, EditorHostDelegate {
    static let markdownType = "net.daringfireball.markdown"
    /// How long a save waits for the editor before falling back to the mirror.
    static let liveContentTimeout: Duration = .seconds(3)

    let docId = UUID().uuidString.lowercased()
    /// The bytes on disk as last read or written by this document.
    private(set) var fileData = Data()
    /// Live text (editor content after edits; the mirror for saves when the editor is gone).
    private(set) var text = ""
    private(set) var hasBOM = false
    private(set) var decodable = true
    /// The file carries `com.apple.quarantine`; its value participates in the trust identity.
    private(set) var quarantineValue: String?
    private(set) var allowNetwork = false
    /// The file changed on disk while there were unsaved edits (ADR-0030).
    private(set) var hasConflict = false
    /// The last save could not reach the editor and wrote the mirror instead (ADR-0005).
    private(set) var lastSaveUsedMirror = false
    private var watcher: FileWatcher?
    private var mirrorTask: Task<Void, Never>?
    private var lastEncoded: Data?
    private var trustStore: TrustStore { TrustStore.shared }

    /// Supplies the live editor text. Set by the window controller once the editor webview exists.
    var liveContentSource: (@MainActor () async throws -> String)?

    /// The text changed from outside the editor (disk reload, revert): every view must reload it.
    var onContentChanged: (() -> Void)?
    /// The editor's live text changed (debounced): the Read view may re-render in Split mode.
    var onLiveContentChanged: (() -> Void)?
    /// Trust or network state changed and the Read view must reload with a new policy.
    var onPolicyChanged: (() -> Void)?
    var onConflictChanged: (() -> Void)?
    /// A save wrote from the mirror because the editor did not answer.
    var onSavedFromMirror: (() -> Void)?
    /// A save succeeded (Save / Save As / autosave in place).
    var onSaved: ((NSDocument.SaveOperationType) -> Void)?
    var onModeRequested: ((String) -> Void)?
    /// Editing mode the editor page starts in (`DocumentInfo.mode`, ADR-0033); the window keeps it current.
    var editorStartMode = "source"
    var onPositionReported: ((_ line: Int, _ cursorLine: Int, _ cursorColumn: Int) -> Void)?

    var isQuarantined: Bool { quarantineValue != nil }

    /// Quarantined and not yet trusted by the user: scripts stay off (static rendering).
    var isUntrusted: Bool {
        guard let quarantineValue, let path = fileURL?.path else { return false }
        return !trustStore.isTrusted(path: path, quarantineValue: quarantineValue)
    }

    /// Dominant line ending of the text (ties resolve to CRLF, then LF), as the web core's `detectEol`.
    static func detectEol(_ text: String) -> String {
        var crlf = 0, lf = 0, cr = 0
        var previous: UInt8 = 0
        for byte in text.utf8 {
            if byte == 10 {
                if previous == 13 { crlf += 1 } else { lf += 1 }
            } else if previous == 13 {
                cr += 1
            }
            previous = byte
        }
        if previous == 13 { cr += 1 }
        if crlf >= lf && crlf >= cr && crlf > 0 { return "\r\n" }
        if cr > lf && cr > crlf { return "\r" }
        return "\n"
    }

    var eol: String { Self.detectEol(text) }

    // NSDocument declares these nonisolated; reads happen on the main thread because
    // canConcurrentlyReadDocuments stays false, so assumeIsolated is sound.
    nonisolated override class var autosavesInPlace: Bool { true }
    nonisolated override class var readableTypes: [String] { [markdownType, "public.markdown", UTType.plainText.identifier] }
    nonisolated override class var writableTypes: [String] { [markdownType] }
    nonisolated override class func isNativeType(_ type: String) -> Bool { true }

    nonisolated override func read(from data: Data, ofType typeName: String) throws {
        MainActor.assumeIsolated { apply(data: data) }
    }

    nonisolated override func read(from url: URL, ofType typeName: String) throws {
        let data = try Data(contentsOf: url)
        let quarantine = Quarantine.value(of: url)
        MainActor.assumeIsolated {
            quarantineValue = quarantine
            allowNetwork = trustStore.allowsNetwork(path: url.path)
            apply(data: data)
        }
    }

    /// Decodes strictly: a UTF-8 BOM is stripped and remembered; invalid UTF-8 marks the document read-only.
    private func apply(data: Data) {
        fileData = data
        hasBOM = data.starts(with: [0xEF, 0xBB, 0xBF])
        let body = hasBOM ? data.dropFirst(3) : data[...]
        if let decoded = String(data: body, encoding: .utf8) {
            text = decoded
            decodable = true
        } else {
            text = String(decoding: body, as: UTF8.self)
            decodable = false
        }
        registerContext()
    }

    /// Re-encodes the live text; undecodable files keep their original bytes.
    func encodedContent() -> Data {
        guard decodable else { return fileData }
        var out = Data()
        if hasBOM { out.append(contentsOf: [0xEF, 0xBB, 0xBF]) }
        out.append(contentsOf: Array(text.utf8))
        return out
    }

    nonisolated override func data(ofType typeName: String) throws -> Data {
        MainActor.assumeIsolated {
            let encoded = encodedContent()
            lastEncoded = encoded
            return encoded
        }
    }

    // MARK: - Saving (ADR-0005)

    /// Pulls the live text from the editor; false when it did not answer (the mirror stays).
    @discardableResult
    func pullLiveContent() async -> Bool {
        guard decodable, let source = liveContentSource else { return false }
        do {
            text = try await Self.withTimeout(Self.liveContentTimeout) { try await source() }
            registerContext()
            return true
        } catch {
            return false
        }
    }

    /// Every save path (Save, Save As, Save To, autosave, Duplicate, Versions) funnels through here
    /// and NSDocument writes `data(ofType:)` = the live text as last pulled. The pull itself happens
    /// in the user-facing entry points below, *before* NSDocument begins its file access: calling
    /// `super` from a later turn here deadlocks the activity queue (ADR-0030), so this override only
    /// does bookkeeping. Autosave therefore writes the mirror, at most ~0.5 s behind the editor.
    override func save(to url: URL, ofType typeName: String, for saveOperation: NSDocument.SaveOperationType, completionHandler: @escaping @Sendable (Error?) -> Void) {
        super.save(to: url, ofType: typeName, for: saveOperation) { error in
            MainActor.assumeIsolated {
                if error == nil { self.didSave(saveOperation) }
                completionHandler(error)
            }
        }
    }

    /// Before a user-initiated save: pull the live text; remember when the editor did not answer so the
    /// window can warn that the mirror was written (ADR-0005).
    private func pullBeforeUserSave() async {
        let pulled = await pullLiveContent()
        lastSaveUsedMirror = !pulled && decodable && liveContentSource != nil
    }

    /// User-initiated saves pull the live text first (outside any NSDocument file access), then proceed.
    override func save(_ sender: Any?) {
        Task { @MainActor in
            await self.pullBeforeUserSave()
            super.save(sender)
        }
    }

    override func saveAs(_ sender: Any?) {
        Task { @MainActor in
            await self.pullBeforeUserSave()
            super.saveAs(sender)
        }
    }

    override func saveTo(_ sender: Any?) {
        Task { @MainActor in
            await self.pullBeforeUserSave()
            super.saveTo(sender)
        }
    }

    /// Duplicate writes the current contents through `writeSafely`; the live text is pulled first.
    override func duplicate(_ sender: Any?) {
        Task { @MainActor in
            await self.pullBeforeUserSave()
            super.duplicate(sender)
        }
    }

    /// Closing may save: pull first so the "Save changes?" path writes the live text.
    override func canClose(withDelegate delegate: Any, shouldClose shouldCloseSelector: Selector?, contextInfo: UnsafeMutableRawPointer?) {
        nonisolated(unsafe) let context = contextInfo
        Task { @MainActor in
            await self.pullBeforeUserSave()
            super.canClose(withDelegate: delegate, shouldClose: shouldCloseSelector, contextInfo: context)
        }
    }

    private func didSave(_ operation: NSDocument.SaveOperationType) {
        switch operation {
        case .saveOperation, .saveAsOperation, .autosaveInPlaceOperation, .autosaveAsOperation:
            // What we just wrote is what is on disk now; our own write is not an external change.
            if let lastEncoded { fileData = lastEncoded }
            if hasConflict { hasConflict = false; onConflictChanged?() }
        default:
            break
        }
        if lastSaveUsedMirror {
            lastSaveUsedMirror = false
            onSavedFromMirror?()
        }
        onSaved?(operation)
    }

    struct TimeoutError: Error {}

    /// Races `operation` against a timer without waiting for the loser: a task group would block
    /// until every child finished, and a bridge call to a dead web process may never finish.
    static func withTimeout<T: Sendable>(_ timeout: Duration, _ operation: @escaping @Sendable () async throws -> T) async throws -> T {
        let once = ResumeOnce()
        return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<T, Error>) in
            Task {
                let result: Result<T, Error>
                do { result = .success(try await operation()) } catch { result = .failure(error) }
                if once.claim() { continuation.resume(with: result) }
            }
            Task {
                try? await Task.sleep(for: timeout)
                if once.claim() { continuation.resume(throwing: TimeoutError()) }
            }
        }
    }

    override func revert(toContentsOf url: URL, ofType typeName: String) throws {
        try super.revert(toContentsOf: url, ofType: typeName)
        if hasConflict { hasConflict = false; onConflictChanged?() }
        onContentChanged?()
    }

    // NSDocument declares fileURL nonisolated; it is set on the main thread (open, Save As, rename).
    nonisolated override var fileURL: URL? {
        get { super.fileURL }
        set {
            let old = super.fileURL
            super.fileURL = newValue
            guard newValue != old else { return }
            MainActor.assumeIsolated {
                registerContext()
                startWatching()
            }
        }
    }

    override func makeWindowControllers() {
        registerContext()
        startWatching()
        addWindowController(DocumentWindowController(document: self))
    }

    override func close() {
        watcher?.stop()
        watcher = nil
        mirrorTask?.cancel()
        MDViewRegistry.shared.unregister(docId)
        super.close()
    }

    func registerContext() {
        MDViewRegistry.shared.register(
            MDViewDocumentContext(
                folderURL: fileURL?.deletingLastPathComponent(),
                path: fileURL?.path,
                quarantined: isUntrusted,
                allowNetwork: allowNetwork,
                sourceProvider: { [weak self] in (self?.text ?? "", self?.hasBOM ?? false) }
            ),
            for: docId
        )
    }

    // MARK: - EditorHostDelegate (the editor's Host, ADR-0029)

    func editorDocumentInfo() -> [String: Any] {
        var info: [String: Any] = [
            "docId": docId,
            "text": text,
            "bom": hasBOM,
            "eol": eol,
            "quarantined": isUntrusted,
            "baseURL": "\(MDViewSchemeHandler.scheme)://\(docId)/",
            "readOnly": !decodable,
            "mode": editorStartMode,
        ]
        if let path = fileURL?.path { info["path"] = path }
        return info
    }

    func editorReadFile(_ relPath: String) throws -> Data {
        guard let folder = fileURL?.deletingLastPathComponent(),
              let file = PathGuard(root: folder).resolve(relPath)
        else { throw CocoaError(.fileReadNoSuchFile) }
        return try Data(contentsOf: file)
    }

    func editorSave() {
        save(nil)
    }

    func editorOpenExternal(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), ["http", "https", "mailto"].contains(scheme) else { return }
        NSWorkspace.shared.open(url)
    }

    func editorSetDirty(_ dirty: Bool) {
        updateChangeCount(dirty ? .changeDone : .changeCleared)
    }

    func editorRequestMode(_ mode: String) {
        onModeRequested?(mode)
    }

    /// Debounced mirror pull: keeps `text` close to the editor for Split re-rendering and crash saves.
    func editorContentChanged() {
        mirrorTask?.cancel()
        mirrorTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(150))
            guard !Task.isCancelled, let self else { return }
            if await self.pullLiveContent() { self.onLiveContentChanged?() }
        }
    }

    func editorReportPosition(line: Int, cursorLine: Int, cursorColumn: Int) {
        onPositionReported?(line, cursorLine, cursorColumn)
    }

    // MARK: - Trust and network policy (ADR-0007)

    /// The user trusts this quarantined document: scripts run from the next render on. The file is not modified.
    func trustDocument() {
        guard let quarantineValue, let path = fileURL?.path else { return }
        trustStore.trust(path: path, quarantineValue: quarantineValue)
        registerContext()
        onPolicyChanged?()
    }

    func setAllowNetwork(_ allowed: Bool) {
        guard allowNetwork != allowed else { return }
        allowNetwork = allowed
        if let path = fileURL?.path { trustStore.setAllowsNetwork(allowed, path: path) }
        registerContext()
        onPolicyChanged?()
    }

    // MARK: - External changes (ADR-0013, ADR-0024, ADR-0030)

    /// Coordinated writes by other apps arrive here (NSDocument is an NSFilePresenter).
    nonisolated override func presentedItemDidChange() {
        super.presentedItemDidChange()
        Task { @MainActor in self.reloadIfChangedOnDisk() }
    }

    private func startWatching() {
        watcher?.stop()
        watcher = nil
        guard let url = fileURL else { return }
        watcher = FileWatcher(url: url) { [weak self] in self?.reloadIfChangedOnDisk() }
    }

    /// Re-reads the file. When the bytes differ: with no unsaved edits the text is replaced and every view
    /// reloads; with unsaved edits nothing is overwritten and the conflict banner is raised instead.
    @discardableResult
    func reloadIfChangedOnDisk() -> Bool {
        guard let url = fileURL, let data = try? Data(contentsOf: url) else { return false }
        guard data != fileData else { return false }
        if isDocumentEdited {
            if !hasConflict {
                hasConflict = true
                onConflictChanged?()
            }
            return false
        }
        apply(data: data)
        onContentChanged?()
        return true
    }

    /// Conflict resolution: drop the unsaved edits and take the file as it is on disk.
    func resolveConflictByReloading() {
        guard let url = fileURL, let data = try? Data(contentsOf: url) else { return }
        apply(data: data)
        updateChangeCount(.changeCleared)
        hasConflict = false
        onConflictChanged?()
        onContentChanged?()
    }

    /// Conflict resolution: keep editing; the next explicit save asks before overwriting (NSDocument's own check).
    func dismissConflict() {
        guard hasConflict else { return }
        hasConflict = false
        onConflictChanged?()
    }
}
