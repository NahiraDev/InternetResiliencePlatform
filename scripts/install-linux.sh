#!/usr/bin/env bash
# Installs the IRP daemon and CLI on a Linux host from a built checkout.
#   pnpm install --frozen-lockfile && pnpm build && sudo scripts/install-linux.sh
# Env: PREFIX (default /opt/irp), BIN_DIR (default /usr/local/bin), NO_SYSTEMD=1 to skip unit install.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${PREFIX:-/opt/irp}"
BIN_DIR="${BIN_DIR:-/usr/local/bin}"
[ "$(uname -s)" = Linux ] || { echo "install-linux.sh supports Linux only" >&2; exit 1; }
[ "$(id -u)" = 0 ] || { echo "run as root (sudo)" >&2; exit 1; }
for d in apps/daemon apps/cli; do [ -f "$ROOT/$d/dist/index.js" ] || { echo "missing $d/dist; run pnpm build first" >&2; exit 1; }; done
command -v node >/dev/null || { echo "node is required" >&2; exit 1; }

rm -rf "$PREFIX.new"; mkdir -p "$PREFIX.new"
( cd "$ROOT" && pnpm --filter @irp/daemon deploy --prod --legacy "$PREFIX.new/daemon" \
  && pnpm --filter @irp/cli deploy --prod --legacy "$PREFIX.new/cli" )
rm -rf "$PREFIX.old"; [ -d "$PREFIX" ] && mv "$PREFIX" "$PREFIX.old"
mv "$PREFIX.new" "$PREFIX"; rm -rf "$PREFIX.old"

cat > "$BIN_DIR/irp" <<WRAP
#!/bin/sh
exec node "$PREFIX/cli/dist/index.js" "\$@"
WRAP
chmod 0755 "$BIN_DIR/irp"

if [ -z "${NO_SYSTEMD:-}" ] && command -v systemctl >/dev/null; then
  id irp >/dev/null 2>&1 || useradd --system --home-dir /var/lib/irp --shell /usr/sbin/nologin irp
  install -d -m 0755 /etc/irp
  [ -f /etc/irp/irp.env ] || install -m 0640 -g irp "$ROOT/infra/systemd/irp.env.example" /etc/irp/irp.env
  sed "s#/opt/irp/daemon#$PREFIX/daemon#" "$ROOT/infra/systemd/irp-daemon.service" > /etc/systemd/system/irp-daemon.service
  systemctl daemon-reload
  echo "Installed. Start with: systemctl enable --now irp-daemon   then: sudo irp status"
else
  echo "Installed to $PREFIX (systemd unit skipped). Run: IRP_STATE_DIR=... node $PREFIX/daemon/dist/index.js"
fi
