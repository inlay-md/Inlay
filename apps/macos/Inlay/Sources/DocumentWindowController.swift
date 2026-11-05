// SPDX-License-Identifier: Apache-2.0
import AppKit

final class DocumentWindowController: NSWindowController {
    private let readView: ReadWebView

    init(document: MarkdownDocument) {
        readView = ReadWebView(docId: document.docId)
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 960, height: 720),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.minSize = NSSize(width: 480, height: 320)
        window.tabbingMode = .preferred
        window.titlebarAppearsTransparent = false
        window.contentView = readView
        window.center()
        window.setFrameAutosaveName("InlayDocumentWindow")
        super.init(window: window)
        shouldCascadeWindows = true
        windowFrameAutosaveName = "InlayDocumentWindow"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not supported") }

    override func windowDidLoad() {
        super.windowDidLoad()
    }

    override var document: AnyObject? {
        didSet {
            readView.loadDocument()
        }
    }
}
