#!/usr/bin/env bash
# Deploy Tempo from ORACLE CLOUD SHELL (phone-friendly; no SSH key needed).
#
# In the OCI Console top bar, tap the Developer-tools icon (the little
# terminal/monitor with brackets, next to the region name) -> Cloud Shell,
# wait for the prompt, then paste:
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/NightMonk/claude-test/refs/heads/claude/adhd-todo-app-design-loysre/tempo/deploy/cloudshell-deploy.sh)
#
# It finds the 'tempo' instance, enables Oracle's Run Command agent plugin,
# then uses it to pull the latest code, install the auto-updater (so this is
# the last manual deploy ever) and restart the app — all without SSH.
set -uo pipefail

DEPLOY_SCRIPT='sudo -u tempo git -C /opt/tempo/repo pull --ff-only && sudo bash /opt/tempo/repo/tempo/deploy/install-autoupdate.sh && sudo systemctl restart tempo && echo DEPLOY_OK'

echo "==> Locating the 'tempo' instance in this region…"
INST=$(oci search resource structured-search \
  --query-text "query instance resources where displayName = 'tempo'" \
  --query 'data.items[0].identifier' --raw-output 2>/dev/null)
if [ -z "${INST:-}" ] || [ "$INST" = "null" ]; then
  echo "!! Could not find an instance named 'tempo'. Is Cloud Shell in UK South (London)?"
  echo "   (Region menu is in the console top bar; Cloud Shell follows it.)"
  exit 1
fi
COMP=$(oci compute instance get --instance-id "$INST" --query 'data."compartment-id"' --raw-output)
echo "    found: $INST"

echo "==> Ensuring the Run Command plugin is enabled (idempotent)…"
oci compute instance update --instance-id "$INST" --force \
  --agent-config '{"isMonitoringDisabled": false, "isManagementDisabled": false, "pluginsConfig": [{"name": "Compute Instance Run Command", "desiredState": "ENABLED"}]}' \
  >/dev/null 2>&1 || true

echo "==> Waiting for the plugin to report RUNNING (first enable can take ~5 min)…"
ST=""
for i in $(seq 1 60); do
  ST=$(oci instance-agent plugin get --instanceagent-id "$INST" --compartment-id "$COMP" \
        --plugin-name "Compute Instance Run Command" --query 'data.status' --raw-output 2>/dev/null)
  [ "$ST" = "RUNNING" ] && break
  printf '.'; sleep 10
done
echo ""
if [ "$ST" != "RUNNING" ]; then
  echo "!! Plugin never reached RUNNING (status: ${ST:-unknown})."
  echo "   Wait 5 more minutes and re-run this one-liner. If it still fails, screenshot this output."
  exit 1
fi

echo "==> Sending the deploy command to the server…"
CMD=$(oci instance-agent command create \
  --compartment-id "$COMP" \
  --target "{\"instanceId\": \"$INST\"}" \
  --content "{\"source\": {\"sourceType\": \"TEXT\", \"text\": \"$DEPLOY_SCRIPT\"}, \"output\": {\"outputType\": \"TEXT\"}}" \
  --display-name "tempo-deploy" \
  --execution-time-out-in-seconds 900 \
  --query 'data.id' --raw-output)
echo "    command: $CMD"

echo "==> Waiting for it to finish…"
STATE="PENDING"
for i in $(seq 1 90); do
  STATE=$(oci instance-agent command-execution get --command-id "$CMD" --instance-id "$INST" \
           --query 'data."lifecycle-state"' --raw-output 2>/dev/null || echo "PENDING")
  case "$STATE" in SUCCEEDED|FAILED|TIMED_OUT|CANCELED) break;; esac
  printf '.'; sleep 10
done
echo ""
echo "==> Result: $STATE"
echo "---- server output ----"
oci instance-agent command-execution get --command-id "$CMD" --instance-id "$INST" \
  --query 'data.content' 2>/dev/null || true
echo "-----------------------"
if [ "$STATE" = "SUCCEEDED" ]; then
  echo ""
  echo "✅ Deployed. Auto-updates are now ON — future releases install themselves."
  echo "   Open https://tempo.falkconsulting.co.uk (close & reopen once) and log in"
  echo "   with the full keyboard."
else
  echo "❌ Something went wrong — screenshot everything above and send it to Claude."
fi
