import SwiftUI

@main
struct IRPiOSApp: App {
    @State private var tunnelStatus = "VPN not configured"

    var body: some Scene {
        WindowGroup {
            IRPAppRootView(status: $tunnelStatus)
        }
    }
}

private struct IRPAppRootView: View {
    @Binding var status: String

    var body: some View {
        NavigationStack {
            List {
                Section("IRP") {
                    LabeledContent("Network extension", value: status)
                }

                Section("Security boundary") {
                    Text("Routing, DNS, gateway selection and failover decisions remain in the IRP Control Plane.")
                }
            }
            .navigationTitle("Internet Resilience")
        }
    }
}
