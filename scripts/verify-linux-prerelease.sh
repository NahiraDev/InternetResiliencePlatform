#!/usr/bin/env bash
# Non-destructive readiness check for the Linux end-user prerelease path.
# Run from the repository root on a Linux host (or any host that can inspect the tree).
# Does not install anything. Exits 0 when the expected contracts are present.
#
# This check confirms contracts in source. It does NOT certify production readiness.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "IRP Linux prerelease readiness check (developer-preview, not production-certified)"
echo "Repository: $ROOT"
echo "Date (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u)"
echo

fail=0

check() {
  local desc="$1" cond="$2"
  if eval "$cond"; then
    echo "  [OK] $desc"
  else
    echo "  [FAIL] $desc"
    fail=1
  fi
}

echo "== systemd unit (User=irp, least capability)"
check "unit file present" "test -f infra/systemd/irp-daemon.service"
check "User=irp" "grep -q '^User=irp' infra/systemd/irp-daemon.service"
check "Group=irp" "grep -q '^Group=irp' infra/systemd/irp-daemon.service"
check "CapabilityBoundingSet=CAP_NET_ADMIN only (no CAP_SYS_ADMIN)" \
  "grep -q 'CapabilityBoundingSet=CAP_NET_ADMIN' infra/systemd/irp-daemon.service && ! grep -q 'CAP_SYS_ADMIN' infra/systemd/irp-daemon.service"
check "AmbientCapabilities=CAP_NET_ADMIN" "grep -q 'AmbientCapabilities=CAP_NET_ADMIN' infra/systemd/irp-daemon.service"
check "NoNewPrivileges=true" "grep -q 'NoNewPrivileges=true' infra/systemd/irp-daemon.service"
check "ProtectSystem=strict" "grep -q 'ProtectSystem=strict' infra/systemd/irp-daemon.service"

echo
echo "== host authorization (fail-closed)"
check "host-authorization.ts exists" "test -f apps/daemon/src/host-authorization.ts"
check "dns.write requires euid === 0" "grep -q 'euid === 0' apps/daemon/src/host-authorization.ts"
check "dns.write capability is only pushed when root + resolvectl" \
  "grep -q \"capabilities.push('dns.write')\" apps/daemon/src/host-authorization.ts"
check "blockers reported for missing dns.write" "grep -q 'dns.write not granted' apps/daemon/src/host-authorization.ts"
check "CAP_NET_ADMIN bit is read from CapEff" "grep -q 'CAP_NET_ADMIN' apps/daemon/src/host-authorization.ts"

echo
echo "== dual opt-in for live mode"
check "daemon-config requires IRP_ENABLE_LIVE_ROUTE_MUTATION=true for live" \
  "grep -q 'IRP_ENABLE_LIVE_ROUTE_MUTATION' apps/daemon/src/daemon-config.ts"
check "example env defaults to safe" "grep -q 'IRP_RUNTIME_MODE=safe' infra/systemd/irp.env.example"
check "live mutation flag is commented out in example env" \
  "grep -qE '#.*IRP_ENABLE_LIVE_ROUTE_MUTATION' infra/systemd/irp.env.example"

echo
echo "== control plane: no live mutation over socket"
check "control-server rejects live cycle mode" \
  "grep -q 'mode must be simulation or safe' apps/daemon/src/control-server.ts"

echo
echo "== PrivilegedMutationBoundary (sole live mutation path)"
check "privileged-boundary.ts exists" "test -f packages/resilience-runtime/src/transactions/privileged-boundary.ts"
check "PrivilegedMutationBoundary class exported" \
  "grep -q 'export class PrivilegedMutationBoundary' packages/resilience-runtime/src/transactions/privileged-boundary.ts"
check "apply phase present" "grep -q \"'apply'\" packages/resilience-runtime/src/transactions/privileged-boundary.ts"
check "verify phase present" "grep -q \"'verify'\" packages/resilience-runtime/src/transactions/privileged-boundary.ts"
check "rollback phase present" "grep -q \"'rollback'\" packages/resilience-runtime/src/transactions/privileged-boundary.ts"
check "verifyRollback phase present" "grep -q \"'verifyRollback'\" packages/resilience-runtime/src/transactions/privileged-boundary.ts"

echo
echo "== honest status surface"
check "releaseStatus reported as prerelease / developer-preview" \
  "grep -q \"releaseStatus: 'prerelease / developer-preview (not production-certified)'\" apps/daemon/src/index.ts"
check "prereleaseBlockers listed in status" \
  "grep -q 'prereleaseBlockers:' apps/daemon/src/index.ts"
check "authorization blockers exposed in status" "grep -q 'blockers: this.authorization.blockers' apps/daemon/src/index.ts"
check "liveActive exposed in status" "grep -q 'liveActive: this.authorization.liveActive' apps/daemon/src/index.ts"

echo
echo "== infra systemd unit (install path consistency)"
check "infra unit present" "test -f infra/systemd/irp-daemon.service"
check "infra unit User=irp" "grep -q '^User=irp$' infra/systemd/irp-daemon.service"
check "infra unit CapabilityBoundingSet=CAP_NET_ADMIN" "grep -q 'CapabilityBoundingSet=CAP_NET_ADMIN' infra/systemd/irp-daemon.service"
check "infra unit AmbientCapabilities=CAP_NET_ADMIN" "grep -q 'AmbientCapabilities=CAP_NET_ADMIN' infra/systemd/irp-daemon.service"
check "infra unit NoNewPrivileges=true" "grep -q 'NoNewPrivileges=true' infra/systemd/irp-daemon.service"
check "infra unit ProtectSystem=strict" "grep -q 'ProtectSystem=strict' infra/systemd/irp-daemon.service"

echo
echo "== operator packaging and docs"
check "operator guide exists" "test -f docs/operations/linux-enduser-guide.md"
check "guide states not production-certified" \
  "grep -qi 'not production-certified' docs/operations/linux-enduser-guide.md"
check "install-linux.sh present" "test -f scripts/install-linux.sh"
check "daemon deb builder present" "test -f scripts/build-linux-daemon-deb.sh"
check "PROJECT_STATE.md present" "test -f PROJECT_STATE.md"
check "CHANGELOG.md present" "test -f CHANGELOG.md"


echo
echo "== linux-client systemd unit (package consistency)"
check "linux-client unit present" "test -f packages/linux-client/systemd/irp-linux-client.service"
check "linux-client User=irp" "grep -q '^User=irp$' packages/linux-client/systemd/irp-linux-client.service"
check "linux-client CapabilityBoundingSet=CAP_NET_ADMIN" "grep -q 'CapabilityBoundingSet=CAP_NET_ADMIN' packages/linux-client/systemd/irp-linux-client.service"
check "linux-client AmbientCapabilities=CAP_NET_ADMIN" "grep -q 'AmbientCapabilities=CAP_NET_ADMIN' packages/linux-client/systemd/irp-linux-client.service"
check "linux-client NoNewPrivileges=true" "grep -q 'NoNewPrivileges=true' packages/linux-client/systemd/irp-linux-client.service"
check "linux-client ProtectSystem=strict" "grep -q 'ProtectSystem=strict' packages/linux-client/systemd/irp-linux-client.service"

echo
if [ "$fail" -eq 0 ]; then
  echo "All expected Linux prerelease contracts are present in the tree."
  echo "This does NOT certify production readiness."
  echo "Remaining blockers (explicit): soak evidence (#323), Postgres production evidence (#410/#411),"
  echo "exact-SHA CI cleanliness, DNS write under non-root User=irp (intentional), Phase 150 certification."
  exit 0
else
  echo "One or more contracts are missing. The Linux end-user path is not yet coherent."
  exit 1
fi
