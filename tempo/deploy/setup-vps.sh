#!/usr/bin/env bash
#
# Tempo one-shot installer for a fresh Ubuntu 22.04 / 24.04 VPS.
# Installs Node 20, the app (as a systemd service), and Caddy (auto-HTTPS).
#
# REVIEW THIS SCRIPT BEFORE RUNNING. Then, as root (or with sudo):
#
#   DOMAIN=tempo.falkconsulting.co.uk PASSCODE=your-unlock-code bash setup-vps.sh
#
# Optional extra vars:
#   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...   (enables Google Calendar sync)
#   BRANCH=claude/adhd-todo-app-design-loysre       (which branch to deploy)
#
set -euo pipefail

DOMAIN="${DOMAIN:?Set DOMAIN=tempo.yourdomain.com}"
PASSCODE="${PASSCODE:?Set PASSCODE=your-unlock-code}"
REPO="${REPO:-https://github.com/NightMonk/claude-test.git}"
BRANCH="${BRANCH:-claude/adhd-todo-app-design-loysre}"
APP_DIR=/opt/tempo/repo/tempo

echo "==> [1/6] Installing Node 20, git, build tools & Caddy…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git build-essential python3 ufw curl debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y && apt-get install -y caddy

echo "==> [2/6] Creating 'tempo' user & fetching the app…"
id -u tempo &>/dev/null || useradd --system --create-home --home-dir /opt/tempo --shell /usr/sbin/nologin tempo
mkdir -p /opt/tempo && chown -R tempo:tempo /opt/tempo
if [ ! -d /opt/tempo/repo/.git ]; then
  sudo -u tempo -H git clone "$REPO" /opt/tempo/repo
fi
sudo -u tempo -H git -C /opt/tempo/repo fetch origin "$BRANCH"
sudo -u tempo -H git -C /opt/tempo/repo checkout "$BRANCH"
sudo -u tempo -H git -C /opt/tempo/repo pull --ff-only origin "$BRANCH" || true
sudo -u tempo -H bash -c "cd $APP_DIR && npm ci --omit=dev"

echo "==> [3/6] Writing config (.env) & data dir…"
mkdir -p /opt/tempo/data && chown -R tempo:tempo /opt/tempo/data
if [ ! -f "$APP_DIR/.env" ]; then
  SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
  {
    echo "PASSCODE=$PASSCODE"
    echo "SESSION_SECRET=$SECRET"
    echo "DB_PATH=/opt/tempo/data/tempo.sqlite"
    echo "PORT=3000"
    [ -n "${GOOGLE_CLIENT_ID:-}" ] && echo "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"
    [ -n "${GOOGLE_CLIENT_SECRET:-}" ] && echo "GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET"
    [ -n "${GOOGLE_CLIENT_ID:-}" ] && echo "VAPID_SUBJECT=mailto:admin@${DOMAIN#*.}"
  } > "$APP_DIR/.env"
  chown tempo:tempo "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
else
  echo "    .env already exists — leaving it untouched."
fi

echo "==> [4/6] systemd service…"
cat > /etc/systemd/system/tempo.service <<UNIT
[Unit]
Description=Tempo — ADHD-first tasks
After=network.target

[Service]
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=3
User=tempo
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now tempo

echo "==> [5/6] Caddy (automatic HTTPS) for $DOMAIN…"
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
    encode zstd gzip
    reverse_proxy localhost:3000
}
CADDY
systemctl reload caddy

echo "==> [6/6] Firewall…"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 80/tcp   >/dev/null 2>&1 || true
ufw allow 443/tcp  >/dev/null 2>&1 || true
yes | ufw enable   >/dev/null 2>&1 || true

echo ""
echo "==================================================================="
echo " Done. Once your DNS A record for $DOMAIN points at this server,"
echo " open  https://$DOMAIN  (allow ~1 min for the TLS certificate)."
echo ""
echo "  Service:   systemctl status tempo      Logs: journalctl -u tempo -f"
echo "  Update:    sudo -u tempo git -C /opt/tempo/repo pull && \\"
echo "             sudo -u tempo bash -c 'cd $APP_DIR && npm ci --omit=dev' && \\"
echo "             systemctl restart tempo"
echo "==================================================================="
