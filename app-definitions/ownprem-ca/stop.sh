#!/bin/bash
set -euo pipefail

echo "Stopping OwnPrem CA..."
sudo systemctl stop ownprem-ca
echo "OwnPrem CA stopped"
