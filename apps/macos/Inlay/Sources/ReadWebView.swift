// SPDX-License-Identifier: Apache-2.0
import AppKit
import WebKit

/// The isolated Read view: non-persistent store, no script message handlers,
/// `mdview://` scheme handler, external links to the default browser, no popups.
final class ReadWebView: WKWebView, WKNavigationDelegate, WKUIDelegate {
    let docId: String

    init(docId: String) {
        self.docId = docId
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.setURLSchemeHandler(MDViewSchemeHandler(), forURLScheme: MDViewSchemeHandler.scheme)
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.preferences.isFraudulentWebsiteWarningEnabled = false
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

    // MARK: WKNavigationDelegate

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .cancel }
        let scheme = url.scheme?.lowercased() ?? ""
        if scheme == MDViewSchemeHandler.scheme {
            // Only this document's own origin may be navigated to.
            return url.host == docId ? .allow : .cancel
        }
        if scheme == "http" || scheme == "https" || scheme == "mailto" {
            NSWorkspace.shared.open(url)
        }
        return .cancel
    }

    // MARK: WKUIDelegate

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // window.open: refuse popups; external targets go to the default browser.
        if let url = navigationAction.request.url, let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            NSWorkspace.shared.open(url)
        }
        return nil
    }
}
