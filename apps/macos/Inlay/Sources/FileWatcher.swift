// SPDX-License-Identifier: Apache-2.0
import Foundation

/// Watches a file for changes made by other processes (ADR-0013). NSFilePresenter
/// only reports coordinated writes, so a vnode DispatchSource covers editors that
/// write in place or save by renaming a temporary file over the original.
/// Events are debounced; the owner deduplicates by content.
@MainActor
final class FileWatcher {
    private let url: URL
    private let debounce: TimeInterval
    private let onChange: @MainActor () -> Void
    private var source: DispatchSourceFileSystemObject?
    private var descriptor: Int32 = -1
    private var pending: Task<Void, Never>?
    private var rearm: Task<Void, Never>?

    init(url: URL, debounce: TimeInterval = 0.25, onChange: @escaping @MainActor () -> Void) {
        self.url = url
        self.debounce = debounce
        self.onChange = onChange
        start()
    }

    deinit {
        source?.cancel()
    }

    func stop() {
        pending?.cancel()
        rearm?.cancel()
        source?.cancel()
        source = nil
    }

    private func start() {
        let fd = open(url.path, O_EVTONLY)
        guard fd >= 0 else {
            // The file may be mid-rename; try again shortly.
            scheduleRearm()
            return
        }
        descriptor = fd
        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: [.write, .extend, .attrib, .rename, .delete, .revoke],
            queue: .main
        )
        source.setEventHandler { [weak self] in
            guard let self else { return }
            let events = source.data
            MainActor.assumeIsolated {
                self.changed()
                if !events.intersection([.rename, .delete, .revoke]).isEmpty {
                    // The inode went away (atomic save): re-open the path once the new file exists.
                    self.source?.cancel()
                    self.source = nil
                    self.scheduleRearm()
                }
            }
        }
        source.setCancelHandler { close(fd) }
        source.resume()
        self.source = source
    }

    private func scheduleRearm() {
        rearm?.cancel()
        rearm = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .milliseconds(150))
            guard let self, !Task.isCancelled else { return }
            self.start()
            self.changed()
        }
    }

    private func changed() {
        pending?.cancel()
        let delay = debounce
        pending = Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard let self, !Task.isCancelled else { return }
            self.onChange()
        }
    }
}
