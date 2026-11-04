import SwiftUI

private enum IRPTab: String, CaseIterable, Identifiable {
    case overview = "Overview"
    case network = "Network"
    case security = "Security"
    case diagnostics = "Diagnostics"

    var id: String { rawValue }

    var symbol: String {
        switch self {
        case .overview: return "gauge.with.dots.needle.67percent"
        case .network: return "network"
        case .security: return "lock.shield"
        case .diagnostics: return "list.bullet.rectangle"
        }
    }
}

public struct IRPClientDashboardView: View {
    @ObservedObject private var session: IRPClientSession
    private let tunnelStatus: String

    public init(session: IRPClientSession, tunnelStatus: String = "VPN not configured") {
        self.session = session
        self.tunnelStatus = tunnelStatus
    }

    public var body: some View {
        IRPDashboardScreens(session: session, tunnelStatus: tunnelStatus).irpTheme()
    }
}

/// IRP Signal dashboard. Shows only what the session reports; the sync, autonomy and sign-out
/// actions exist only when the device is enrolled and call the existing session methods.
private struct IRPDashboardScreens: View {
    @ObservedObject private var session: IRPClientSession
    @Environment(\.irpPalette) private var palette
    @State private var loading = false
    @State private var errorMessage: String?
    private let tunnelStatus: String

    init(session: IRPClientSession, tunnelStatus: String) {
        self.session = session
        self.tunnelStatus = tunnelStatus
    }

    var body: some View {
        TabView {
            ForEach(IRPTab.allCases) { tab in
                screen(for: tab)
                    .tabItem { Label(tab.rawValue, systemImage: tab.symbol) }
            }
        }
    }

    private func screen(for tab: IRPTab) -> some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let errorMessage {
                        IRPErrorBanner(
                            message: errorMessage,
                            onRetry: session.state.enrolled ? { Task { await sync() } } : nil,
                            onDismiss: { self.errorMessage = nil }
                        )
                    }
                    content(for: tab)
                }
                .padding(16)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
            .background(palette.background.ignoresSafeArea())
            .navigationTitle(tab.rawValue)
            .refreshable { if session.state.enrolled { await sync() } }
        }
    }

    @ViewBuilder
    private func content(for tab: IRPTab) -> some View {
        switch tab {
        case .overview: overview
        case .network: network
        case .security: security
        case .diagnostics: diagnostics
        }
    }

    // MARK: Overview

    private var overview: some View {
        let state = session.state
        let connection = irpConnectionPresentation(state.connection)
        return VStack(alignment: .leading, spacing: 16) {
            IRPCard {
                Text("CONNECTION").font(.caption.weight(.semibold)).foregroundStyle(palette.muted)
                IRPStatusPill(status: connection)
                if let snapshot = state.snapshot {
                    Text("Captured \(irpFormatAge(snapshot.capturedAt))")
                        .font(.footnote).foregroundStyle(palette.muted)
                } else {
                    IRPEmptyState(
                        title: "No network snapshot yet",
                        message: state.enrolled
                            ? "Pull to refresh or use Sync to capture one."
                            : "This device is not enrolled with a Control Plane, so nothing has been reported."
                    )
                }
                if loading { ProgressView("Syncing…") }
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                IRPMetricCard(title: "Interfaces", value: irpFormatCount(state.snapshot?.interfaceCount))
                IRPMetricCard(
                    title: "Availability",
                    value: irpFormatPercent(state.analytics?.availabilityPercent)
                )
                IRPMetricCard(title: "Median latency", value: irpFormatLatency(state.analytics?.medianLatencyMs))
                IRPMetricCard(title: "Packet loss", value: irpFormatPercent(state.analytics?.packetLossPercent))
            }
            if state.enrolled {
                Button {
                    Task { await sync() }
                } label: {
                    Text("Sync with Control Plane").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(loading)
            }
        }
    }

    // MARK: Network

    private var network: some View {
        let state = session.state
        return VStack(alignment: .leading, spacing: 16) {
            IRPCard {
                IRPSectionTitle(text: "Connectivity")
                if let snapshot = state.snapshot {
                    IRPCheckRow(
                        name: "Default route",
                        status: irpCheckPresentation(snapshot.defaultRouteAvailable, passed: "Available", failed: "Missing")
                    )
                    IRPCheckRow(
                        name: "DNS",
                        status: irpCheckPresentation(snapshot.dnsReachable, passed: "Reachable", failed: "Unreachable")
                    )
                    IRPKeyValueRow(name: "Interfaces", value: irpFormatCount(snapshot.interfaceCount))
                } else {
                    IRPEmptyState(title: "No connectivity data", message: "No network snapshot has been reported yet.")
                }
            }
            IRPCard {
                IRPSectionTitle(text: "Performance")
                if let analytics = state.analytics {
                    ForEach(irpPerformanceRows(analytics), id: \.name) { row in
                        IRPKeyValueRow(name: row.name, value: row.value)
                    }
                } else {
                    IRPEmptyState(title: "No performance data", message: "The Control Plane has not reported analytics for this device.")
                }
            }
            IRPCard {
                IRPSectionTitle(text: "Tunnel")
                IRPKeyValueRow(name: "Network extension", value: tunnelStatus)
            }
        }
    }

    // MARK: Security

    private var security: some View {
        let state = session.state
        return VStack(alignment: .leading, spacing: 16) {
            IRPCard {
                IRPSectionTitle(text: "Enrollment")
                IRPCheckRow(
                    name: "Control Plane",
                    status: irpCheckPresentation(state.enrolled, passed: "Enrolled", failed: "Not enrolled", failedTone: .unknown)
                )
                if state.enrolled {
                    IRPKeyValueRow(name: "Device", value: state.deviceName ?? irpNotReported)
                    IRPKeyValueRow(name: "Device ID", value: state.deviceId ?? irpNotReported)
                }
            }
            IRPCard {
                IRPSectionTitle(text: "Automation")
                Toggle("Autonomous mode", isOn: autonomousMode)
                    .disabled(!state.enrolled || loading)
                    .tint(palette.primary)
                Text(state.enrolled
                     ? "Lets the Control Plane act on this device's behalf within its policy."
                     : "Available once this device is enrolled with a Control Plane.")
                    .font(.footnote).foregroundStyle(palette.muted)
            }
            IRPCard {
                IRPSectionTitle(text: "Security boundary")
                Text("Routing, DNS, gateway selection and failover decisions remain in the IRP Control Plane.")
                    .font(.subheadline).foregroundStyle(palette.text)
            }
            if state.enrolled {
                Button(role: .destructive) {
                    signOut()
                } label: {
                    Text("Sign out").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
        }
    }

    // MARK: Diagnostics

    private var diagnostics: some View {
        let state = session.state
        return VStack(alignment: .leading, spacing: 16) {
            IRPCard {
                IRPSectionTitle(text: "Snapshot")
                if let snapshot = state.snapshot {
                    IRPKeyValueRow(name: "Captured", value: irpFormatCaptured(snapshot.capturedAt))
                    IRPKeyValueRow(name: "Connection", value: irpConnectionPresentation(snapshot.connection).label)
                    IRPKeyValueRow(name: "Interfaces", value: irpFormatCount(snapshot.interfaceCount))
                } else {
                    IRPEmptyState(title: "No snapshot", message: "Nothing has been captured on this device yet.")
                }
            }
            IRPCard {
                IRPSectionTitle(text: "Client")
                IRPKeyValueRow(name: "State revision", value: String(state.revision))
                IRPKeyValueRow(name: "Samples", value: irpFormatCount(state.analytics?.sampleCount))
                IRPKeyValueRow(name: "Autonomous mode", value: state.policy.autonomousMode ? "On" : "Off")
            }
        }
    }

    // MARK: Actions (existing session methods only)

    private var autonomousMode: Binding<Bool> {
        Binding(
            get: { session.state.policy.autonomousMode },
            set: { enabled in
                Task {
                    loading = true
                    defer { loading = false }
                    do {
                        try await session.setAutonomousMode(enabled)
                        errorMessage = nil
                    } catch {
                        errorMessage = "Could not change autonomous mode: \(error.localizedDescription)"
                    }
                }
            }
        )
    }

    private func sync() async {
        loading = true
        defer { loading = false }
        do {
            try await session.refresh()
            errorMessage = nil
        } catch {
            errorMessage = "Sync failed: \(error.localizedDescription)"
        }
    }

    private func signOut() {
        do {
            try session.signOut()
            errorMessage = nil
        } catch {
            errorMessage = "Sign out failed: \(error.localizedDescription)"
        }
    }
}
