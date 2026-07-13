#!/usr/bin/env bash
# ONE-TIME bootstrap deploy for Tempo, from ORACLE CLOUD SHELL (phone-only).
#
# Why this exists: the operator is iPhone-only with no SSH client and no local
# copy of the server key; OCI Run Command is unavailable on this Ubuntu image.
# Cloud Shell is the only channel a phone has. This uses OCI **Bastion**
# (agent-injected ephemeral access — no pre-existing key needed) to run the
# deploy once, which installs the pull-based auto-updater timer. After this,
# the server polls GitHub every 5 min and self-deploys forever — so this script
# never needs to run again.
#
# HOW TO RUN (paste this single line into Cloud Shell, press return):
#   bash <(curl -fsSL https://raw.githubusercontent.com/NightMonk/claude-test/refs/heads/claude/adhd-todo-app-design-loysre/tempo/deploy/cloudshell-deploy.sh)
set -uo pipefail
KEY="$HOME/.ssh/tempo_deploy_$$"
REMOTE='sudo -u tempo git -C /opt/tempo/repo pull --ff-only && sudo bash /opt/tempo/repo/tempo/deploy/install-autoupdate.sh && sudo systemctl restart tempo && echo ===DEPLOY_OK==='
say() { printf '\n==> %s\n' "$*"; }
die() { printf '\n!! %s\n' "$*"; exit 1; }

say "Finding the 'tempo' instance in the current region…"
INST=$(oci search resource structured-search --query-text "query instance resources where displayName = 'tempo'" --query 'data.items[0].identifier' --raw-output 2>/dev/null)
[ -n "${INST:-}" ] && [ "$INST" != "null" ] || die "No instance named 'tempo' here. Make sure Cloud Shell's region (top bar) is UK South (London)."
COMP=$(oci compute instance get --instance-id "$INST" --query 'data."compartment-id"' --raw-output)
SUBNET=$(oci compute instance list-vnics --instance-id "$INST" --query 'data[0]."subnet-id"' --raw-output)
PRIVIP=$(oci compute instance list-vnics --instance-id "$INST" --query 'data[0]."private-ip"' --raw-output)
echo "    instance found; private IP $PRIVIP"

say "Enabling the Bastion agent plugin (idempotent)…"
oci compute instance update --instance-id "$INST" --force \
  --agent-config '{"isMonitoringDisabled": false, "isManagementDisabled": false, "pluginsConfig": [{"name": "Bastion", "desiredState": "ENABLED"}]}' >/dev/null 2>&1 || true

say "Waiting for the Bastion plugin to report RUNNING (first enable can take ~5 min)…"
for i in $(seq 1 40); do
  ST=$(oci instance-agent plugin get --instanceagent-id "$INST" --compartment-id "$COMP" --plugin-name Bastion --query 'data.status' --raw-output 2>/dev/null)
  [ "$ST" = "RUNNING" ] && break; printf '.'; sleep 15
done; echo ""
[ "${ST:-}" = "RUNNING" ] || die "Bastion plugin never came up (status: ${ST:-unknown}). Wait 5 min and re-run the one-liner."

say "Creating a Bastion (reusing one if it exists)…"
BID=$(oci bastion bastion list --compartment-id "$COMP" --query "data[?name=='tempo-bastion'].id | [0]" --raw-output 2>/dev/null)
if [ -z "${BID:-}" ] || [ "$BID" = "null" ]; then
  BID=$(oci bastion bastion create --bastion-type standard --compartment-id "$COMP" --target-subnet-id "$SUBNET" \
        --name tempo-bastion --client-cidr-list '["0.0.0.0/0"]' --wait-for-state ACTIVE --query 'data.id' --raw-output) \
    || die "Could not create a Bastion. In the console: Identity & Security -> Bastion -> create one on subnet of tempo-vcn, then re-run."
fi

say "Generating an ephemeral key + opening a managed SSH session…"
ssh-keygen -t ed25519 -f "$KEY" -N "" -q
SID=$(oci bastion session create-managed-ssh --bastion-id "$BID" --target-resource-id "$INST" \
      --target-os-username ubuntu --target-private-ip "$PRIVIP" --ssh-public-key-file "${KEY}.pub" \
      --session-ttl 1800 --wait-for-state ACTIVE --query 'data.id' --raw-output) \
  || die "Could not open a Bastion session (subnet may block the Bastion service, or the plugin isn't ready)."

say "Deploying over the Bastion tunnel…"
CONN=$(oci bastion session get --session-id "$SID" --query 'data."ssh-metadata".command' --raw-output)
CONN=${CONN//<privateKey>/$KEY}
CONN=${CONN//ssh /ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null }
eval "$CONN \"$REMOTE\""
RC=$?

rm -f "$KEY" "${KEY}.pub"
if [ $RC -eq 0 ]; then
  cat <<'DONE'

=======================================================================
 DEPLOYED. Auto-updates are now ON — every future release installs
 itself within ~5 minutes. You never need to run this again.

 Open https://tempo.falkconsulting.co.uk (close & reopen once), then
 log in with the FULL keyboard.
=======================================================================
DONE
else
  die "The remote deploy command failed. Screenshot everything above and send it to Claude."
fi
