import SwiftUI

/// Rounded surface used for every grouped block.
struct IRPCard<Content: View>: View {
    @Environment(\.irpPalette) private var palette
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(palette.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(palette.border, lineWidth: 1))
    }
}

struct IRPSectionTitle: View {
    @Environment(\.irpPalette) private var palette
    let text: String

    var body: some View {
        Text(text)
            .font(.headline)
            .foregroundStyle(palette.text)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Status is always tone colour + glyph + word, never colour alone.
struct IRPStatusPill: View {
    @Environment(\.irpPalette) private var palette
    let status: IRPStatusPresentation

    var body: some View {
        let tone = palette.color(for: status.tone)
        HStack(spacing: 6) {
            Text(status.tone.glyph).accessibilityHidden(true)
            Text(status.label).fontWeight(.semibold)
        }
        .font(.subheadline)
        .foregroundStyle(tone)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(tone.opacity(0.14), in: Capsule())
        .overlay(Capsule().stroke(tone.opacity(0.5), lineWidth: 1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(status.spoken)
    }
}

struct IRPMetricCard: View {
    @Environment(\.irpPalette) private var palette
    let title: String
    let value: String

    var body: some View {
        IRPCard {
            Text(title.uppercased())
                .font(.caption.weight(.semibold))
                .foregroundStyle(palette.muted)
            Text(value)
                .font(.title2.weight(.semibold))
                .foregroundStyle(value == irpNotReported ? palette.muted : palette.text)
                .minimumScaleFactor(0.7)
        }
        .accessibilityElement(children: .combine)
    }
}

struct IRPKeyValueRow: View {
    @Environment(\.irpPalette) private var palette
    let name: String
    let value: String

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline) {
                Text(name).foregroundStyle(palette.muted)
                Spacer(minLength: 12)
                Text(value).foregroundStyle(palette.text).multilineTextAlignment(.trailing)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(name).foregroundStyle(palette.muted)
                Text(value).foregroundStyle(palette.text)
            }
        }
        .font(.subheadline)
        .accessibilityElement(children: .combine)
    }
}

struct IRPCheckRow: View {
    let name: String
    let status: IRPStatusPresentation

    var body: some View {
        HStack {
            Text(name).font(.subheadline)
            Spacer(minLength: 12)
            IRPStatusPill(status: status)
        }
        .accessibilityElement(children: .combine)
    }
}

struct IRPEmptyState: View {
    @Environment(\.irpPalette) private var palette
    let title: String
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(palette.text)
            Text(message).font(.footnote).foregroundStyle(palette.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

struct IRPErrorBanner: View {
    @Environment(\.irpPalette) private var palette
    let message: String
    let onRetry: (() -> Void)?
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                Text(IRPTone.danger.glyph).accessibilityHidden(true)
                Text(message).font(.subheadline)
            }
            .foregroundStyle(palette.danger)
            HStack {
                if let onRetry { Button("Retry", action: onRetry) }
                Button("Dismiss", action: onDismiss)
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(palette.danger.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(palette.danger.opacity(0.5), lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Error: \(message)")
    }
}
