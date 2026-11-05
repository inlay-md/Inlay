// SPDX-License-Identifier: Apache-2.0
import AppKit

/// How a document window shows its document. WYSIWYG arrives with M3.
enum ViewMode: String, CaseIterable {
    case read, source, split

    static let defaultsKey = "live.inlay.lastViewMode"

    var title: String {
        switch self {
        case .read: "Read"
        case .source: "Source"
        case .split: "Split"
        }
    }
}

/// One window per document: native banners (trust, on-disk conflict) above a split view with
/// the editor pane (Source) and the isolated Read view. Banners and pane headers are native so
/// document content can neither imitate nor cover them. Split mode keeps the Read pane in step
/// with the editor: edits re-render it (debounced) and its scroll follows the editor's top line
/// (source → read only, ADR-0010).
final class DocumentWindowController: NSWindowController, NSMenuItemValidation, NSToolbarDelegate {
    let readView: ReadWebView
    let editorView: EditorWebView
    let splitView = SyncSplitView()
    let splitController = NSSplitViewController()
    let sourceHeader = PaneHeaderView(title: "Source", detail: "Ln 1, Col 1")
    let readHeader = PaneHeaderView(title: "Read", detail: "scroll synced")
    private let trustBanner = TrustBannerView()
    let conflictBanner = ConflictBannerView()
    let sourcePane: PaneView
    let readPane: PaneView
    let sourceItem: NSSplitViewItem
    let readItem: NSSplitViewItem
    /// Banners stack (hidden banners collapse); the split view is pinned below it by constraints.
    private let banners = NSStackView()
    private var modeControl: NSSegmentedControl?
    private(set) var mode: ViewMode = .read
    /// Last source line the editor reported (Split sync); re-applied after the Read view reloads.
    private(set) var syncedLine = 1
    private var readRefreshPending = false

    init(document: MarkdownDocument) {
        readView = ReadWebView(docId: document.docId)
        editorView = EditorWebView(docId: document.docId, delegate: document)
        sourcePane = PaneView(header: sourceHeader, content: editorView)
        readPane = PaneView(header: readHeader, content: readView)
        sourceItem = NSSplitViewItem(viewController: PaneViewController(pane: sourcePane))
        readItem = NSSplitViewItem(viewController: PaneViewController(pane: readPane))
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1080, height: 720),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .unifiedTitleAndToolbar],
            backing: .buffered,
            defer: false
        )
        window.minSize = NSSize(width: 480, height: 320)
        window.tabbingMode = .preferred
        window.tabbingIdentifier = "InlayDocument"
        window.toolbarStyle = .unified
        super.init(window: window)
        shouldCascadeWindows = true
        windowFrameAutosaveName = "InlayDocumentWindow"

        sourcePane.setAccessibilityIdentifier("inlay-source-pane")
        readPane.setAccessibilityIdentifier("inlay-read-pane")
        splitView.isVertical = true
        splitView.dividerStyle = .thin
        splitController.splitView = splitView
        for item in [sourceItem, readItem] {
            item.canCollapse = false
            item.minimumThickness = 240
            item.holdingPriority = .defaultLow
            splitController.addSplitViewItem(item)
        }

        banners.orientation = .vertical
        banners.spacing = 0
        banners.alignment = .width
        banners.distribution = .fill
        banners.addArrangedSubview(trustBanner)
        banners.addArrangedSubview(conflictBanner)
        trustBanner.setContentHuggingPriority(.required, for: .vertical)
        conflictBanner.setContentHuggingPriority(.required, for: .vertical)
        let container = NSView()
        let split = splitController.view
        banners.translatesAutoresizingMaskIntoConstraints = false
        split.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(banners)
        container.addSubview(split)
        NSLayoutConstraint.activate([
            banners.topAnchor.constraint(equalTo: container.topAnchor),
            banners.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            banners.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            split.topAnchor.constraint(equalTo: banners.bottomAnchor),
            split.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            split.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            split.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
        window.contentView = container
        window.center()
        window.setFrameAutosaveName("InlayDocumentWindow")
        installToolbar()

        trustBanner.onTrust = { [weak self] in self?.markdownDocument?.trustDocument() }
        conflictBanner.onReload = { [weak self] in self?.markdownDocument?.resolveConflictByReloading() }
        conflictBanner.onKeep = { [weak self] in self?.markdownDocument?.dismissConflict() }
        let saved = UserDefaults.standard.string(forKey: ViewMode.defaultsKey).flatMap(ViewMode.init(rawValue:)) ?? .read
        applyMode(saved)
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
        document.onLiveContentChanged = { [weak self] in self?.liveContentChanged() }
        document.onSaved = { [weak self] operation in
            guard operation == .saveOperation || operation == .saveAsOperation else { return }
            self?.editorView.emit("documentSaved", payload: ["path": document.fileURL?.path as Any])
        }
        document.onSavedFromMirror = { [weak self] in self?.warnSavedFromMirror() }
        document.onPolicyChanged = { [weak self] in
            self?.updateBanners()
            self?.readView.reload()
        }
        document.onConflictChanged = { [weak self] in self?.updateBanners() }
        document.onPositionReported = { [weak self] line, cursorLine, cursorColumn in
            self?.editorReported(line: line, cursorLine: cursorLine, cursorColumn: cursorColumn)
        }
        document.onModeRequested = { [weak self] raw in
            if let mode = ViewMode(rawValue: raw) { self?.setMode(mode) }
        }
        readView.onPageLoaded = { [weak self] in
            guard let self, self.mode == .split else { return }
            self.readView.scrollToSourceLine(self.syncedLine)
        }
        editorView.onProcessTerminated = { [weak self] in self?.editorCrashed() }
        updateBanners()
    }

    override var document: AnyObject? {
        didSet {
            if let doc = document as? MarkdownDocument { wire(doc) }
            readView.loadDocument()
            editorView.loadEditor()
        }
    }

    func updateBanners() {
        guard let doc = markdownDocument else { return }
        trustBanner.isHidden = !doc.isUntrusted
        trustBanner.message = doc.isUntrusted
            ? "This file was downloaded from the internet. Scripts are off until you trust it."
            : ""
        conflictBanner.isHidden = !doc.hasConflict
    }

    // MARK: - Modes

    /// Switches mode, carrying the position over: the view that was showing supplies its top
    /// source line and the newly shown view scrolls to it (the editor also moves its cursor there).
    func setMode(_ next: ViewMode) {
        guard next != mode else { return }
        let previous = mode
        Task { @MainActor in
            var line: Int?
            switch previous {
            case .read: line = await readView.position()?.line
            case .source, .split: line = await editorView.position()?.line
            }
            applyMode(next)
            UserDefaults.standard.set(next.rawValue, forKey: ViewMode.defaultsKey)
            if let line {
                syncedLine = line
                switch (previous, next) {
                case (.read, .source), (.read, .split):
                    editorView.setCursorSourceLine(line)
                    editorView.scrollToSourceLine(line)
                case (.source, .read), (.source, .split):
                    readView.scrollToSourceLine(line)
                case (.split, .read):
                    readView.scrollToSourceLine(line)
                default:
                    break
                }
            }
            if next != .read { editorView.focusEditor() } else { window?.makeFirstResponder(readView) }
        }
    }

    private func applyMode(_ next: ViewMode) {
        mode = next
        sourcePane.showsHeader = next == .split
        readPane.showsHeader = next == .split
        sourceItem.isCollapsed = next == .read
        readItem.isCollapsed = next == .source
        splitView.syncFraction = next == .split ? splitView.syncFraction : nil
        splitView.centreDividerOnLayout = next == .split
        splitView.needsLayout = true
        modeControl?.selectedSegment = Self.segmentIndex(of: next)
        if next == .split { refreshReadViewFromLiveText() }
    }

    static func segmentIndex(of mode: ViewMode) -> Int {
        switch mode {
        case .read: 0
        case .source: 2
        case .split: 3
        }
    }

    // MARK: - Split sync

    private func editorReported(line: Int, cursorLine: Int, cursorColumn: Int) {
        sourceHeader.detail = "Ln \(cursorLine), Col \(cursorColumn)"
        syncedLine = line
        guard mode == .split else { return }
        readView.scrollToSourceLine(line)
        let total = max(1, markdownDocument?.text.split(separator: "\n", omittingEmptySubsequences: false).count ?? 1)
        splitView.syncFraction = Double(line - 1) / Double(max(1, total - 1))
    }

    private func liveContentChanged() {
        guard mode == .split else { return }
        refreshReadViewFromLiveText()
    }

    /// Re-renders the Read pane from the document's live text (the mirror the bridge keeps current).
    private func refreshReadViewFromLiveText() {
        guard !readRefreshPending else { return }
        readRefreshPending = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
            guard let self else { return }
            self.readRefreshPending = false
            self.readView.refreshDocument()
        }
    }

    private func editorCrashed() {
        guard let window else { return }
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "The editor stopped responding"
        alert.informativeText = "Inlay will reload it. Your latest edits were kept in memory and will be saved from that copy if the editor cannot answer."
        alert.addButton(withTitle: "Reload Editor")
        alert.beginSheetModal(for: window) { [weak self] _ in self?.editorView.loadEditor() }
    }

    private func warnSavedFromMirror() {
        guard let window else { return }
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Saved from the last known content"
        alert.informativeText = "The editor did not answer in time, so Inlay saved the most recent text it had received. Check the document for anything typed in the last moments."
        alert.addButton(withTitle: "OK")
        alert.beginSheetModal(for: window)
    }

    // MARK: - Toolbar (design: Read / Edit / Source / Split segmented control)

    private static let modeItem = NSToolbarItem.Identifier("inlay.mode")

    private func installToolbar() {
        let toolbar = NSToolbar(identifier: "InlayDocumentToolbar")
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = false
        window?.toolbar = toolbar
    }

    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.flexibleSpace, Self.modeItem, .flexibleSpace]
    }

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.flexibleSpace, Self.modeItem]
    }

    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier itemIdentifier: NSToolbarItem.Identifier, willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        guard itemIdentifier == Self.modeItem else { return nil }
        let control = NSSegmentedControl(labels: ["Read", "Edit", "Source", "Split"], trackingMode: .selectOne, target: self, action: #selector(modeSegmentChanged(_:)))
        control.segmentStyle = .automatic
        control.setEnabled(false, forSegment: 1) // WYSIWYG: M3
        control.setToolTip("WYSIWYG editing arrives in a later release", forSegment: 1)
        control.selectedSegment = Self.segmentIndex(of: mode)
        control.setAccessibilityIdentifier("inlay-mode-control")
        modeControl = control
        let item = NSToolbarItem(itemIdentifier: itemIdentifier)
        item.view = control
        item.label = "View"
        item.paletteLabel = "View mode"
        return item
    }

    @objc private func modeSegmentChanged(_ sender: NSSegmentedControl) {
        switch sender.selectedSegment {
        case 0: setMode(.read)
        case 2: setMode(.source)
        case 3: setMode(.split)
        default: sender.selectedSegment = Self.segmentIndex(of: mode)
        }
    }

    // MARK: - Menu actions (View menu)

    @objc func showReadMode(_ sender: Any?) { setMode(.read) }
    @objc func showSourceMode(_ sender: Any?) { setMode(.source) }
    @objc func showSplitMode(_ sender: Any?) { setMode(.split) }

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
        case #selector(showReadMode(_:)):
            menuItem.state = mode == .read ? .on : .off
            return true
        case #selector(showSourceMode(_:)):
            menuItem.state = mode == .source ? .on : .off
            return true
        case #selector(showSplitMode(_:)):
            menuItem.state = mode == .split ? .on : .off
            return true
        case #selector(toggleAllowNetwork(_:)):
            menuItem.state = (markdownDocument?.allowNetwork ?? false) ? .on : .off
            return markdownDocument?.fileURL != nil
        case #selector(trustDocument(_:)):
            return markdownDocument?.isUntrusted ?? false
        case #selector(refreshReadView(_:)):
            return mode != .source
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
