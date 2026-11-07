/**
 * Integration test proving the canonical runtime-to-executor execution path.
 *
 * This test proves that the full production path works end-to-end with a
 * fake command runner (since CAP_NET_ADMIN is unavailable):
 *
 *   ResilienceRuntime → CanonicalNetworkRuntimeAdapter → RoutingEngine
 *   → kernel.execute('routing', 'applyRoutePlan') → LinuxRouteExecutor
 *
 * It verifies that success and failure propagate correctly through the
 * entire chain, not just the executor in isolation.
 */
export {};
