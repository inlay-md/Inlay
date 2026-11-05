// SPDX-License-Identifier: Apache-2.0
import AppKit

/// Brand colours used by native chrome (design/ui tokens). Dynamic for light/dark.
enum InlayColor {
    static let verdigris = NSColor(name: "inlay.verdigris") { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            ? NSColor(srgbRed: 0x5F / 255, green: 0xC9 / 255, blue: 0xC0 / 255, alpha: 1)
            : NSColor(srgbRed: 0x1F / 255, green: 0x7A / 255, blue: 0x7A / 255, alpha: 1)
    }
    static let brass = NSColor(name: "inlay.brass") { appearance in
        appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            ? NSColor(srgbRed: 0xE0 / 255, green: 0xA8 / 255, blue: 0x3A / 255, alpha: 1)
            : NSColor(srgbRed: 0x9A / 255, green: 0x6E / 255, blue: 0x1A / 255, alpha: 1)
    }
}

/// The 30 pt pane header from design/ui/app-split-mode.html: an uppercase title and a muted
/// detail ("Ln 14, Col 27" for Source, "scroll synced" for Read). Shown in Split mode.
final class PaneHeaderView: NSView {
    private let titleLabel = NSTextField(labelWithString: "")
    private let detailLabel = NSTextField(labelWithString: "")
    private let border = NSBox()

    var title: String {
        get { titleLabel.stringValue }
        set { titleLabel.stringValue = newValue.uppercased() }
    }

    var detail: String {
        get { detailLabel.stringValue }
        set { detailLabel.stringValue = newValue }
    }

    init(title: String, detail: String = "") {
        super.init(frame: .zero)
        titleLabel.font = .systemFont(ofSize: 11, weight: .semibold)
        titleLabel.textColor = .secondaryLabelColor
        titleLabel.stringValue = title.uppercased()
        titleLabel.setAccessibilityIdentifier("inlay-pane-title")
        detailLabel.font = .systemFont(ofSize: 11)
        detailLabel.textColor = .tertiaryLabelColor
        detailLabel.stringValue = detail
        detailLabel.lineBreakMode = .byTruncatingTail
        detailLabel.setAccessibilityIdentifier("inlay-pane-detail")
        let row = NSStackView(views: [titleLabel, detailLabel])
        row.orientation = .horizontal
        row.alignment = .firstBaseline
        row.spacing = 8
        row.edgeInsets = NSEdgeInsets(top: 0, left: 14, bottom: 0, right: 14)
        row.translatesAutoresizingMaskIntoConstraints = false
        border.boxType = .separator
        border.translatesAutoresizingMaskIntoConstraints = false
        addSubview(row)
        addSubview(border)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: leadingAnchor),
            row.trailingAnchor.constraint(equalTo: trailingAnchor),
            row.centerYAnchor.constraint(equalTo: centerYAnchor),
            border.leadingAnchor.constraint(equalTo: leadingAnchor),
            border.trailingAnchor.constraint(equalTo: trailingAnchor),
            border.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
        setContentHuggingPriority(.required, for: .vertical)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not supported") }
}

/// A split-view pane: an optional header above a webview (Auto Layout; the header collapses to 0 pt
/// when hidden). Hosted by `PaneViewController` inside an `NSSplitViewController`.
final class PaneView: NSView {
    let header: PaneHeaderView
    let content: NSView
    private var headerHeight: NSLayoutConstraint!

    init(header: PaneHeaderView, content: NSView) {
        self.header = header
        self.content = content
        super.init(frame: .zero)
        header.translatesAutoresizingMaskIntoConstraints = false
        content.translatesAutoresizingMaskIntoConstraints = false
        addSubview(header)
        addSubview(content)
        headerHeight = header.heightAnchor.constraint(equalToConstant: 30)
        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: topAnchor),
            header.leadingAnchor.constraint(equalTo: leadingAnchor),
            header.trailingAnchor.constraint(equalTo: trailingAnchor),
            headerHeight,
            content.topAnchor.constraint(equalTo: header.bottomAnchor),
            content.leadingAnchor.constraint(equalTo: leadingAnchor),
            content.trailingAnchor.constraint(equalTo: trailingAnchor),
            content.bottomAnchor.constraint(equalTo: bottomAnchor),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not supported") }

    var showsHeader: Bool = true {
        didSet {
            header.isHidden = !showsHeader
            headerHeight.constant = showsHeader ? 30 : 0
        }
    }
}

final class PaneViewController: NSViewController {
    let pane: PaneView

    init(pane: PaneView) {
        self.pane = pane
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not supported") }

    override func loadView() {
        view = pane
    }
}

/// Split divider that carries the scroll-sync marker: a short verdigris tick at the relative
/// position of the editor's top line, so the eye can find where the two panes meet.
final class SyncSplitView: NSSplitView {
    /// 0…1, the editor's top source line over the document's line count; nil hides the marker.
    var syncFraction: Double? {
        didSet { if syncFraction != oldValue { needsDisplay = true } }
    }

    /// Centre the divider on the next layout pass that has a width (set when Split mode is entered).
    var centreDividerOnLayout = false

    override var dividerThickness: CGFloat { 1 }

    override func layout() {
        super.layout()
        if centreDividerOnLayout, bounds.width > 0, arrangedSubviews.filter({ !$0.isHidden }).count > 1 {
            centreDividerOnLayout = false
            setPosition(floor(bounds.width / 2), ofDividerAt: 0)
        }
    }

    override func drawDivider(in rect: NSRect) {
        NSColor.separatorColor.setFill()
        rect.fill()
        guard let fraction = syncFraction, arrangedSubviews.filter({ !$0.isHidden }).count > 1 else { return }
        let height: CGFloat = 22
        let span = max(0, rect.height - height)
        let offset = span * CGFloat(max(0, min(1, fraction)))
        // Fraction 0 is the top of the document.
        let top = isFlipped ? rect.minY + offset : rect.maxY - height - offset
        let marker = NSRect(x: rect.midX - 1.5, y: top, width: 3, height: height)
        InlayColor.verdigris.setFill()
        NSBezierPath(roundedRect: marker, xRadius: 1.5, yRadius: 1.5).fill()
    }
}

/// Native banner for the on-disk conflict (ADR-0030): the file changed while there are unsaved edits.
final class ConflictBannerView: NSView {
    var onReload: (() -> Void)?
    var onKeep: (() -> Void)?
    private let label = NSTextField(wrappingLabelWithString: "This file was changed by another app. Reload it and lose your edits, or keep editing and decide when you save.")

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.backgroundColor = NSColor.systemOrange.withAlphaComponent(0.22).cgColor
        let icon = NSImageView(image: NSImage(systemSymbolName: "arrow.triangle.2.circlepath.doc.on.clipboard", accessibilityDescription: "Changed on disk") ?? NSImage())
        icon.contentTintColor = .labelColor
        label.font = .systemFont(ofSize: NSFont.systemFontSize)
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let reload = NSButton(title: "Reload from Disk", target: self, action: #selector(reloadPressed(_:)))
        reload.bezelStyle = .rounded
        reload.setAccessibilityIdentifier("inlay-conflict-reload")
        let keep = NSButton(title: "Keep Editing", target: self, action: #selector(keepPressed(_:)))
        keep.bezelStyle = .rounded
        keep.setAccessibilityIdentifier("inlay-conflict-keep")
        let row = NSStackView(views: [icon, label, keep, reload])
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
        setAccessibilityIdentifier("inlay-conflict-banner")
        isHidden = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not supported") }

    @objc private func reloadPressed(_ sender: Any?) { onReload?() }
    @objc private func keepPressed(_ sender: Any?) { onKeep?() }
}
