#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_DIR="$ROOT_DIR/packages/linux-client"
VERSION="${IRP_LINUX_VERSION:-0.1.1}"
ARCH="${IRP_LINUX_ARCH:-amd64}"
OUT_DIR="${IRP_LINUX_OUT_DIR:-$ROOT_DIR/dist/linux}"
PKG_ROOT="$OUT_DIR/package"
CLIENT_ROOT="$PKG_ROOT/usr/lib/irp/linux-client"
PKG_NAME="irp-linux-client_${VERSION}_${ARCH}.deb"

rm -rf "$OUT_DIR"
mkdir -p "$PKG_ROOT/DEBIAN" \
  "$PKG_ROOT/usr/lib/systemd/system"

# Build the client and its workspace dependency graph.
pnpm --dir "$ROOT_DIR" --filter @irp/linux-client build

# Assemble a self-contained install tree (workspace + external production deps).
node "$ROOT_DIR/scripts/assemble-linux-client-package.mjs" "$CLIENT_ROOT"

cp "$CLIENT_DIR/systemd/irp-linux-client.service" \
  "$PKG_ROOT/usr/lib/systemd/system/irp-linux-client.service"

# Fail closed: the packaged tree must actually boot the HTTP surface.
(
  cd "$CLIENT_ROOT"
  node --check dist/index.js
  node --check dist/main.js
  node --input-type=module <<'VERIFY'
  import { runLinuxClient } from './dist/index.js';
  const server = await runLinuxClient();
  try {
    const response = await fetch('http://127.0.0.1:17861/');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    if (!body.includes('IRP Linux Client') || !body.includes('Linux Full Client')) {
      throw new Error('packaged client response missing expected contract markers');
    }
    console.log('packaged-linux-client-runtime-ok');
  } finally {
    await server.stop();
  }
  VERIFY
)

cat > "$PKG_ROOT/DEBIAN/control" <<EOF
Package: irp-linux-client
Version: $VERSION
Section: net
Priority: optional
Architecture: $ARCH
Depends: nodejs (>= 24.0.0)
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
if [ -d /run/systemd/system ]; then
  systemctl daemon-reload
  systemctl enable irp-linux-client.service || true
  # Do not restart during package install in constrained CI containers;
  # operators (or the acceptance smoke) start the unit when ready.
fi
exit 0
EOF

cat > "$PKG_ROOT/DEBIAN/prerm" <<'EOF'
#!/bin/sh
set -eu
if [ -d /run/systemd/system ]; then
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
