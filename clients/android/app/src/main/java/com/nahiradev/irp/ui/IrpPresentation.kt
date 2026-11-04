package com.nahiradev.irp.ui

import com.nahiradev.irp.AnalyticsSummary
import com.nahiradev.irp.ConnectionState
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/**
 * Presentation rules shared by every Android screen. No Compose or Android imports, so the
 * wording, tones and number formatting are unit-tested on the JVM. Values mirror
 * docs/design/irp-design-tokens.json: state is always a tone, a glyph AND a word.
 */
const val NOT_REPORTED = "Not reported"

enum class StatusTone(val glyph: String) {
    OK("●"),
    WARN("▲"),
    DANGER("■"),
    OBSERVING("◆"),
    UNKNOWN("○"),
}

data class StatusPresentation(val tone: StatusTone, val label: String) {
    /** Spoken form for accessibility services: the glyph is decorative. */
    val spoken: String get() = "Status: $label"
}

fun connectionPresentation(state: ConnectionState): StatusPresentation = when (state) {
    ConnectionState.ONLINE -> StatusPresentation(StatusTone.OK, "Online")
    ConnectionState.DEGRADED -> StatusPresentation(StatusTone.WARN, "Degraded")
    ConnectionState.OFFLINE -> StatusPresentation(StatusTone.DANGER, "Offline")
    ConnectionState.UNKNOWN -> StatusPresentation(StatusTone.UNKNOWN, "Unknown")
}

/** A yes/no fact the platform reported. "No" is a finding, not necessarily a fault. */
fun checkPresentation(passed: Boolean, passedLabel: String, failedLabel: String, failedTone: StatusTone = StatusTone.WARN) =
    if (passed) StatusPresentation(StatusTone.OK, passedLabel) else StatusPresentation(failedTone, failedLabel)

fun formatPercent(value: Double?, locale: Locale = Locale.getDefault()): String =
    if (value == null || value.isNaN() || value.isInfinite()) NOT_REPORTED else String.format(locale, "%.2f%%", value)

fun formatLatency(value: Double?, locale: Locale = Locale.getDefault()): String =
    if (value == null || value.isNaN() || value.isInfinite() || value < 0) NOT_REPORTED else String.format(locale, "%.1f ms", value)

fun formatCount(value: Int?): String = if (value == null || value < 0) NOT_REPORTED else value.toString()

fun formatCaptured(
    at: Instant?,
    zone: ZoneId = ZoneId.systemDefault(),
    locale: Locale = Locale.getDefault(),
): String =
    if (at == null) NOT_REPORTED
    else DateTimeFormatter.ofLocalizedDateTime(FormatStyle.MEDIUM, FormatStyle.SHORT).withLocale(locale).withZone(zone).format(at)

/** "just now", "3 min ago", "2 h ago", "4 d ago"; a timestamp in the future is reported as "just now". */
fun formatAge(at: Instant?, now: Instant = Instant.now()): String {
    if (at == null) return NOT_REPORTED
    val seconds = Duration.between(at, now).seconds
    return when {
        seconds < 45 -> "just now"
        seconds < 3_600 -> "${seconds / 60} min ago"
        seconds < 86_400 -> "${seconds / 3_600} h ago"
        else -> "${seconds / 86_400} d ago"
    }
}

/** Performance rows exactly as the Control Plane reported them; absent values stay "Not reported". */
data class PerformanceRow(val name: String, val value: String)

fun performanceRows(analytics: AnalyticsSummary, locale: Locale = Locale.getDefault()): List<PerformanceRow> = listOf(
    PerformanceRow("Availability", formatPercent(analytics.availabilityPercent, locale)),
    PerformanceRow("Median latency", formatLatency(analytics.medianLatencyMs, locale)),
    PerformanceRow("Packet loss", formatPercent(analytics.packetLossPercent, locale)),
    PerformanceRow("Samples", formatCount(analytics.sampleCount)),
)
