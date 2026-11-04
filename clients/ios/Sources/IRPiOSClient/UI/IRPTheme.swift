import SwiftUI

/// IRP Signal design tokens for iOS. Values mirror docs/design/irp-design-tokens.json and are
/// checked against it by apps/api/src/design-tokens.test.ts; change the JSON first.
public struct IRPPalette: Equatable, Sendable {
    public let background: Color
    public let surface: Color
    public let surfaceRaised: Color
    public let border: Color
    public let text: Color
    public let muted: Color
    public let primary: Color
    public let accent: Color
    public let ok: Color
    public let warn: Color
    public let danger: Color

    public static let dark = IRPPalette(
        background: Color(hex: 0x0A0F1C),
        surface: Color(hex: 0x111827),
        surfaceRaised: Color(hex: 0x172033),
        border: Color(hex: 0x2A3A55),
        text: Color(hex: 0xE8EEF9),
        muted: Color(hex: 0x9AA9C0),
        primary: Color(hex: 0x6AA9FF),
        accent: Color(hex: 0x4FD1C5),
        ok: Color(hex: 0x4ADE9A),
        warn: Color(hex: 0xF5C26B),
        danger: Color(hex: 0xFF7A85)
    )

    public static let light = IRPPalette(
        background: Color(hex: 0xF4F7FB),
        surface: Color(hex: 0xFFFFFF),
        surfaceRaised: Color(hex: 0xEEF3F9),
        border: Color(hex: 0xC9D6E6),
        text: Color(hex: 0x0F1B2D),
        muted: Color(hex: 0x4A5B73),
        primary: Color(hex: 0x1D5FD0),
        accent: Color(hex: 0x0B7A75),
        ok: Color(hex: 0x0A7F4F),
        warn: Color(hex: 0x8A5A00),
        danger: Color(hex: 0xB42335)
    )

    public static func resolve(_ scheme: ColorScheme) -> IRPPalette {
        scheme == .dark ? .dark : .light
    }

    func color(for tone: IRPTone) -> Color {
        switch tone {
        case .ok: return ok
        case .warn: return warn
        case .danger: return danger
        case .observing: return primary
        case .unknown: return muted
        }
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

private struct IRPPaletteKey: EnvironmentKey {
    static let defaultValue = IRPPalette.dark
}

extension EnvironmentValues {
    var irpPalette: IRPPalette {
        get { self[IRPPaletteKey.self] }
        set { self[IRPPaletteKey.self] = newValue }
    }
}

private struct IRPThemeModifier: ViewModifier {
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        let palette = IRPPalette.resolve(scheme)
        content
            .environment(\.irpPalette, palette)
            .tint(palette.primary)
    }
}

extension View {
    /// Applies the IRP palette for the current light/dark appearance (follows the system setting).
    public func irpTheme() -> some View {
        modifier(IRPThemeModifier())
    }
}
