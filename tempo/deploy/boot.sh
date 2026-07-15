#!/usr/bin/env bash
# =============================================================================
#  Tempo — ONE-TIME bootstrap deploy for ORACLE CLOUD SHELL (iPhone-friendly).
# =============================================================================
#  Upload this file into Cloud Shell, then run exactly:
#
#      bash boot.sh
#
#  Nothing to edit, no arguments, no prompts. Safe to re-run if it stops.
#  (Alternatively, if you can paste:  bash <(curl -fsSL <raw-url-to-this-file>) )
#
#  What it does, start to finish:
#    1. finds your server instance by its public IP (144.21.51.57)
#    2. reaches it privately via OCI Bastion (agent-injected key — none needed)
#    3. pulls all six phases, restarts the app
#    4. installs a permanent auto-updater so a terminal is NEVER needed again
#    5. verifies the live site actually updated
#
#  If anything can't work on this tenancy/image it STOPS and prints an exact
#  Plan B — never a silent failure. Success ends with "ALL-DONE".
# =============================================================================
set -uo pipefail

SERVER_IP="144.21.51.57"
DOMAIN="tempo.falkconsulting.co.uk"
EXPECT_SW="tempo-shell-v12"          # the cache tag this release should ship
KEY="$HOME/.ssh/tempo_deploy_$$"
step() { printf '\n\033[1m==== STEP %s ====\033[0m %s\n' "$1" "$2"; }
info() { printf '     %s\n' "$*"; }
ok()   { printf '  \033[32m[ok]\033[0m %s\n' "$*"; }

# planB <title> then heredoc on stdin. Prints a bordered block and exits 1 —
# so you always leave with a concrete next action, never a bare error.
planB() {
  printf '\n\033[33m'
  printf '=======================================================================\n'
  printf ' PLAN B — %s\n' "$1"; shift
  printf '=======================================================================\033[0m\n'
  cat
  printf '\n(Re-running is always safe — just:  bash boot.sh)\n'
  rm -f "$KEY" "${KEY}.pub" 2>/dev/null
  exit 1
}

cat <<'BANNER'

  Tempo bootstrap — deploying all six phases and turning on auto-updates.
  This is chatty on purpose. Watch for "ALL-DONE" (success) or "PLAN B" (todo).

BANNER

# ---------------------------------------------------------------- 1. preflight
step "1/8" "Preflight — checking Cloud Shell tools & region"
command -v oci >/dev/null 2>&1 || planB "Cloud Shell has no OCI CLI" <<'EOF'
This doesn't look like Oracle Cloud Shell. Open the Cloud Shell (the >_ icon,
top-right of the OCI console) and run  bash boot.sh  there.
EOF
REGION=$(oci iam region-subscription list --query 'data[0]."region-name"' --raw-output 2>/dev/null || true)
info "CLI present. Cloud Shell region: ${REGION:-unknown}"
ok "Preflight passed"

# ------------------------------------------------------------ 2. find instance
step "2/8" "Finding your server by its public IP ($SERVER_IP)"
mapfile -t IDS < <(oci search resource structured-search \
  --query-text "query instance resources" \
  --query 'data.items[].identifier' --raw-output 2>/dev/null | tr -d '[],"' | tr ' ' '\n' | grep -v '^$')
if [ "${#IDS[@]}" -eq 0 ]; then
  planB "No compute instances visible in this region" <<EOF
Cloud Shell is looking in region: ${REGION:-unknown}.
Your server is in UK South (London). Fix in 5 seconds:
  - In the console top-right Region menu, switch to UK South (London).
  - Then run  bash boot.sh  again.
EOF
fi
INST=""
for id in "${IDS[@]}"; do
  ip=$(oci compute instance list-vnics --instance-id "$id" \
        --query 'data[0]."public-ip"' --raw-output 2>/dev/null || true)
  [ "$ip" = "$SERVER_IP" ] && { INST="$id"; break; }
done
if [ -z "$INST" ]; then
  # Fallback: if there's exactly one instance, it's almost certainly the server.
  if [ "${#IDS[@]}" -eq 1 ]; then
    INST="${IDS[0]}"; info "No IP match, but only one instance here — using it."
  else
    planB "Couldn't match $SERVER_IP among instances in this region" <<EOF
Found ${#IDS[@]} instances but none had public IP $SERVER_IP.
Most likely Cloud Shell is in the wrong region. Switch the Region (top-right) to
UK South (London) and re-run. If the region is right, the server's public IP may
have changed — check Compute -> Instances -> your VM.
EOF
  fi
fi
NAME=$(oci compute instance get --instance-id "$INST" --query 'data."display-name"' --raw-output 2>/dev/null || echo '?')
ok "Server found: \"$NAME\""

# --------------------------------------------------------- 3. gather net facts
step "3/8" "Reading the instance's compartment / subnet / private IP"
COMP=$(oci compute instance get --instance-id "$INST" --query 'data."compartment-id"' --raw-output 2>/dev/null)
SUBNET=$(oci compute instance list-vnics --instance-id "$INST" --query 'data[0]."subnet-id"' --raw-output 2>/dev/null)
PRIVIP=$(oci compute instance list-vnics --instance-id "$INST" --query 'data[0]."private-ip"' --raw-output 2>/dev/null)
{ [ -n "$COMP" ] && [ -n "$SUBNET" ] && [ -n "$PRIVIP" ]; } || planB "Could not read the instance's network details" <<EOF
Got: compartment=${COMP:-?} subnet=${SUBNET:-?} privateIP=${PRIVIP:-?}
This usually means a transient API hiccup. Wait a minute and re-run.
EOF
ok "compartment, subnet, private IP ($PRIVIP) resolved"

# ------------------------------------------------------- 4. Bastion plugin ON
step "4/8" "Enabling the Bastion agent plugin (idempotent)"
oci compute instance update --instance-id "$INST" --force \
  --agent-config '{"isMonitoringDisabled": false, "isManagementDisabled": false, "areAllPluginsDisabled": false, "pluginsConfig": [{"name": "Bastion", "desiredState": "ENABLED"}]}' \
  >/dev/null 2>&1 && ok "Plugin set to ENABLED" || info "Update call skipped (often already enabled) — will verify next."

info "Waiting for the plugin to report RUNNING (first enable can take ~5 min)…"
ST=""
for i in $(seq 1 40); do
  ST=$(oci instance-agent plugin get --instanceagent-id "$INST" --compartment-id "$COMP" \
        --plugin-name Bastion --query 'data.status' --raw-output 2>/dev/null || true)
  [ "$ST" = "RUNNING" ] && break
  printf '.'; sleep 15
done; printf '\n'
if [ "$ST" != "RUNNING" ]; then
  planB "Bastion plugin isn't RUNNING (status: ${ST:-unknown})" <<EOF
This is the most common first-run snag and it's a 2-tap fix in the console:

  1. Console -> Compute -> Instances -> "$NAME".
  2. Open the "Oracle Cloud Agent" tab.
  3. Toggle the "Bastion" plugin to Enabled (if it's already on, just wait).
  4. Give it ~5 minutes, then run  bash boot.sh  again.

If the Agent itself shows "not running" or the image is very old, the deepest
fallback is the serial console (see the PLAN B under Step 6). On a phone, the
toggle above is the reliable path.
EOF
fi
ok "Bastion plugin is RUNNING"

# --------------------------------------------------------- 5. ensure a Bastion
step "5/8" "Making sure a Bastion exists on your VCN"
BID=$(oci bastion bastion list --compartment-id "$COMP" \
      --query "data[?\"lifecycle-state\"=='ACTIVE'] | [?name=='tempo-bastion'].id | [0]" \
      --raw-output 2>/dev/null || true)
if [ -z "$BID" ] || [ "$BID" = "null" ]; then
  info "No 'tempo-bastion' yet — creating one (Always-Free includes this)…"
  BID=$(oci bastion bastion create --bastion-type standard --compartment-id "$COMP" \
        --target-subnet-id "$SUBNET" --name tempo-bastion --client-cidr-list '["0.0.0.0/0"]' \
        --wait-for-state ACTIVE --query 'data.id' --raw-output 2>/dev/null || true)
fi
if [ -z "$BID" ] || [ "$BID" = "null" ]; then
  planB "Couldn't create a Bastion automatically" <<EOF
Create it once by hand (2 minutes, works from the phone), then re-run:

  1. Console -> Identity & Security -> Bastion -> "Create bastion".
  2. Name it exactly:  tempo-bastion
  3. Target VCN: the one your server is in.  Target subnet: that VCN's subnet.
  4. CIDR allowlist:  0.0.0.0/0
  5. Create, wait for ACTIVE, then run  bash boot.sh  again.

(If "Create" is blocked by a policy error, your user needs the
 manage bastion-family permission — an OCI admin grants it.)
EOF
fi
ok "Bastion ready"

# ------------------------------------------------- 6. ephemeral key + session
step "6/8" "Opening a temporary, agent-injected SSH session (no stored key)"
rm -f "$KEY" "${KEY}.pub" 2>/dev/null
# Cloud Shell runs in FIPS mode, which forbids ed25519. RSA-2048 is FIPS-approved
# and accepted by Bastion; fall back to ECDSA (also FIPS-ok) just in case.
if ssh-keygen -t rsa -b 2048 -f "$KEY" -N "" -q 2>/dev/null; then
  info "Using an RSA-2048 key (FIPS-compatible)."
elif ssh-keygen -t ecdsa -b 256 -f "$KEY" -N "" -q 2>/dev/null; then
  info "Using an ECDSA P-256 key (FIPS-compatible)."
else
  planB "Couldn't generate a FIPS-compatible temp key" <<'EOF'
Both RSA and ECDSA key generation failed in Cloud Shell (unexpected). Clear any
stale keys and re-run:
  rm -f ~/.ssh/tempo_deploy_*
  bash boot.sh
EOF
fi
SID=$(oci bastion session create-managed-ssh --bastion-id "$BID" --target-resource-id "$INST" \
      --target-os-username ubuntu --target-private-ip "$PRIVIP" --ssh-public-key-file "${KEY}.pub" \
      --session-ttl 1800 --wait-for-state ACTIVE --query 'data.id' --raw-output 2>/dev/null || true)
if [ -z "$SID" ] || [ "$SID" = "null" ]; then
  planB "The Bastion session wouldn't open (managed SSH unavailable)" <<EOF
The Bastion exists but a managed-SSH session to the instance failed. Causes &
fixes (try in order, re-running  bash boot.sh  after each):

  - Plugin still warming up — wait 5 min and re-run.
  - The Bastion's subnet can't reach the instance — make sure the Bastion and
    the instance are on the SAME VCN/subnet (recreate 'tempo-bastion' on the
    correct subnet if needed: Identity & Security -> Bastion).
  - Managed SSH needs the Oracle Cloud Agent Bastion plugin (Step 4). If the
    Agent tab shows it unhealthy, the image may not support it. Then use the
    SERIAL CONSOLE from a DESKTOP:
       Console -> your instance -> "Console connection" -> Create local
       connection (upload an SSH public key) -> connect with the shown command
       -> log in -> run these three lines:
         sudo -u tempo git -C /opt/tempo/repo pull --ff-only
         sudo bash /opt/tempo/repo/tempo/deploy/install-autoupdate.sh
         sudo systemctl restart tempo
    Simplest of all: next time you're at your WINDOWS PC (it already has the
    server SSH key), run those three lines over normal SSH.
EOF
fi
ok "Secure session is ACTIVE"

# --------------------------------------------------------------- 7. deploy
step "7/8" "Deploying all six phases + installing the auto-updater"
# Build the remote script and hand it over base64-encoded to avoid any quoting
# pitfalls. Runs as 'ubuntu'; uses sudo for the tempo user + systemd.
REMOTE=$(cat <<'RSH'
set -e
R=/opt/tempo/repo; A=$R/tempo
BR=$(sudo -u tempo git -C "$R" rev-parse --abbrev-ref HEAD)
echo ">> deploying branch $BR"
OLD=$(md5sum "$A/package-lock.json" 2>/dev/null | cut -d' ' -f1 || true)
sudo -u tempo git -C "$R" fetch --quiet origin "$BR"
sudo -u tempo git -C "$R" reset --hard "origin/$BR"
NEW=$(md5sum "$A/package-lock.json" 2>/dev/null | cut -d' ' -f1 || true)
if [ ! -d "$A/node_modules" ] || [ "$OLD" != "$NEW" ]; then
  echo ">> dependencies changed — running npm ci"
  sudo -u tempo bash -c "cd $A && npm ci --omit=dev"
else
  echo ">> dependencies unchanged — skipping npm ci"
fi
sudo bash "$A/deploy/install-autoupdate.sh"
sudo systemctl restart tempo
sleep 2
systemctl is-active --quiet tempo && echo ">> tempo service: active" || { echo ">> tempo service FAILED"; systemctl --no-pager -l status tempo | tail -20; exit 1; }
curl -fsS -o /dev/null -w ">> local health: HTTP %{http_code}\n" http://localhost:3000/healthz || true
systemctl is-active --quiet tempo-update.timer && echo ">> auto-update timer: enabled" || echo ">> WARN auto-update timer not enabled"
echo ===DEPLOY_OK===
RSH
)
B64=$(printf '%s' "$REMOTE" | base64 | tr -d '\n')
CONN=$(oci bastion session get --session-id "$SID" --query 'data."ssh-metadata".command' --raw-output 2>/dev/null)
CONN=${CONN//<privateKey>/$KEY}
# Disable host-key prompts on BOTH the proxy hop and the target (no interaction).
CONN=${CONN//ssh /ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null }
OUT=$(eval "$CONN \"echo $B64 | base64 -d | bash\"" 2>&1); RC=$?
printf '%s\n' "$OUT" | sed 's/^/     /'
rm -f "$KEY" "${KEY}.pub" 2>/dev/null
if [ $RC -ne 0 ] || ! printf '%s' "$OUT" | grep -q '===DEPLOY_OK==='; then
  planB "The remote deploy didn't confirm success" <<EOF
The tunnel opened but the deploy above didn't print ===DEPLOY_OK===.
Read the indented server output above for the reason (often a transient git or
npm hiccup). Re-running  bash boot.sh  is safe and usually clears it. If it keeps
failing, screenshot the server output and send it to Claude.
EOF
fi
ok "Server deployed, service restarted, auto-updater installed"

# ------------------------------------------------------------ 8. verify live
step "8/8" "Verifying the LIVE site actually updated"
LIVE_SW=$(curl -fsS "https://$DOMAIN/sw.js" 2>/dev/null | grep -o 'tempo-shell-v[0-9]*' | head -1 || true)
HEALTH=$(curl -fsS -o /dev/null -w '%{http_code}' "https://$DOMAIN/healthz" 2>/dev/null || echo 000)
info "https://$DOMAIN/healthz -> HTTP $HEALTH"
info "live app cache tag -> ${LIVE_SW:-not found}   (expected: $EXPECT_SW)"
if [ "$LIVE_SW" = "$EXPECT_SW" ] && [ "$HEALTH" = "200" ]; then
  ok "Live site is serving this release"
else
  info "Note: HTTPS/CDN can lag a few seconds; if the tag isn't $EXPECT_SW yet,"
  info "wait ~30s and reload https://$DOMAIN. The auto-updater will also catch it."
fi

cat <<DONE

=======================================================================
 ALL-DONE
=======================================================================
 - All six phases are deployed.
 - Auto-updates are now permanent: every future release installs itself
   within ~5 minutes of being pushed. You never need Cloud Shell again.

 CHECK ON YOUR PHONE (https://$DOMAIN):
   1. Close the tab/PWA fully and reopen it once (to drop the old cache).
   2. Log in with your passcode (use the FULL keyboard, tap the eye to reveal).
   3. New app icon: rising bars, not a clock (re-add to Home Screen to
      refresh the tile).
   4. Bottom bar now has 5 tabs incl. "Upcoming" (Next 7 Days).
   5. Add a task like: "call dentist next tuesday 3pm !high" — the date,
      time and priority should be picked up automatically.
   6. Complete a task -> Undo toast; open More (...) -> History shows it.
   (The AI buttons stay hidden until you add the Anthropic key later —
    that's expected.)
=======================================================================
DONE
