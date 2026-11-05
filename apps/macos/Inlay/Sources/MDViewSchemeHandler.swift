// SPDX-License-Identifier: Apache-2.0
import Foundation
import InlayCore
import WebKit

/// Serves `mdview://<docId>/…` for the Read view webview:
///   `/`                 the Read view shell with the document source embedded as JSON
///   `/__inlay/<path>`   runtime assets from the bundled read-view build (reserved prefix)
///   `/<relative path>`  files inside the document's folder only (PathGuard)
/// Responses carry the Content-Security-Policy from ADR-0007. The webview this
/// handler serves has no script message handlers, so this is the only surface a
/// document can reach, and it never exposes anything outside the document folder.
final class MDViewSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "mdview"
    static let reservedPrefix = "/__inlay/"
    static let cdnAllowlist = "https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com"

    private let registry: MDViewRegistry
    private let readViewRoot: URL?

    init(registry: MDViewRegistry = .shared, readViewRoot: URL? = WebBundle.readViewRoot()) {
        self.registry = registry
        self.readViewRoot = readViewRoot
    }

    struct Response {
        var status: Int
        var headers: [String: String]
        var body: Data
    }

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        let response = respond(to: task.request)
        guard let url = task.request.url,
              let http = HTTPURLResponse(url: url, statusCode: response.status, httpVersion: "HTTP/1.1", headerFields: response.headers)
        else {
            task.didFailWithError(URLError(.badURL))
            return
        }
        task.didReceive(http)
        task.didReceive(response.body)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}

    // MARK: - Routing (pure; unit-tested without a WKWebView)

    func respond(to request: URLRequest) -> Response {
        guard let url = request.url, url.scheme?.lowercased() == Self.scheme, let docId = url.host, !docId.isEmpty else {
            return plain(400, "bad request")
        }
        guard let context = registry.context(for: docId) else {
            return plain(404, "unknown document")
        }
        let path = url.path.isEmpty ? "/" : url.path
        if path == "/" || path == "/index.html" {
            return shell(for: docId, context: context)
        }
        if path.hasPrefix(Self.reservedPrefix) {
            return runtimeAsset(String(path.dropFirst(Self.reservedPrefix.count)))
        }
        return documentFile(String(path.dropFirst()), context: context)
    }

    private func shell(for docId: String, context: MDViewDocumentContext) -> Response {
        guard let root = readViewRoot,
              let template = try? String(contentsOf: root.appendingPathComponent("index.html"), encoding: .utf8)
        else { return plain(500, "read-view bundle missing") }
        let source = context.sourceProvider()
        var payload: [String: Any] = [
            "docId": docId,
            "text": source.text,
            "bom": source.bom,
            "baseURL": "\(Self.scheme)://\(docId)/",
            "quarantined": context.quarantined,
        ]
        if let path = context.path { payload["path"] = path }
        guard let json = try? JSONSerialization.data(withJSONObject: payload),
              var jsonText = String(data: json, encoding: .utf8)
        else { return plain(500, "could not encode document") }
        // A `</script` inside the document must not close the embedding element.
        jsonText = jsonText.replacingOccurrences(of: "</", with: "<\\/")
        let embed = "<script type=\"application/json\" id=\"inlay-source\">\(jsonText)</script>"
        let html: String
        if let range = template.range(of: "<body>") {
            html = template.replacingCharacters(in: range, with: "<body>\(embed)")
        } else {
            html = embed + template
        }
        var headers = htmlHeaders(csp: Self.contentSecurityPolicy(trusted: !context.quarantined, allowNetwork: context.allowNetwork))
        headers["Cache-Control"] = "no-store"
        return Response(status: 200, headers: headers, body: Data(html.utf8))
    }

    private func runtimeAsset(_ relative: String) -> Response {
        guard let root = readViewRoot else { return plain(500, "read-view bundle missing") }
        guard let file = PathGuard(root: root).resolve(relative) else { return plain(403, "forbidden") }
        return serve(file: file, cache: "public, max-age=31536000, immutable")
    }

    private func documentFile(_ relative: String, context: MDViewDocumentContext) -> Response {
        guard let folder = context.folderURL else { return plain(404, "document has no folder") }
        guard let file = PathGuard(root: folder).resolve(relative) else { return plain(403, "forbidden") }
        return serve(file: file, cache: "no-cache")
    }

    private func serve(file: URL, cache: String) -> Response {
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: file.path, isDirectory: &isDir), !isDir.boolValue,
              let data = try? Data(contentsOf: file)
        else { return plain(404, "not found") }
        let headers = [
            "Content-Type": WebBundle.mimeType(forExtension: file.pathExtension),
            "Content-Length": String(data.count),
            "Cache-Control": cache,
            "X-Content-Type-Options": "nosniff",
        ]
        return Response(status: 200, headers: headers, body: data)
    }

    private func plain(_ status: Int, _ message: String) -> Response {
        Response(status: status, headers: ["Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store"], body: Data(message.utf8))
    }

    private func htmlHeaders(csp: String) -> [String: String] {
        [
            "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy": csp,
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
        ]
    }

    /// ADR-0007. `trusted` is false for quarantined documents that the user has not trusted yet:
    /// then only our own runtime (nonce) may run and the renderer emits static output.
    static func contentSecurityPolicy(trusted: Bool, allowNetwork: Bool, nonce: String? = nil) -> String {
        let s = "\(scheme):"
        let cdn = Self.cdnAllowlist
        let wide = allowNetwork ? " https:" : ""
        let scriptSrc = trusted
            ? "'unsafe-inline' \(s) \(cdn)\(wide)"
            : "'nonce-\(nonce ?? "none")' \(s)"
        return [
            "default-src 'none'",
            "script-src \(scriptSrc)",
            "style-src 'unsafe-inline' \(s) \(cdn)\(wide)",
            "font-src \(s) data: \(cdn)\(wide)",
            "img-src \(s) data: blob: https:",
            "media-src \(s) data: blob:",
            "connect-src \(allowNetwork ? "https:" : "'none'")",
            "frame-src 'none'",
            "child-src 'none'",
            "object-src 'none'",
            "base-uri 'none'",
            "form-action 'none'",
        ].joined(separator: "; ")
    }
}
