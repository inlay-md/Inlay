// SPDX-License-Identifier: Apache-2.0
import AppKit
import InlayCore
import WebKit

/// The isolated Read view: non-persistent store, no script message handlers,
/// `mdview://` scheme handler, external links to the default browser, no popups.
final class ReadWebView: WKWebView, WKNavigationDelegate, WKUIDelegate {
    let docId: String

    /// Opens http(s)/mailto links outside the app. Replaceable for tests.
    var externalOpener: (URL) -> Void = { NSWorkspace.shared.open($0) }
    /// Opens a Markdown file from the document folder as a new document. Replaceable for tests.
    var markdownOpener: (URL) -> Void = { url in
        NSDocumentController.shared.openDocument(withContentsOf: url, display: true) { _, _, _ in }
    }
    /// Count of refused popups (window.open), for tests.
    private(set) var refusedPopups = 0
    /// The page finished loading (first load or a refresh reload): Split sync re-applies its line.
    var onPageLoaded: (() -> Void)?

    init(docId: String) {
        self.docId = docId
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.setURLSchemeHandler(MDViewSchemeHandler(), forURLScheme: MDViewSchemeHandler.scheme)
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.preferences.isFraudulentWebsiteWarningEnabled = false
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        // Intentionally: no user content controller handlers. Document JS has no path to native code.
        super.init(frame: .zero, configuration: config)
        navigationDelegate = self
        uiDelegate = self
        allowsBackForwardNavigationGestures = false
        allowsMagnification = true
        setValue(false, forKey: "drawsBackground")
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not supported") }

    var documentURL: URL { URL(string: "\(MDViewSchemeHandler.scheme)://\(docId)/")! }

    func loadDocument() {
        load(URLRequest(url: documentURL))
    }

    /// Asks the runtime to re-render from the live source, keeping the scroll position;
    /// falls back to a plain reload when the runtime is not reachable.
    func refreshDocument() {
        evaluateJavaScript("window.inlayReadView ? (window.inlayReadView.refresh(), true) : false") { [weak self] result, error in
            if error != nil || (result as? Bool) != true { self?.reload() }
        }
    }

    /// Scrolls the rendered document so `line` (1-based source line) sits at the top (Split sync, mode switching).
    func scrollToSourceLine(_ line: Int) {
        evaluateJavaScript("window.inlayReadView && window.inlayReadView.scrollToSourceLine(\(line))") { _, _ in }
    }

    func setTheme(_ theme: String) {
        evaluateJavaScript("window.inlayReadView && window.inlayReadView.setTheme(\(Self.jsString(theme)))") { _, _ in }
    }

    /// Current top source line and scroll offset, pulled by native (ADR-0010).
    func position() async -> (line: Int, scrollY: Double)? {
        guard let value = try? await evaluateJavaScript("window.inlayReadView ? JSON.stringify(window.inlayReadView.getPosition()) : null") as? String,
              let data = value.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let line = dict["line"] as? Int
        else { return nil }
        return (line, dict["scrollY"] as? Double ?? 0)
    }

    private static func jsString(_ s: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [s])
        let json = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
        return String(json.dropFirst().dropLast())
    }

    // MARK: WKNavigationDelegate

    /// Pure policy, unit-tested without navigation: what to do with a navigation to `url`.
    enum Policy: Equatable { case allow, cancel, openExternal, openMarkdown }

    func policy(for url: URL, isMainFrame: Bool) -> Policy {
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == MDViewSchemeHandler.scheme {
            guard url.host == docId else { return .cancel }
            let path = MDViewSchemeHandler.routePath(of: url)
            if path == "/" || path == "/index.html" || path.hasPrefix(MDViewSchemeHandler.reservedPrefix) { return .allow }
            // A relative link to another Markdown file opens it as its own document.
            let ext = url.pathExtension.lowercased()
            if isMainFrame, ext == "md" || ext == "markdown" { return .openMarkdown }
            return isMainFrame ? .cancel : .allow
        }
        if scheme == "http" || scheme == "https" || scheme == "mailto" { return .openExternal }
        return .cancel
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .cancel }
        switch policy(for: url, isMainFrame: navigationAction.targetFrame?.isMainFrame ?? true) {
        case .allow:
            return .allow
        case .cancel:
            return .cancel
        case .openExternal:
            externalOpener(url)
            return .cancel
        case .openMarkdown:
            if let context = MDViewRegistry.shared.context(for: docId), let folder = context.folderURL,
               let file = InlayCore.PathGuard(root: folder).resolve(String(url.path.dropFirst())) {
                markdownOpener(file)
            }
            return .cancel
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        onPageLoaded?()
    }

    // MARK: WKUIDelegate

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // window.open: refuse popups; external targets go to the default browser.
        refusedPopups += 1
        if let url = navigationAction.request.url, let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            externalOpener(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
        // Document alerts are shown as a sheet-less modal so they cannot block the app silently.
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }
}
