/**
 * Real Linux route mutation integration test.
 *
 * This test creates an isolated network namespace, a dummy interface, and
 * performs real `ip route add/replace/del` operations through the
 * {@link LinuxRouteExecutor} — the same production code path used by the
 * daemon.
 *
 * Requirements:
 * - `ip` binary available
 * - CAP_NET_ADMIN (or root) to create namespaces and mutate routes
 * - `/run/netns` writable
 *
 * If any requirement is unavailable, the test is SKIPPED with a documented
 * reason — it is never weakened or replaced with a mock.
 */
export {};
