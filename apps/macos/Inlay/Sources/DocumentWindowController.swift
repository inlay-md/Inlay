// SPDX-License-Identifier: Apache-2.0
import AppKit

/// One window per document: an optional native trust banner above the isolated Read view.
/// The banner is native so document content can never imitate or hide it.
final class DocumentWindowController: NSWindowController, NSMenuItemValidation {
    let readView: ReadWebView
    /// Source mode (M2). Created with the window; shown by the mode switcher.
    let editorView: EditorWebView
    private let banner = TrustBannerView()
    private let stack = NSStackView()
    private var appearanceObservation: NSKeyValueObservation?

    init(document: MarkdownDocument) {
        readView = ReadWebView(docId: document.docId)
        editorView = EditorWebView(docId: document.docId, delegate: document)
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 960, height: 720),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.minSize = NSSize(width: 480, height: 320)
        window.tabbingMode = .preferred
        window.titlebarAppearsTransparent = false
        stack.orientation = .vertical
        stack.spacing = 0
        stack.alignment = .width
        stack.distribution = .fill
        stack.addArrangedSubview(banner)
        stack.addArrangedSubview(readView)
        stack.addArrangedSubview(editorView)
        editorView.isHidden = true
        readView.setContentHuggingPriority(.defaultLow, for: .vertical)
        editorView.setContentHuggingPriority(.defaultLow, for: .vertical)
        banner.setContentHuggingPriority(.required, for: .vertical)
        window.contentView = stack
        window.center()
        window.setFrameAutosaveName("InlayDocumentWindow")
        super.init(window: window)
        shouldCascadeWindows = true
        windowFrameAutosaveName = "InlayDocumentWindow"
        banner.onTrust = { [weak self] in (self?.document as? MarkdownDocument)?.trustDocument() }
        wire(document)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not supported") }

    var markdownDocument: MarkdownDocument? { document as? MarkdownDocument }

    private func wire(_ document: MarkdownDocument) {
        document.liveContentSource = { [weak self] in
            guard let self else { throw EditorWebView.EditorError.notResponsive }
            return try await self.editorView.requestContent()
        }
        document.onContentChanged = { [weak self] in
            self?.readView.refreshDocument()
            self?.editorView.emit("fileChanged", payload: ["path": document.fileURL?.path ?? ""])
        }
        document.onSaved = { [weak self] operation in
            guard operation == .saveOperation || operation == .saveAsOperation else { return }
            self?.editorView.emit("documentSaved", payload: ["path": document.fileURL?.path as Any])
        }
        document.onPolicyChanged = { [weak self] in
            self?.updateBanner()
            self?.readView.reload()
        }
        updateBanner()
    }

    override var document: AnyObject? {
        didSet {
            if let doc = document as? MarkdownDocument { wire(doc) }
            readView.loadDocument()
            editorView.loadEditor()
        }
    }

    func updateBanner() {
        guard let doc = markdownDocument else { return }
        banner.isHidden = !doc.isUntrusted
        banner.message = doc.isUntrusted
            ? "This file was downloaded from the internet. Scripts are off until you trust it."
            : ""
    }

    // MARK: Menu actions (View menu)

    @objc func toggleAllowNetwork(_ sender: Any?) {
        guard let doc = markdownDocument else { return }
        doc.setAllowNetwork(!doc.allowNetwork)
    }

    @objc func trustDocument(_ sender: Any?) {
        markdownDocument?.trustDocument()
    }

    @objc func refreshReadView(_ sender: Any?) {
        readView.refreshDocument()
    }

    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        switch menuItem.action {
        case #selector(toggleAllowNetwork(_:)):
            menuItem.state = (markdownDocument?.allowNetwork ?? false) ? .on : .off
            return markdownDocument?.fileURL != nil
        case #selector(trustDocument(_:)):
            return markdownDocument?.isUntrusted ?? false
        default:
            return true
        }
    }
}

/// Native "Trust this document" banner shown for quarantined files (ADR-0007).
final class TrustBannerView: NSView {
    var onTrust: (() -> Void)?
    private let label = NSTextField(wrappingLabelWithString: "")
    private let button = NSButton(title: "Trust This Document", target: nil, action: nil)

    var message: String {
        get { label.stringValue }
        set { label.stringValue = newValue }
    }

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.backgroundColor = NSColor.systemYellow.withAlphaComponent(0.25).cgColor
        let icon = NSImageView(image: NSImage(systemSymbolName: "exclamationmark.shield", accessibilityDescription: "Quarantined")!)
        icon.contentTintColor = .labelColor
        label.font = .systemFont(ofSize: NSFont.systemFontSize)
        label.textColor = .labelColor
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        button.target = self
        button.action = #selector(trustPressed(_:))
        button.bezelStyle = .rounded
        button.setAccessibilityIdentifier("inlay-trust-button")
        let row = NSStackView(views: [icon, label, button])
        row.orientation = .horizontal
        row.alignment = .centerY
        row.spacing = 10
        row.edgeInsets = NSEdgeInsets(top: 8, left: 14, bottom: 8, right: 14)
        row.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: leadingAnchor),
            row.trailingAnchor.constraint(equalTo: trailingAnchor),
            row.topAnchor.constraint(equalTo: topAnchor),
            row.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        setAccessibilityIdentifier("inlay-trust-banner")
        isHidden = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not supported") }

    @objc private func trustPressed(_ sender: Any?) {
        onTrust?()
    }
}
