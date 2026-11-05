// SPDX-License-Identifier: Apache-2.0
import AppKit
import WebKit

/// The editor webview: loads the editor page through the `mdview://` handler and carries
/// the one native bridge (`EditorBridge`, a `WKScriptMessageHandlerWithReply`). It shows only
/// our own bundle; the document text is data inside CodeMirror and never runs (ADR-0029).
final class EditorWebView: WKWebView, WKNavigationDelegate, WKUIDelegate {
    let docId: String
    let bridge: EditorBridge
    /// False after the web content process died; saves then fall back to the mirror (ADR-0005).
    private(set) var isResponsive = true
    var onProcessTerminated: (() -> Void)?
    var externalOpener: (URL) -> Void = { NSWorkspace.shared.open($0) }

    init(docId: String, delegate: EditorHostDelegate?) {
        self.docId = docId
        bridge = EditorBridge(delegate: delegate)
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.setURLSchemeHandler(MDViewSchemeHandler(), forURLScheme: MDViewSchemeHandler.scheme)
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.preferences.isFraudulentWebsiteWarningEnabled = false
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.userContentController.addScriptMessageHandler(bridge, contentWorld: .page, name: EditorBridge.handlerName)
        super.init(frame: .zero, configuration: config)
        navigationDelegate = self
        uiDelegate = self
        allowsBackForwardNavigationGestures = false
        allowsMagnification = false
        setValue(false, forKey: "drawsBackground")
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not supported") }

    var pageURL: URL { URL(string: "\(MDViewSchemeHandler.scheme)://\(docId)\(MDViewSchemeHandler.editorPrefix)")! }

    func loadEditor() {
        isResponsive = true
        load(URLRequest(url: pageURL))
    }

    enum EditorError: Error { case notResponsive, noContent }

    /// The live editor text (ADR-0005). Throws when the page is gone or has no editor yet.
    func requestContent() async throws -> String {
        guard isResponsive else { throw EditorError.notResponsive }
        let result = try await callAsyncJavaScript(
            "return await window.inlayWebKitHost.requestContent();",
            arguments: [:],
            in: nil,
            contentWorld: .page
        )
        guard let text = result as? String else { throw EditorError.noContent }
        return text
    }

    /// Delivers a Host event to the web core.
    func emit(_ event: String, payload: Any) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.fragmentsAllowed]),
              let json = String(data: data, encoding: .utf8) else { return }
        evaluateJavaScript("window.inlayWebKitHost && window.inlayWebKitHost.emit(\(Self.jsString(event)), \(json))") { _, _ in }
    }

    /// Asks the editor page to show WYSIWYG or Source (ADR-0033); the page carries the caret over.
    func requestEditorMode(_ mode: String) {
        emit("modeRequested", payload: mode)
    }

    /// Top source line and cursor, pulled by native for mode switching.
    func position() async -> (line: Int, cursorLine: Int, cursorColumn: Int)? {
        guard let value = try? await evaluateJavaScript("window.inlayEditor ? JSON.stringify(window.inlayEditor.getPosition()) : null") as? String,
              let data = value.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let line = dict["line"] as? Int
        else { return nil }
        return (line, dict["cursorLine"] as? Int ?? line, dict["cursorColumn"] as? Int ?? 1)
    }

    func scrollToSourceLine(_ line: Int) {
        evaluateJavaScript("window.inlayEditor && window.inlayEditor.scrollToSourceLine(\(line))") { _, _ in }
    }

    func setCursorSourceLine(_ line: Int) {
        evaluateJavaScript("window.inlayEditor && window.inlayEditor.setCursorSourceLine(\(line))") { _, _ in }
    }

    func setTheme(_ theme: String) {
        evaluateJavaScript("window.inlayEditor && window.inlayEditor.setTheme(\(Self.jsString(theme)))") { _, _ in }
    }

    func focusEditor() {
        window?.makeFirstResponder(self)
        evaluateJavaScript("window.inlayEditor && window.inlayEditor.focus()") { _, _ in }
    }

    static func jsString(_ s: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [s])
        let json = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
        return String(json.dropFirst().dropLast())
    }

    // MARK: Navigation policy: only our editor page; links leave the app.

    enum Policy: Equatable { case allow, cancel, openExternal }

    func policy(for url: URL, isMainFrame: Bool) -> Policy {
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == MDViewSchemeHandler.scheme {
            guard url.host == docId else { return .cancel }
            let path = MDViewSchemeHandler.routePath(of: url)
            if path.hasPrefix(MDViewSchemeHandler.editorPrefix) || path + "/" == MDViewSchemeHandler.editorPrefix { return .allow }
            // Document assets (images in M3) may load into the page, never replace it.
            return isMainFrame ? .cancel : .allow
        }
        if scheme == "http" || scheme == "https" || scheme == "mailto" { return .openExternal }
        return .cancel
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .cancel }
        switch policy(for: url, isMainFrame: navigationAction.targetFrame?.isMainFrame ?? true) {
        case .allow: return .allow
        case .cancel: return .cancel
        case .openExternal:
            externalOpener(url)
            return .cancel
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        isResponsive = false
        onProcessTerminated?()
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        nil
    }
}
