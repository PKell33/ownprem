#!/bin/bash
set -euo pipefail

# OwnPrem CA Configuration Script
# Called when configuration changes are made

DATA_DIR="/var/lib/step-ca"
CONFIG_DIR="/etc/step-ca"
APP_DIR="${APP_DIR:-/opt/ownprem/apps/ownprem-ca}"

export PATH="$APP_DIR/bin:$PATH"
export STEPPATH="$DATA_DIR"

# Configuration from environment
DEFAULT_CERT_DURATION="${DEFAULT_CERT_DURATION:-720h}"
MAX_CERT_DURATION="${MAX_CERT_DURATION:-8760h}"
ACME_ENABLED="${ACME_ENABLED:-true}"

CA_CONFIG="$DATA_DIR/config/ca.json"

echo "Updating CA configuration..."

# Update certificate durations
if command -v jq &>/dev/null && [[ -f "$CA_CONFIG" ]]; then
    jq --arg def "$DEFAULT_CERT_DURATION" --arg max "$MAX_CERT_DURATION" \
        '.authority.claims.defaultTLSCertDuration = $def | .authority.claims.maxTLSCertDuration = $max' \
        "$CA_CONFIG" > "$CA_CONFIG.tmp" && mv "$CA_CONFIG.tmp" "$CA_CONFIG"
    echo "Updated certificate durations"
fi

# Check if ACME provisioner exists
ACME_EXISTS=$(jq -r '.authority.provisioners[]? | select(.type == "ACME") | .name' "$CA_CONFIG" 2>/dev/null || echo "")

if [[ "$ACME_ENABLED" == "true" ]] && [[ -z "$ACME_EXISTS" ]]; then
    echo "Adding ACME provisioner..."
    step ca provisioner add acme --type ACME
elif [[ "$ACME_ENABLED" != "true" ]] && [[ -n "$ACME_EXISTS" ]]; then
    echo "Removing ACME provisioner..."
    step ca provisioner remove acme --type ACME
fi

# Copy updated config
cp "$CA_CONFIG" "$CONFIG_DIR/ca.json"

# Reload service if running
if systemctl is-active --quiet ownprem-ca; then
    echo "Reloading CA service..."
    systemctl reload ownprem-ca || systemctl restart ownprem-ca
fi

echo "CA configuration updated"
