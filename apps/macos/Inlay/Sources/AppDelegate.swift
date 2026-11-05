// SPDX-License-Identifier: Apache-2.0
import AppKit

@main
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var acknowledgements: AcknowledgementsWindowController?

    func applicationWillFinishLaunching(_ notification: Notification) {
        NSApp.mainMenu = MainMenu.build(target: self)
    }

    func applicationShouldOpenUntitledFile(_ sender: NSApplication) -> Bool {
        true
    }

    @objc func showAcknowledgements(_ sender: Any?) {
        if acknowledgements == nil { acknowledgements = AcknowledgementsWindowController() }
        acknowledgements?.showWindow(sender)
    }

    @objc func openWebsite(_ sender: Any?) {
        if let url = URL(string: "https://inlay.live") { NSWorkspace.shared.open(url) }
    }
}
