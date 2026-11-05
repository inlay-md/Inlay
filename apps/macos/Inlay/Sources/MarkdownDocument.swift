// SPDX-License-Identifier: Apache-2.0
import AppKit
import InlayCore
import UniformTypeIdentifiers

/// NSDocument for Markdown files. The bytes read from disk are the source of
/// truth; M0 keeps them untouched (no editing yet), so save is byte-identical.
final class MarkdownDocument: NSDocument {
    static let markdownType = "net.daringfireball.markdown"

    let docId = UUID().uuidString.lowercased()
    private(set) var fileData = Data()
    private(set) var text = ""
    private(set) var hasBOM = false
    private(set) var decodable = true
    private(set) var isQuarantined = false
    var allowNetwork = false

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
        let quarantined = Quarantine.isQuarantined(url)
        MainActor.assumeIsolated {
            isQuarantined = quarantined
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
        // M0: no editing surface yet, so the original bytes are always the live content.
        MainActor.assumeIsolated { fileData }
    }

    override func makeWindowControllers() {
        registerContext()
        addWindowController(DocumentWindowController(document: self))
    }

    override func close() {
        MDViewRegistry.shared.unregister(docId)
        super.close()
    }

    func registerContext() {
        MDViewRegistry.shared.register(
            MDViewDocumentContext(
                folderURL: fileURL?.deletingLastPathComponent(),
                path: fileURL?.path,
                quarantined: isQuarantined,
                allowNetwork: allowNetwork,
                sourceProvider: { [weak self] in (self?.text ?? "", self?.hasBOM ?? false) }
            ),
            for: docId
        )
    }
}

nonisolated enum Quarantine {
    static func isQuarantined(_ url: URL) -> Bool {
        url.withUnsafeFileSystemRepresentation { path in
            guard let path else { return false }
            return getxattr(path, "com.apple.quarantine", nil, 0, 0, 0) >= 0
        }
    }
}
