#!/bin/bash
# Configure script for Mock App
set -e

echo "Configuring Mock App..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="${APP_DIR:-$SCRIPT_DIR}"

# Configuration is passed via environment variables:
# - MESSAGE: Welcome message to display

echo "APP_DIR: $APP_DIR"
echo "MESSAGE: ${MESSAGE:-Hello from Mock App}"

# Write config file (used by server.js)
cat > "$APP_DIR/config.json" << EOF
{
  "message": "${MESSAGE:-Hello from Mock App}"
}
EOF

echo "Configuration written to $APP_DIR/config.json"

# Note: We don't auto-restart here. The orchestrator handles restart after configure.
# The server.js reads config on startup, so a restart is needed to apply changes.

echo "Mock App configured successfully"
