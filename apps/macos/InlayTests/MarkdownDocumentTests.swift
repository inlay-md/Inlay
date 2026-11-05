// SPDX-License-Identifier: Apache-2.0
@testable import Inlay
import XCTest

final class MarkdownDocumentTests: XCTestCase {
    @MainActor func testEveryFixtureRoundTripsByteIdentical() throws {
        let files = try TestSupport.fixtureFiles()
        XCTAssertGreaterThan(files.count, 10)
        for file in files {
            let original = try Data(contentsOf: file)
            let doc = MarkdownDocument()
            try doc.read(from: file, ofType: MarkdownDocument.markdownType)
            let written = try doc.data(ofType: MarkdownDocument.markdownType)
            XCTAssertEqual(written, original, "bytes differ for \(file.lastPathComponent)")
            doc.close()
        }
    }

    @MainActor func testDecodingTraits() throws {
        let bom = MarkdownDocument()
        try bom.read(from: TestSupport.fixturesDir.appendingPathComponent("utf8-bom.md"), ofType: MarkdownDocument.markdownType)
        XCTAssertTrue(bom.hasBOM)
        XCTAssertTrue(bom.text.hasPrefix("# UTF-8 BOM"))
        XCTAssertTrue(bom.decodable)

        let bad = MarkdownDocument()
        try bad.read(from: TestSupport.fixturesDir.appendingPathComponent("undecodable.md"), ofType: MarkdownDocument.markdownType)
        XCTAssertFalse(bad.decodable)
        XCTAssertEqual(try bad.data(ofType: MarkdownDocument.markdownType), try Data(contentsOf: TestSupport.fixturesDir.appendingPathComponent("undecodable.md")))

        let unicode = MarkdownDocument()
        try unicode.read(from: TestSupport.fixturesDir.appendingPathComponent("unicode-text.md"), ofType: MarkdownDocument.markdownType)
        XCTAssertTrue(unicode.text.contains("Tiếng Việt có dấu"))
        XCTAssertTrue(unicode.text.contains("🇻🇳"))
    }

    @MainActor func testSaveToTemporaryFileIsByteIdentical() throws {
        let source = TestSupport.fixturesDir.appendingPathComponent("mixed-line-endings.md")
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("inlay-\(UUID().uuidString).md")
        defer { try? FileManager.default.removeItem(at: tmp) }
        let doc = MarkdownDocument()
        try doc.read(from: source, ofType: MarkdownDocument.markdownType)
        try doc.write(to: tmp, ofType: MarkdownDocument.markdownType)
        XCTAssertEqual(try Data(contentsOf: tmp), try Data(contentsOf: source))
    }

    @MainActor func testDocumentRegistersContextForSchemeHandler() throws {
        let file = TestSupport.fixturesDir.appendingPathComponent("gfm-basics.md")
        let doc = MarkdownDocument()
        try doc.read(from: file, ofType: MarkdownDocument.markdownType)
        doc.fileURL = file
        doc.registerContext()
        let ctx = MDViewRegistry.shared.context(for: doc.docId)
        XCTAssertNotNil(ctx)
        XCTAssertEqual(ctx?.folderURL?.standardizedFileURL, TestSupport.fixturesDir.standardizedFileURL)
        XCTAssertEqual(ctx?.sourceProvider().text.prefix(12), "# GFM basics")
        doc.close()
        XCTAssertNil(MDViewRegistry.shared.context(for: doc.docId))
    }
}
