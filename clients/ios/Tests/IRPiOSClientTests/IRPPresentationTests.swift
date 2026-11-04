import XCTest
@testable import IRPiOSClient

final class IRPPresentationTests: XCTestCase {
    private let us = Locale(identifier: "en_US_POSIX")

    func testConnectionToneGlyphAndWord() {
        XCTAssertEqual(irpConnectionPresentation(.online), IRPStatusPresentation(tone: .ok, label: "Online"))
        XCTAssertEqual(irpConnectionPresentation(.degraded).tone, .warn)
        XCTAssertEqual(irpConnectionPresentation(.offline).tone, .danger)
        XCTAssertEqual(irpConnectionPresentation(.unknown).tone, .unknown)
        XCTAssertEqual(irpConnectionPresentation(.offline).spoken, "Status: Offline")
        XCTAssertEqual(Set([IRPTone.ok, .warn, .danger, .observing, .unknown].map(\.glyph)).count, 5)
    }

    func testCheckPresentationDefaultsToWarnNotDanger() {
        XCTAssertEqual(irpCheckPresentation(true, passed: "Available", failed: "Missing").tone, .ok)
        XCTAssertEqual(irpCheckPresentation(false, passed: "Available", failed: "Missing").tone, .warn)
        XCTAssertEqual(irpCheckPresentation(false, passed: "Yes", failed: "No", failedTone: .unknown).tone, .unknown)
    }

    func testFormattersNeverInventValues() {
        XCTAssertEqual(irpFormatPercent(99.5, locale: us), "99.50%")
        XCTAssertEqual(irpFormatPercent(nil), irpNotReported)
        XCTAssertEqual(irpFormatPercent(.nan), irpNotReported)
        XCTAssertEqual(irpFormatLatency(12.34, locale: us), "12.3 ms")
        XCTAssertEqual(irpFormatLatency(-1), irpNotReported)
        XCTAssertEqual(irpFormatCount(3), "3")
        XCTAssertEqual(irpFormatCount(nil), irpNotReported)
        XCTAssertEqual(irpFormatCaptured(nil), irpNotReported)
    }

    func testAge() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        XCTAssertEqual(irpFormatAge(nil, now: now), irpNotReported)
        XCTAssertEqual(irpFormatAge(now.addingTimeInterval(60), now: now), "just now")
        XCTAssertEqual(irpFormatAge(now.addingTimeInterval(-120), now: now), "2 min ago")
        XCTAssertEqual(irpFormatAge(now.addingTimeInterval(-7_200), now: now), "2 h ago")
        XCTAssertEqual(irpFormatAge(now.addingTimeInterval(-172_800), now: now), "2 d ago")
    }

    func testPerformanceRowsKeepAbsentValuesAsNotReported() {
        let rows = irpPerformanceRows(
            IRPAnalyticsSummary(sampleCount: 10, availabilityPercent: 100, medianLatencyMs: nil, packetLossPercent: 0.5),
            locale: us
        )
        XCTAssertEqual(rows.map(\.name), ["Availability", "Median latency", "Packet loss", "Samples"])
        XCTAssertEqual(rows.map(\.value), ["100.00%", irpNotReported, "0.50%", "10"])
    }
}
