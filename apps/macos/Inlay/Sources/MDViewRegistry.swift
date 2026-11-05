// SPDX-License-Identifier: Apache-2.0
import Foundation

/// What the scheme handler needs to know about an open document, keyed by docId
/// (the host part of `mdview://<docId>/`). Documents register on open and
/// unregister on close.
struct MDViewDocumentContext {
    var folderURL: URL?
    var path: String?
    var quarantined: Bool
    var allowNetwork: Bool
    /// Reads the live document text (never a stale copy).
    var sourceProvider: () -> (text: String, bom: Bool)
}

@MainActor
final class MDViewRegistry {
    static let shared = MDViewRegistry()
    private var contexts: [String: MDViewDocumentContext] = [:]

    func register(_ context: MDViewDocumentContext, for docId: String) {
        contexts[docId] = context
    }

    func unregister(_ docId: String) {
        contexts.removeValue(forKey: docId)
    }

    func context(for docId: String) -> MDViewDocumentContext? {
        contexts[docId]
    }

    func update(_ docId: String, _ change: (inout MDViewDocumentContext) -> Void) {
        guard var ctx = contexts[docId] else { return }
        change(&ctx)
        contexts[docId] = ctx
    }
}
