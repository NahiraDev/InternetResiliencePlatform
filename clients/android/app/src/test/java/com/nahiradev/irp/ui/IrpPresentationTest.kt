package com.nahiradev.irp.ui

import com.nahiradev.irp.AnalyticsSummary
import com.nahiradev.irp.ConnectionState
import java.time.Instant
import java.time.ZoneOffset
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class IrpPresentationTest {
    @Test
    fun everyConnectionStateHasAToneAGlyphAndAWord() {
        val expected = mapOf(
            ConnectionState.ONLINE to (StatusTone.OK to "Online"),
            ConnectionState.DEGRADED to (StatusTone.WARN to "Degraded"),
            ConnectionState.OFFLINE to (StatusTone.DANGER to "Offline"),
            ConnectionState.UNKNOWN to (StatusTone.UNKNOWN to "Unknown"),
        )
        ConnectionState.values().forEach { state ->
            val presentation = connectionPresentation(state)
            assertEquals(expected.getValue(state).first, presentation.tone)
            assertEquals(expected.getValue(state).second, presentation.label)
            assertTrue(presentation.tone.glyph.isNotBlank())
            assertEquals("Status: ${presentation.label}", presentation.spoken)
        }
    }

    @Test
    fun unknownIsNeverPresentedAsHealthy() {
        assertTrue(connectionPresentation(ConnectionState.UNKNOWN).tone != StatusTone.OK)
    }

    @Test
    fun missingOrInvalidNumbersAreNotReportedRatherThanZero() {
        assertEquals(NOT_REPORTED, formatPercent(null, Locale.US))
        assertEquals(NOT_REPORTED, formatPercent(Double.NaN, Locale.US))
        assertEquals(NOT_REPORTED, formatLatency(null, Locale.US))
        assertEquals(NOT_REPORTED, formatLatency(-1.0, Locale.US))
        assertEquals(NOT_REPORTED, formatCount(null))
        assertEquals(NOT_REPORTED, formatCount(-3))
    }

    @Test
    fun formatsReportedNumbers() {
        assertEquals("99.50%", formatPercent(99.5, Locale.US))
        assertEquals("24.0 ms", formatLatency(24.0, Locale.US))
        assertEquals("0.00%", formatPercent(0.0, Locale.US))
        assertEquals("7", formatCount(7))
    }

    @Test
    fun ageReadsNaturally() {
        val now = Instant.parse("2026-11-03T12:00:00Z")
        assertEquals("just now", formatAge(now.minusSeconds(10), now))
        assertEquals("just now", formatAge(now.plusSeconds(30), now))
        assertEquals("5 min ago", formatAge(now.minusSeconds(300), now))
        assertEquals("2 h ago", formatAge(now.minusSeconds(7_200), now))
        assertEquals("3 d ago", formatAge(now.minusSeconds(3 * 86_400L), now))
        assertEquals(NOT_REPORTED, formatAge(null, now))
        assertEquals(NOT_REPORTED, formatCaptured(null))
    }

    @Test
    fun capturedTimeUsesTheGivenZoneAndLocale() {
        val text = formatCaptured(Instant.parse("2026-11-03T12:30:00Z"), ZoneOffset.UTC, Locale.US)
        assertTrue(text, text.contains("12:30"))
    }

    @Test
    fun performanceRowsKeepAbsentValuesAbsent() {
        val rows = performanceRows(AnalyticsSummary(sampleCount = 12, availabilityPercent = 99.0, medianLatencyMs = null, packetLossPercent = 0.25), Locale.US)
        assertEquals(
            listOf(
                PerformanceRow("Availability", "99.00%"),
                PerformanceRow("Median latency", NOT_REPORTED),
                PerformanceRow("Packet loss", "0.25%"),
                PerformanceRow("Samples", "12"),
            ),
            rows,
        )
    }

    @Test
    fun checkFailuresDefaultToWarningNotDanger() {
        assertEquals(StatusTone.OK, checkPresentation(true, "Validated", "Not validated").tone)
        assertEquals(StatusTone.WARN, checkPresentation(false, "Validated", "Not validated").tone)
        assertEquals(StatusTone.DANGER, checkPresentation(false, "Available", "Unavailable", StatusTone.DANGER).tone)
    }
}
