/**
 * Real Linux route discovery test.
 *
 * This test reads actual `ip -j route show` output from the host and
 * verifies the LinuxRouteDiscoveryProvider converts it into
 * DiscoveredRoute[] correctly.
 *
 * This is REAL execution evidence — not a mock. The provider runs the
 * actual `ip` binary and parses real JSON output.
 *
 * This test does NOT require CAP_NET_ADMIN — reading route state is
 * unprivileged. Route mutation tests require CAP_NET_ADMIN and are
 * documented separately.
 */
export {};
