#!/usr/bin/env bash
# Installs a systemd timer that auto-deploys Tempo: every 5 minutes it checks
# GitHub for new commits on the deployed branch; if found, pulls, reinstalls
# deps only when the lockfile changed, and restarts the app. Run once as root:
#   sudo bash /opt/tempo/repo/tempo/deploy/install-autoupdate.sh
set -euo pipefail

REPO_DIR=/opt/tempo/repo
APP_DIR=$REPO_DIR/tempo

cat > /usr/local/bin/tempo-update <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
REPO_DIR=/opt/tempo/repo
APP_DIR=$REPO_DIR/tempo
BRANCH=$(sudo -u tempo git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)
sudo -u tempo git -C "$REPO_DIR" fetch origin "$BRANCH" --quiet
LOCAL=$(sudo -u tempo git -C "$REPO_DIR" rev-parse HEAD)
REMOTE=$(sudo -u tempo git -C "$REPO_DIR" rev-parse "origin/$BRANCH")
[ "$LOCAL" = "$REMOTE" ] && exit 0
OLD_LOCK=$(md5sum "$APP_DIR/package-lock.json" | cut -d' ' -f1)
sudo -u tempo git -C "$REPO_DIR" pull --ff-only origin "$BRANCH"
NEW_LOCK=$(md5sum "$APP_DIR/package-lock.json" | cut -d' ' -f1)
if [ "$OLD_LOCK" != "$NEW_LOCK" ]; then
  sudo -u tempo bash -c "cd $APP_DIR && npm ci --omit=dev"
fi
systemctl restart tempo
echo "tempo updated to $REMOTE"
EOF
chmod +x /usr/local/bin/tempo-update

cat > /etc/systemd/system/tempo-update.service <<'EOF'
[Unit]
Description=Tempo auto-update (pull + restart if the branch moved)

[Service]
Type=oneshot
ExecStart=/usr/local/bin/tempo-update
EOF

cat > /etc/systemd/system/tempo-update.timer <<'EOF'
[Unit]
Description=Check for Tempo updates every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now tempo-update.timer

echo "Auto-update installed. Deploys now happen automatically within ~5 minutes"
echo "of a push. Check: systemctl list-timers tempo-update.timer"
echo "Logs:  journalctl -u tempo-update.service -n 20"
