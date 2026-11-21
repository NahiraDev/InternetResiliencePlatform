#!/usr/bin/env bash
# Build a Debian package for the IRP daemon (Linux-first prerelease).
# Requires: Node.js >= 24, pnpm, dpkg-deb, a prior `pnpm install --frozen-lockfile`.
# Usage: scripts/build-linux-daemon-deb.sh
# Output: dist/linux/irp-daemon_<version>_<arch>.deb + .sha256
set -euo pipefail

# Fail closed on insufficient Node (package requires >= 24).
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "error: Node.js >= 24 is required (found $(node -v 2>/dev/null || echo 'none'))." >&2
  echo "Install Node 24+ before building the Debian package." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${IRP_DAEMON_VERSION:-0.2.6}"
ARCH="${IRP_LINUX_ARCH:-amd64}"
OUT_DIR="${IRP_LINUX_OUT_DIR:-$ROOT_DIR/dist/linux}"
PKG_ROOT="$OUT_DIR/daemon-package"
DAEMON_ROOT="$PKG_ROOT/usr/lib/irp/daemon"
CLI_ROOT="$PKG_ROOT/usr/lib/irp/cli"
PKG_NAME="irp-daemon_${VERSION}_${ARCH}.deb"

rm -rf "$OUT_DIR/daemon-package" "$OUT_DIR/$PKG_NAME" "$OUT_DIR/$PKG_NAME.sha256" 2>/dev/null || true
mkdir -p "$PKG_ROOT/DEBIAN" \
  "$PKG_ROOT/usr/lib/systemd/system" \
  "$PKG_ROOT/usr/bin" \
  "$PKG_ROOT/etc/irp" \
  "$DAEMON_ROOT" \
  "$CLI_ROOT"

echo "==> Building daemon and CLI workspace packages"
pnpm --dir "$ROOT_DIR" --filter @irp/daemon... --filter @irp/cli... build

echo "==> Deploying production trees"
# pnpm deploy produces a self-contained tree with production deps.
pnpm --dir "$ROOT_DIR" --filter @irp/daemon deploy --prod --legacy "$DAEMON_ROOT"
pnpm --dir "$ROOT_DIR" --filter @irp/cli deploy --prod --legacy "$CLI_ROOT"

# Wrapper so `irp` is on PATH.
cat > "$PKG_ROOT/usr/bin/irp" <<'EOF'
#!/bin/sh
exec /usr/bin/node /usr/lib/irp/cli/dist/index.js "$@"
EOF
chmod 0755 "$PKG_ROOT/usr/bin/irp"

# systemd unit (paths already match /usr/lib/irp/daemon)
install -m 0644 "$ROOT_DIR/infra/systemd/irp-daemon.service" \
  "$PKG_ROOT/usr/lib/systemd/system/irp-daemon.service"
# Adjust WorkingDirectory and ExecStart if the unit hard-codes /opt/irp
sed -i 's#WorkingDirectory=/opt/irp/daemon#WorkingDirectory=/usr/lib/irp/daemon#' \
  "$PKG_ROOT/usr/lib/systemd/system/irp-daemon.service"
sed -i 's#ExecStart=/usr/bin/node dist/index.js#ExecStart=/usr/bin/node /usr/lib/irp/daemon/dist/index.js#' \
  "$PKG_ROOT/usr/lib/systemd/system/irp-daemon.service"

# Example environment (safe defaults)
install -m 0644 "$ROOT_DIR/infra/systemd/irp.env.example" \
  "$PKG_ROOT/etc/irp/irp.env.example"

cat > "$PKG_ROOT/DEBIAN/control" <<EOF
Package: irp-daemon
Version: $VERSION
Section: net
Priority: optional
Architecture: $ARCH
Depends: nodejs (>= 24.0.0), iproute2
Recommends: systemd-resolved
Maintainer: Internet Resilience Platform contributors
Description: Internet Resilience Platform daemon (Linux prerelease)
 Observes network health, records decisions, and (only when explicitly
 opted-in and authorized) applies bounded, verified, rollback-capable
 route changes. DNS write is disabled under the non-root irp service
 account. Prerelease / developer-preview only — not production-certified.
EOF

cat > "$PKG_ROOT/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -eu

if ! getent group irp >/dev/null 2>&1; then
  groupadd --system irp
fi
if ! getent passwd irp >/dev/null 2>&1; then
  useradd --system --gid irp --home-dir /var/lib/irp --shell /usr/sbin/nologin irp
fi

install -d -o irp -g irp -m 0750 /var/lib/irp
install -d -m 0755 /etc/irp
if [ ! -f /etc/irp/irp.env ]; then
  install -m 0640 -g irp /etc/irp/irp.env.example /etc/irp/irp.env
fi

if [ -d /run/systemd/system ]; then
  systemctl daemon-reload
  systemctl enable irp-daemon.service || true
fi
exit 0
EOF

cat > "$PKG_ROOT/DEBIAN/prerm" <<'EOF'
#!/bin/sh
set -eu
if [ -d /run/systemd/system ]; then
  systemctl stop irp-daemon.service 2>/dev/null || true
  systemctl disable irp-daemon.service 2>/dev/null || true
fi
exit 0
EOF

chmod 0755 "$PKG_ROOT/DEBIAN/postinst" "$PKG_ROOT/DEBIAN/prerm"

echo "==> Building .deb"
dpkg-deb --build --root-owner-group "$PKG_ROOT" "$OUT_DIR/$PKG_NAME"
rm -rf "$PKG_ROOT"
sha256sum "$OUT_DIR/$PKG_NAME" > "$OUT_DIR/$PKG_NAME.sha256"
printf 'Built %s\n' "$OUT_DIR/$PKG_NAME"
printf 'Checksum: %s\n' "$(cat "$OUT_DIR/$PKG_NAME.sha256")"
