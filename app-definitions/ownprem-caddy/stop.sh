#!/bin/bash
set -euo pipefail

echo "Stopping OwnPrem Caddy..."

# Stop keepalived first if running
if sudo systemctl is-active --quiet keepalived 2>/dev/null; then
    sudo systemctl stop keepalived
    echo "Keepalived stopped"
fi

sudo systemctl stop ownprem-caddy
echo "OwnPrem Caddy stopped"
