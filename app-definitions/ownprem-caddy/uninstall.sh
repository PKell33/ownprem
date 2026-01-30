#!/bin/bash
set -euo pipefail

# OwnPrem Caddy Uninstall Script
# Note: This should be blocked by orchestrator for mandatory apps on core server

DATA_DIR="/var/lib/caddy"
CONFIG_DIR="/etc/caddy"
APP_DIR="${APP_DIR:-/opt/ownprem/apps/ownprem-caddy}"
SERVICE_USER="caddy"

# Check if this is core server
if [[ "${IS_CORE_SERVER:-false}" == "true" ]]; then
    echo "ERROR: Cannot uninstall mandatory Caddy from core server"
    exit 1
fi

echo "Uninstalling OwnPrem Caddy..."

# Stop services
systemctl stop keepalived 2>/dev/null || true
systemctl stop ownprem-caddy 2>/dev/null || true
systemctl disable keepalived 2>/dev/null || true
systemctl disable ownprem-caddy 2>/dev/null || true

# Remove systemd service
rm -f /etc/systemd/system/ownprem-caddy.service
systemctl daemon-reload

# Remove keepalived config (but not the package - might be used by others)
rm -f /etc/keepalived/keepalived.conf

# Remove data
rm -rf "$DATA_DIR"
rm -rf "$CONFIG_DIR"
rm -rf "$APP_DIR"
rm -rf /var/log/caddy

# Remove service user
userdel "$SERVICE_USER" 2>/dev/null || true

echo "OwnPrem Caddy uninstalled"
