// SPDX-License-Identifier: Apache-2.0
import AppKit
import InlayCore
import UniformTypeIdentifiers

/// NSDocument for Markdown files. The bytes read from disk are the source of
/// truth; M1 has no editing surface, so save is byte-identical. The document
/// owns the Read view's trust state (quarantine, network) and file watching.
final class MarkdownDocument: NSDocument {
    static let markdownType = "net.daringfireball.markdown"

    let docId = UUID().uuidString.lowercased()
    private(set) var fileData = Data()
    private(set) var text = ""
    private(set) var hasBOM = false
    private(set) var decodable = true
    /// The file carries `com.apple.quarantine`; its value participates in the trust identity.
    private(set) var quarantineValue: String?
    private(set) var allowNetwork = false
    private var watcher: FileWatcher?
    private var trustStore: TrustStore { TrustStore.shared }

    /// Called after the document text changed on disk and the Read view should refresh.
    var onContentChanged: (() -> Void)?
    /// Called when trust or network state changed and the Read view must reload with a new policy.
    var onPolicyChanged: (() -> Void)?

    var isQuarantined: Bool { quarantineValue != nil }

    /// Quarantined and not yet trusted by the user: scripts stay off (static rendering).
    var isUntrusted: Bool {
        guard let quarantineValue, let path = fileURL?.path else { return false }
        return !trustStore.isTrusted(path: path, quarantineValue: quarantineValue)
    }

    // NSDocument declares these nonisolated; reads happen on the main thread because
    // canConcurrentlyReadDocuments stays false, so assumeIsolated is sound.
    nonisolated override class var autosavesInPlace: Bool { false }
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

    nonisolated override func data(ofType typeName: String) throws -> Data {
        // M1: no editing surface yet, so the original bytes are always the live content.
        MainActor.assumeIsolated { fileData }
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

    // MARK: - External changes (ADR-0013)

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

    /// Re-reads the file; when the bytes differ, replaces the text and asks the Read view to refresh.
    /// M1 has no edits, so there is never a conflict to show (M2 adds the conflict banner).
    @discardableResult
    func reloadIfChangedOnDisk() -> Bool {
        guard let url = fileURL, let data = try? Data(contentsOf: url) else { return false }
        guard data != fileData else { return false }
        apply(data: data)
        onContentChanged?()
        return true
    }
}
