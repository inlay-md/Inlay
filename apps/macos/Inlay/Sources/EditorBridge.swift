// SPDX-License-Identifier: Apache-2.0
import Foundation
import WebKit

/// What the editor page may ask of native (the `Host` interface, ADR-0029). Implemented by
/// `MarkdownDocument`; window-level requests are forwarded through its closures.
@MainActor
protocol EditorHostDelegate: AnyObject {
    func editorDocumentInfo() -> [String: Any]
    func editorReadFile(_ relPath: String) throws -> Data
    func editorSave()
    func editorOpenExternal(_ url: URL)
    func editorSetDirty(_ dirty: Bool)
    func editorRequestMode(_ mode: String)
    func editorContentChanged()
    func editorReportPosition(line: Int, cursorLine: Int, cursorColumn: Int)
}

enum EditorBridgeError: Error, LocalizedError {
    case badMessage
    case unknownMethod(String)
    case badArguments(String)
    case noDelegate

    var errorDescription: String? {
        switch self {
        case .badMessage: "message is not {method, args}"
        case .unknownMethod(let m): "unknown method \(m)"
        case .badArguments(let m): "bad arguments for \(m)"
        case .noDelegate: "document is gone"
        }
    }
}

/// The one `WKScriptMessageHandlerWithReply` in the app, installed on the editor webview only.
/// Messages are `{ method: String, args: [Any] }`; the reply is the method's result or an error string.
final class EditorBridge: NSObject, WKScriptMessageHandlerWithReply {
    static let handlerName = "inlay"

    weak var delegate: EditorHostDelegate?
    /// Methods seen, for tests.
    private(set) var receivedMethods: [String] = []

    init(delegate: EditorHostDelegate?) {
        self.delegate = delegate
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) async -> (Any?, String?) {
        do {
            return (try handle(message.body), nil)
        } catch {
            return (nil, error.localizedDescription)
        }
    }

    /// Pure dispatch; unit-tested without a webview.
    func handle(_ body: Any) throws -> Any? {
        guard let dict = body as? [String: Any], let method = dict["method"] as? String else {
            throw EditorBridgeError.badMessage
        }
        let args = dict["args"] as? [Any] ?? []
        receivedMethods.append(method)
        guard let delegate else { throw EditorBridgeError.noDelegate }
        switch method {
        case "openDocument":
            return delegate.editorDocumentInfo()
        case "readFile":
            guard let rel = args.first as? String else { throw EditorBridgeError.badArguments(method) }
            return try delegate.editorReadFile(rel).base64EncodedString()
        case "saveDocument":
            delegate.editorSave()
            return nil
        case "openExternal":
            guard let s = args.first as? String, let url = URL(string: s) else { throw EditorBridgeError.badArguments(method) }
            delegate.editorOpenExternal(url)
            return nil
        case "getSettings":
            return SettingsStore.shared.current()
        case "setSettings":
            guard let patch = args.first as? [String: Any] else { throw EditorBridgeError.badArguments(method) }
            return SettingsStore.shared.update(patch)
        case "setDirty":
            guard let dirty = args.first as? Bool else { throw EditorBridgeError.badArguments(method) }
            delegate.editorSetDirty(dirty)
            return nil
        case "requestMode":
            guard let mode = args.first as? String else { throw EditorBridgeError.badArguments(method) }
            delegate.editorRequestMode(mode)
            return nil
        case "notifyContentChanged":
            delegate.editorContentChanged()
            return nil
        case "reportPosition":
            guard let pos = args.first as? [String: Any], let line = pos["line"] as? Int else { throw EditorBridgeError.badArguments(method) }
            delegate.editorReportPosition(line: line, cursorLine: pos["cursorLine"] as? Int ?? line, cursorColumn: pos["cursorColumn"] as? Int ?? 1)
            return nil
        default:
            throw EditorBridgeError.unknownMethod(method)
        }
    }
}
