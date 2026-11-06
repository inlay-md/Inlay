// SPDX-License-Identifier: Apache-2.0
import Foundation

/// Locates the web bundles copied into the app by scripts/build-web.sh.
enum WebBundle {
    static let generatedDirectory = "generated"

    static func readViewRoot(in bundle: Bundle = .main) -> URL? {
        bundle.resourceURL?
            .appendingPathComponent(generatedDirectory)
            .appendingPathComponent("web/read-view", isDirectory: true)
    }

    static func editorRoot(in bundle: Bundle = .main) -> URL? {
        bundle.resourceURL?
            .appendingPathComponent(generatedDirectory)
            .appendingPathComponent("web/editor", isDirectory: true)
    }

    static func thirdPartyNotices(in bundle: Bundle = .main) -> String? {
        guard let url = bundle.resourceURL?
            .appendingPathComponent(generatedDirectory)
            .appendingPathComponent("THIRD_PARTY_NOTICES.md")
        else { return nil }
        return try? String(contentsOf: url, encoding: .utf8)
    }

    static func mimeType(forExtension ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": "text/html; charset=utf-8"
        case "js", "mjs": "text/javascript; charset=utf-8"
        case "css": "text/css; charset=utf-8"
        case "json", "map": "application/json; charset=utf-8"
        case "svg": "image/svg+xml"
        case "png": "image/png"
        case "jpg", "jpeg": "image/jpeg"
        case "gif": "image/gif"
        case "webp": "image/webp"
        case "avif": "image/avif"
        case "ico": "image/x-icon"
        case "woff2": "font/woff2"
        case "woff": "font/woff"
        case "ttf": "font/ttf"
        case "otf": "font/otf"
        case "md", "markdown": "text/markdown; charset=utf-8"
        case "txt": "text/plain; charset=utf-8"
        case "csv": "text/csv; charset=utf-8"
        case "wasm": "application/wasm"
        case "mp4": "video/mp4"
        case "webm": "video/webm"
        case "mp3": "audio/mpeg"
        case "pdf": "application/pdf"
        default: "application/octet-stream"
        }
    }
}
