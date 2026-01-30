#!/bin/bash
set -euo pipefail

echo "Starting OwnPrem Caddy..."
sudo systemctl start ownprem-caddy

# Wait for Caddy to be ready
for i in {1..30}; do
    if curl -sf http://localhost:2019/config/ > /dev/null 2>&1; then
        echo "OwnPrem Caddy is running"

        # Start keepalived if configured
        if sudo systemctl is-enabled keepalived 2>/dev/null; then
            sudo systemctl start keepalived
            echo "Keepalived started"
        fi

        exit 0
    fi
    sleep 1
done

echo "Warning: Caddy health check timeout"
exit 1
