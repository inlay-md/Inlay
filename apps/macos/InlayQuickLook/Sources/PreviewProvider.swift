// SPDX-License-Identifier: Apache-2.0
import Foundation
import InlayCore
import OSLog
import QuickLookUI
import UniformTypeIdentifiers

/// M0 stub: a data-based preview that doubles as the Quick Look spike (ADR pending).
/// The page reports whether (1) JavaScript executes in a data-based preview,
/// (2) the extension can read a sibling file next to the previewed document, and
/// (3) `cid:` attachments resolve. The real tiers arrive in M4.
final class PreviewProvider: QLPreviewProvider, QLPreviewingController {
    private static let engine: RenderEngine? = try? RenderEngine.bundled()
    private static let log = Logger(subsystem: "live.inlay.Inlay.QuickLook", category: "preview")

    func providePreview(for request: QLFilePreviewRequest) async throws -> QLPreviewReply {
        let url = request.fileURL
        Self.log.notice("providePreview for \(url.lastPathComponent, privacy: .public); engine \(Self.engine?.version ?? "unavailable", privacy: .public)")
        let data = try Data(contentsOf: url)
        let markdown = String(decoding: data, as: UTF8.self)
        let rendered = (try? Self.engine?.render(markdown, options: staticOptions()))
        let body = rendered?.html ?? "<pre>\(escape(markdown))</pre>"

        // Spike 2: sibling-file read inside the extension sandbox.
        let siblingURL = url.deletingLastPathComponent().appendingPathComponent("assets/sample.svg")
        let siblingStatus: String
        if let bytes = try? Data(contentsOf: siblingURL) {
            siblingStatus = "<span class=ok>readable (\(bytes.count) bytes)</span> <img alt=sibling src=\"data:image/svg+xml;base64,\(bytes.base64EncodedString())\" height=24>"
        } else {
            siblingStatus = "<span class=bad>not readable</span> (\(siblingURL.lastPathComponent))"
        }

        let attachmentSVG = """
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10" fill="seagreen"/></svg>
        """
        let html = """
        <!doctype html><html><head><meta charset="utf-8">
        <style>
        body{font:14px -apple-system,sans-serif;margin:16px;color:#1d1d1f}
        @media (prefers-color-scheme:dark){body{color:#f5f5f7;background:#1d1d1f}}
        .ok{color:seagreen}.bad{color:tomato}.spike{border:1px solid #8884;padding:8px 12px;border-radius:8px;margin-bottom:16px;font-size:12px}
        pre{white-space:pre-wrap;word-break:break-word}
        </style></head><body>
        <div class="spike">
          <div>Inlay Quick Look spike · engine \(Self.engine?.version ?? "unavailable")</div>
          <div>1. JavaScript: <span id="js" class="bad">did not run</span></div>
          <div>2. Sibling file: \(siblingStatus)</div>
          <div>3. cid: attachment: <img alt="cid" src="cid:spike.svg" height="24"> (green circle if it works)</div>
          <script>document.getElementById('js').textContent='ran';document.getElementById('js').className='ok';</script>
        </div>
        \(body)
        </body></html>
        """
        let reply = QLPreviewReply(dataOfContentType: .html, contentSize: CGSize(width: 800, height: 600)) { reply in
            reply.stringEncoding = .utf8
            reply.attachments["spike.svg"] = QLPreviewReplyAttachment(data: Data(attachmentSVG.utf8), contentType: .svg)
            return Data(html.utf8)
        }
        return reply
    }

    private func staticOptions() -> RenderOptions {
        var o = RenderOptions()
        o.mode = .static
        o.allowScripts = false
        return o
    }

    private func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
    }
}
