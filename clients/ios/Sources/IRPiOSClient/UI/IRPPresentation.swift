import Foundation

/// Presentation rules shared by every iOS screen. Pure functions with no SwiftUI dependency, so
/// wording, tones and number formatting are unit-tested. State is always tone + glyph + word.
let irpNotReported = "Not reported"

enum IRPTone: Equatable, Sendable {
    case ok, warn, danger, observing, unknown

    var glyph: String {
        switch self {
        case .ok: return "●"
        case .warn: return "▲"
        case .danger: return "■"
        case .observing: return "◆"
        case .unknown: return "○"
        }
    }
}

struct IRPStatusPresentation: Equatable, Sendable {
    let tone: IRPTone
    let label: String

    /// Spoken form for VoiceOver: the glyph is decorative.
    var spoken: String { "Status: \(label)" }
}

func irpConnectionPresentation(_ state: IRPConnectionState) -> IRPStatusPresentation {
    switch state {
    case .online: return IRPStatusPresentation(tone: .ok, label: "Online")
    case .degraded: return IRPStatusPresentation(tone: .warn, label: "Degraded")
    case .offline: return IRPStatusPresentation(tone: .danger, label: "Offline")
    case .unknown: return IRPStatusPresentation(tone: .unknown, label: "Unknown")
    }
}

/// A yes/no fact the platform reported. "No" is a finding, not necessarily a fault.
func irpCheckPresentation(
    _ passed: Bool,
    passed passedLabel: String,
    failed failedLabel: String,
    failedTone: IRPTone = .warn
) -> IRPStatusPresentation {
    passed
        ? IRPStatusPresentation(tone: .ok, label: passedLabel)
        : IRPStatusPresentation(tone: failedTone, label: failedLabel)
}

func irpFormatPercent(_ value: Double?, locale: Locale = .current) -> String {
    guard let value, value.isFinite else { return irpNotReported }
    return String(format: "%.2f%%", locale: locale, value)
}

func irpFormatLatency(_ value: Double?, locale: Locale = .current) -> String {
    guard let value, value.isFinite, value >= 0 else { return irpNotReported }
    return String(format: "%.1f ms", locale: locale, value)
}

func irpFormatCount(_ value: Int?) -> String {
    guard let value, value >= 0 else { return irpNotReported }
    return String(value)
}

func irpFormatCaptured(_ date: Date?, timeZone: TimeZone = .current, locale: Locale = .current) -> String {
    guard let date else { return irpNotReported }
    let formatter = DateFormatter()
    formatter.locale = locale
    formatter.timeZone = timeZone
    formatter.dateStyle = .medium
    formatter.timeStyle = .short
    return formatter.string(from: date)
}

/// "just now", "3 min ago", "2 h ago", "4 d ago"; a timestamp in the future reads as "just now".
func irpFormatAge(_ date: Date?, now: Date = Date()) -> String {
    guard let date else { return irpNotReported }
    let seconds = Int(now.timeIntervalSince(date))
    switch seconds {
    case ..<45: return "just now"
    case ..<3_600: return "\(seconds / 60) min ago"
    case ..<86_400: return "\(seconds / 3_600) h ago"
    default: return "\(seconds / 86_400) d ago"
    }
}

struct IRPPerformanceRow: Equatable, Sendable {
    let name: String
    let value: String
}

/// Performance rows exactly as the Control Plane reported them; absent values stay "Not reported".
func irpPerformanceRows(_ analytics: IRPAnalyticsSummary, locale: Locale = .current) -> [IRPPerformanceRow] {
    [
        IRPPerformanceRow(name: "Availability", value: irpFormatPercent(analytics.availabilityPercent, locale: locale)),
        IRPPerformanceRow(name: "Median latency", value: irpFormatLatency(analytics.medianLatencyMs, locale: locale)),
        IRPPerformanceRow(name: "Packet loss", value: irpFormatPercent(analytics.packetLossPercent, locale: locale)),
        IRPPerformanceRow(name: "Samples", value: irpFormatCount(analytics.sampleCount)),
    ]
}
