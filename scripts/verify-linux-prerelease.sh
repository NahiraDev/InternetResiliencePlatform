#!/usr/bin/env bash
# Non-destructive readiness check for the Linux end-user prerelease path.
# Run from the repository root on a Linux host (or any host that can inspect the tree).
# Does not install anything. Exits 0 when the expected contracts are present.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "IRP Linux prerelease readiness check (developer-preview, not production-certified)"
echo "Repository: $ROOT"
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

check "systemd unit exists and sets User=irp" "grep -q '^User=irp' infra/systemd/irp-daemon.service"
check "systemd unit grants only CAP_NET_ADMIN" "grep -q 'CapabilityBoundingSet=CAP_NET_ADMIN' infra/systemd/irp-daemon.service && ! grep -q 'CAP_SYS_ADMIN' infra/systemd/irp-daemon.service"
check "host-authorization is fail-closed for dns.write" "grep -q 'euid === 0' apps/daemon/src/host-authorization.ts"
check "PrivilegedMutationBoundary is referenced as sole path" "grep -q PrivilegedMutationBoundary packages/resilience-runtime/src/transactions/privileged-boundary.ts"
check "status reports releaseStatus" "grep -q releaseStatus apps/daemon/src/index.ts"
check "operator guide exists" "test -f docs/operations/linux-enduser-guide.md"
check "example env defaults to safe" "grep -q 'IRP_RUNTIME_MODE=safe' infra/systemd/irp.env.example"

echo
if [ "$fail" -eq 0 ]; then
  echo "All expected Linux prerelease contracts are present in the tree."
  echo "This does not certify production readiness. Remaining blockers include soak evidence (#323),"
  echo "Postgres production evidence (#410/#411), and DNS write under non-root User=irp."
  exit 0
else
  echo "One or more contracts are missing. The Linux end-user path is not yet coherent."
  exit 1
fi
