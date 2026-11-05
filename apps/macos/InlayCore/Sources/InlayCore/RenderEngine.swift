// SPDX-License-Identifier: Apache-2.0
import Foundation
import JavaScriptCore

/// Rendering surfaces, mirroring `RenderMode` in packages/md-render.
public enum RenderMode: String, Sendable {
    case full, sanitized, `static`
}

public struct RenderOptions: Sendable {
    public var mode: RenderMode = .full
    public var allowScripts: Bool = true
    public var theme: String = "system"
    public var inlineAssets: Bool = false
    public var vendorBaseURL: String? = nil

    public init() {}

    var asDictionary: [String: Any] {
        var dict: [String: Any] = [
            "mode": mode.rawValue,
            "allowScripts": allowScripts,
            "theme": theme,
            "inlineAssets": inlineAssets,
        ]
        if let vendorBaseURL { dict["vendorBaseURL"] = vendorBaseURL }
        return dict
    }
}

public struct RenderMeta: Decodable, Sendable, Equatable {
    public var frontMatter: String?
    public var title: String?
    public var hasScripts: Bool
    public var codeLanguages: [String]
    public var hasMermaid: Bool
    public var hasMath: Bool
    public var lineCount: Int
}

public struct RenderResult: Sendable {
    public var html: String
    public var meta: RenderMeta
}

public enum RenderEngineError: Error, CustomStringConvertible, Sendable {
    case bundleNotFound
    case bundleUnreadable(String)
    case javaScript(String)
    case badResult(String)

    public var description: String {
        switch self {
        case .bundleNotFound: "md-render.jsc.js not found in InlayCore resources (run scripts/build-web.sh)"
        case .bundleUnreadable(let s): "md-render bundle unreadable: \(s)"
        case .javaScript(let s): "JavaScript error: \(s)"
        case .badResult(let s): "unexpected render result: \(s)"
        }
    }
}

/// Runs the md-render JavaScriptCore bundle. One warm `JSContext` per engine;
/// calls are serialized with a lock so the engine can be shared across threads
/// (the Quick Look extension renders on background queues).
public final class RenderEngine: @unchecked Sendable {
    private let context: JSContext
    private let lock = NSLock()
    private var lastException: String?

    public let version: String

    public init(bundleURL: URL) throws {
        let script: String
        do {
            script = try String(contentsOf: bundleURL, encoding: .utf8)
        } catch {
            throw RenderEngineError.bundleUnreadable(error.localizedDescription)
        }
        guard let context = JSContext() else { throw RenderEngineError.javaScript("could not create JSContext") }
        self.context = context
        Self.installPolyfills(in: context)
        var exception: String?
        context.exceptionHandler = { _, value in exception = value?.toString() }
        context.evaluateScript(script, withSourceURL: bundleURL)
        if let exception { throw RenderEngineError.javaScript(exception) }
        guard let api = context.objectForKeyedSubscript("InlayRender"), !api.isUndefined,
              let render = api.objectForKeyedSubscript("render"), !render.isUndefined
        else { throw RenderEngineError.javaScript("InlayRender.render is missing from the bundle") }
        version = api.objectForKeyedSubscript("version")?.toString() ?? "unknown"
        context.exceptionHandler = { [weak self] _, value in self?.lastException = value?.toString() }
    }

    /// Engine over the bundle shipped in the InlayCore resource bundle.
    public static func bundled() throws -> RenderEngine {
        guard let url = Bundle.module.url(forResource: "md-render.jsc", withExtension: "js") else {
            throw RenderEngineError.bundleNotFound
        }
        return try RenderEngine(bundleURL: url)
    }

    public func render(_ markdown: String, options: RenderOptions = RenderOptions()) throws -> RenderResult {
        lock.lock()
        defer { lock.unlock() }
        lastException = nil
        guard let api = context.objectForKeyedSubscript("InlayRender"),
              let fn = api.objectForKeyedSubscript("render"),
              let value = fn.call(withArguments: [markdown, options.asDictionary])
        else { throw RenderEngineError.javaScript(lastException ?? "render call failed") }
        if let lastException { throw RenderEngineError.javaScript(lastException) }
        guard let dict = value.toDictionary(), let html = dict["html"] as? String, let meta = dict["meta"] else {
            throw RenderEngineError.badResult(value.toString() ?? "nil")
        }
        let metaData = try JSONSerialization.data(withJSONObject: meta)
        let decoded = try JSONDecoder().decode(RenderMeta.self, from: metaData)
        return RenderResult(html: html, meta: decoded)
    }

    private static func installPolyfills(in context: JSContext) {
        // A bare JSContext has no console or timers. Keep them inert but present.
        context.evaluateScript("""
        var globalThis = this;
        var console = { log: function(){}, warn: function(){}, error: function(){}, debug: function(){}, info: function(){} };
        var queueMicrotask = function (cb) { Promise.resolve().then(cb); };
        """)
    }
}
