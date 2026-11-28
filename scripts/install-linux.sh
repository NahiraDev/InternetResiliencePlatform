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

echo "==> Deploying production trees to $PREFIX"
rm -rf "$PREFIX.new"; mkdir -p "$PREFIX.new"
( cd "$ROOT" && CI=true pnpm --filter @irp/daemon deploy --prod --legacy "$PREFIX.new/daemon" \
  && CI=true pnpm --filter @irp/cli deploy --prod --legacy "$PREFIX.new/cli" )
rm -rf "$PREFIX.old"; [ -d "$PREFIX" ] && mv "$PREFIX" "$PREFIX.old"
mv "$PREFIX.new" "$PREFIX"; rm -rf "$PREFIX.old"

echo "==> Installing CLI wrapper to $BIN_DIR/irp"
cat > "$BIN_DIR/irp" <<WRAP
#!/bin/sh
exec node "$PREFIX/cli/dist/index.js" "\$@"
WRAP
chmod 0755 "$BIN_DIR/irp"

if [ -z "${NO_SYSTEMD:-}" ] && command -v systemctl >/dev/null; then
  echo "==> Configuring systemd service (User=irp, least-privilege)"
  id irp >/dev/null 2>&1 || useradd --system --home-dir /var/lib/irp --shell /usr/sbin/nologin --comment "Internet Resilience Platform" irp
  install -d -o irp -g irp -m 0750 /var/lib/irp
  install -d -m 0755 /etc/irp
  if [ ! -f /etc/irp/irp.env ]; then
    install -m 0640 -g irp "$ROOT/infra/systemd/irp.env.example" /etc/irp/irp.env
    echo "Created /etc/irp/irp.env from example (safe mode by default)."
  else
    echo "Keeping existing /etc/irp/irp.env"
  fi
  sed "s#/opt/irp/daemon#$PREFIX/daemon#" "$ROOT/infra/systemd/irp-daemon.service" > /etc/systemd/system/irp-daemon.service
  systemctl daemon-reload
  echo
  echo "Installation complete (prerelease / developer-preview)."
  echo "Next steps:"
  echo "  1. Review /etc/irp/irp.env (defaults to safe / observe-only)."
  echo "  2. systemctl enable --now irp-daemon"
  echo "  3. sudo irp status          # or: irp status --socket /run/irp/irp.sock"
  echo "  4. journalctl -u irp-daemon -f"
  echo
  echo "Live route mutation requires explicit dual opt-in in /etc/irp/irp.env"
  echo "and is still limited by host trust (CAP_NET_ADMIN + other checks)."
  echo "DNS write is intentionally disabled under User=irp (requires root or polkit)."
  echo "This is NOT a production-certified release. See docs/operations/linux-enduser-guide.md"
else
  echo "Installed to $PREFIX (systemd unit skipped)."
  echo "Start manually: IRP_STATE_DIR=/var/lib/irp node $PREFIX/daemon/dist/index.js"
fi
