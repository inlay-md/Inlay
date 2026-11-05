// SPDX-License-Identifier: Apache-2.0
import AppKit

/// About → Acknowledgements: shows the generated THIRD_PARTY_NOTICES.md.
final class AcknowledgementsWindowController: NSWindowController {
    init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 640, height: 520),
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Acknowledgements"
        window.center()
        let scroll = NSTextView.scrollableTextView()
        let textView = scroll.documentView as! NSTextView
        textView.isEditable = false
        textView.isRichText = false
        textView.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        textView.textContainerInset = NSSize(width: 12, height: 12)
        textView.string = WebBundle.thirdPartyNotices() ?? "THIRD_PARTY_NOTICES.md is missing from this build."
        window.contentView = scroll
        super.init(window: window)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not supported") }
}
