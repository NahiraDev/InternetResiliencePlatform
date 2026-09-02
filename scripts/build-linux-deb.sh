#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_DIR="$ROOT_DIR/packages/linux-client"
VERSION="${IRP_LINUX_VERSION:-0.1.0}"
ARCH="${IRP_LINUX_ARCH:-amd64}"
OUT_DIR="${IRP_LINUX_OUT_DIR:-$ROOT_DIR/dist/linux}"
PKG_ROOT="$OUT_DIR/package"
PKG_NAME="irp-linux-client_${VERSION}_${ARCH}.deb"

rm -rf "$OUT_DIR"
mkdir -p "$PKG_ROOT/DEBIAN" \
  "$PKG_ROOT/usr/lib/irp/linux-client/dist" \
  "$PKG_ROOT/usr/lib/systemd/system"

pnpm --dir "$ROOT_DIR" --filter @irp/linux-client build

cp -R "$CLIENT_DIR/dist/." "$PKG_ROOT/usr/lib/irp/linux-client/dist/"
cp "$CLIENT_DIR/systemd/irp-linux-client.service" \
  "$PKG_ROOT/usr/lib/systemd/system/irp-linux-client.service"

cat > "$PKG_ROOT/DEBIAN/control" <<EOF
Package: irp-linux-client
Version: $VERSION
Section: net
Priority: optional
Architecture: $ARCH
Depends: nodejs
Maintainer: Internet Resilience Platform contributors
Description: Internet Resilience Platform Linux Full Client
 IRP Linux Full Client provides the device-side network resilience runtime
 and local diagnostics/control surface for Debian-based systems.
EOF

cat > "$PKG_ROOT/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -eu

if ! getent group irp >/dev/null 2>&1; then
  groupadd --system irp
fi
if ! getent passwd irp >/dev/null 2>&1; then
  useradd --system --gid irp --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin irp
fi

install -d -o irp -g irp -m 0750 /var/lib/irp
systemctl daemon-reload 2>/dev/null || true

if [ "$(ps -p 1 -o comm= 2>/dev/null || true)" = "systemd" ]; then
  systemctl enable irp-linux-client.service
  systemctl restart irp-linux-client.service || systemctl start irp-linux-client.service
fi
exit 0
EOF

cat > "$PKG_ROOT/DEBIAN/prerm" <<'EOF'
#!/bin/sh
set -eu
if [ "$(ps -p 1 -o comm= 2>/dev/null || true)" = "systemd" ]; then
  systemctl stop irp-linux-client.service 2>/dev/null || true
  systemctl disable irp-linux-client.service 2>/dev/null || true
fi
exit 0
EOF

chmod 0755 "$PKG_ROOT/DEBIAN/postinst" "$PKG_ROOT/DEBIAN/prerm"
dpkg-deb --build --root-owner-group "$PKG_ROOT" "$OUT_DIR/$PKG_NAME"
rm -rf "$PKG_ROOT"
sha256sum "$OUT_DIR/$PKG_NAME" > "$OUT_DIR/$PKG_NAME.sha256"
printf 'Built %s\n' "$OUT_DIR/$PKG_NAME"
