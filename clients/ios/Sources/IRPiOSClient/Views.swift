import SwiftUI

public struct IRPClientDashboardView: View {
    @ObservedObject private var session: IRPClientSession

    public init(session: IRPClientSession) {
        self.session = session
    }

    public var body: some View {
        NavigationStack {
            List {
                Section("Connection") {
                    LabeledContent("State", value: session.state.connection.rawValue.capitalized)
                    LabeledContent("Revision", value: String(session.state.revision))
                    LabeledContent("Interfaces", value: interfaceCount)
                }

                Section("Performance") {
                    LabeledContent("Availability", value: availability)
                    LabeledContent("Median latency", value: latency)
                    LabeledContent("Packet loss", value: packetLoss)
                }

                Section("Policy") {
                    Toggle("Autonomous mode", isOn: autonomousMode)
                        .disabled(!session.state.enrolled)
                }
            }
            .navigationTitle("IRP")
        }
    }

    private var autonomousMode: Binding<Bool> {
        Binding(
            get: { session.state.policy.autonomousMode },
            set: { enabled in
                Task {
                    _ = try? await session.setAutonomousMode(enabled)
                }
            }
        )
    }

    private var interfaceCount: String {
        guard let snapshot = session.state.snapshot else { return "—" }
        return String(snapshot.interfaceCount)
    }

    private var availability: String {
        guard let analytics = session.state.analytics else { return "—" }
        return String(format: "%.2f%%", analytics.availabilityPercent)
    }

    private var latency: String {
        guard let value = session.state.analytics?.medianLatencyMs else { return "—" }
        return String(format: "%.1f ms", value)
    }

    private var packetLoss: String {
        guard let value = session.state.analytics?.packetLossPercent else { return "—" }
        return String(format: "%.2f%%", value)
    }
}
