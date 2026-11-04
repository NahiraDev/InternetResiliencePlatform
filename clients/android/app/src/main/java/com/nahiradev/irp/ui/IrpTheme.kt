package com.nahiradev.irp.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * IRP Signal design tokens for Android. Values mirror docs/design/irp-design-tokens.json and are
 * checked against it by apps/api/src/design-tokens.test.ts; change the JSON first.
 */
@Immutable
data class IrpStatusColors(
    val ok: Color,
    val warn: Color,
    val danger: Color,
    val observing: Color,
    val unknown: Color,
) {
    fun forTone(tone: StatusTone): Color = when (tone) {
        StatusTone.OK -> ok
        StatusTone.WARN -> warn
        StatusTone.DANGER -> danger
        StatusTone.OBSERVING -> observing
        StatusTone.UNKNOWN -> unknown
    }
}

private val DarkStatus = IrpStatusColors(
    ok = Color(0xFF4ADE9A),
    warn = Color(0xFFF5C26B),
    danger = Color(0xFFFF7A85),
    observing = Color(0xFF6AA9FF),
    unknown = Color(0xFF9AA9C0),
)

private val LightStatus = IrpStatusColors(
    ok = Color(0xFF0A7F4F),
    warn = Color(0xFF8A5A00),
    danger = Color(0xFFB42335),
    observing = Color(0xFF1D5FD0),
    unknown = Color(0xFF4A5B73),
)

private val DarkScheme: ColorScheme = darkColorScheme(
    primary = Color(0xFF6AA9FF),
    onPrimary = Color(0xFF0A0F1C),
    secondary = Color(0xFF4FD1C5),
    background = Color(0xFF0A0F1C),
    onBackground = Color(0xFFE8EEF9),
    surface = Color(0xFF111827),
    onSurface = Color(0xFFE8EEF9),
    surfaceVariant = Color(0xFF172033),
    onSurfaceVariant = Color(0xFF9AA9C0),
    outline = Color(0xFF2A3A55),
    outlineVariant = Color(0xFF2A3A55),
    error = Color(0xFFFF7A85),
)

private val LightScheme: ColorScheme = lightColorScheme(
    primary = Color(0xFF1D5FD0),
    onPrimary = Color(0xFFFFFFFF),
    secondary = Color(0xFF0B7A75),
    background = Color(0xFFF4F7FB),
    onBackground = Color(0xFF0F1B2D),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF0F1B2D),
    surfaceVariant = Color(0xFFEEF3F9),
    onSurfaceVariant = Color(0xFF4A5B73),
    outline = Color(0xFFC9D6E6),
    outlineVariant = Color(0xFFC9D6E6),
    error = Color(0xFFB42335),
)

val LocalIrpStatusColors = staticCompositionLocalOf { DarkStatus }

/** Follows the system light/dark setting; there is no in-app override to keep in sync. */
@Composable
fun IrpTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalIrpStatusColors provides if (darkTheme) DarkStatus else LightStatus) {
        MaterialTheme(colorScheme = if (darkTheme) DarkScheme else LightScheme, content = content)
    }
}
