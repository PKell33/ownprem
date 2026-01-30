#!/bin/bash
set -euo pipefail

# OwnPrem CA Uninstall Script
# Note: This should be blocked by orchestrator for mandatory apps on core server

DATA_DIR="/var/lib/step-ca"
CONFIG_DIR="/etc/step-ca"
APP_DIR="${APP_DIR:-/opt/ownprem/apps/ownprem-ca}"
SERVICE_USER="step-ca"

# Check if this is core server (orchestrator should prevent this, but double-check)
if [[ "${IS_CORE_SERVER:-false}" == "true" ]]; then
    echo "ERROR: Cannot uninstall mandatory CA from core server"
    exit 1
fi

echo "Uninstalling OwnPrem CA..."

# Stop service
systemctl stop ownprem-ca 2>/dev/null || true
systemctl disable ownprem-ca 2>/dev/null || true

# Remove systemd service
rm -f /etc/systemd/system/ownprem-ca.service
systemctl daemon-reload

# Remove data (WARNING: This deletes all certificates and CA keys!)
echo "WARNING: Removing CA data including root certificate and keys"
rm -rf "$DATA_DIR"
rm -rf "$CONFIG_DIR"
rm -rf "$APP_DIR"

# Remove service user
userdel "$SERVICE_USER" 2>/dev/null || true

echo "OwnPrem CA uninstalled"
echo "Note: Any certificates issued by this CA will no longer be valid"
