/**
 * Wiring tests proving the production Linux runtime constructs a real
 * ResilienceRuntime with a KernelRuntime, production routing contract, real
 * route discovery provider, connectivity manager with Starlink, and a
 * CanonicalNetworkRuntimeAdapter with supportsLive: true.
 *
 * These tests do NOT mutate host networking. They prove the wiring is real,
 * not simulated.
 */
export {};
