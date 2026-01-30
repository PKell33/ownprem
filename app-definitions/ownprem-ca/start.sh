#!/bin/bash
set -euo pipefail

echo "Starting OwnPrem CA..."
sudo systemctl start ownprem-ca

# Wait for CA to be ready
for i in {1..30}; do
    if curl -sk https://localhost:8443/health | grep -q "ok"; then
        echo "OwnPrem CA is running"
        exit 0
    fi
    sleep 1
done

echo "Warning: CA health check timeout, but service may still be starting"
exit 0
