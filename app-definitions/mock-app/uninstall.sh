#!/bin/bash
# Uninstall script for Mock App
set -e

APP_DIR="${APP_DIR:-/opt/ownprem/apps/mock-app}"
KEEP_DATA="${KEEP_DATA:-false}"

echo "Uninstalling Mock App..."
echo "APP_DIR: $APP_DIR"

# Stop the app if running
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/stop.sh" ]; then
  "$SCRIPT_DIR/stop.sh" || true
fi

# Remove app files
echo "Removing app files..."
rm -f "$APP_DIR/server.js"
rm -f "$APP_DIR/config.json"
rm -f "$APP_DIR/mock-app.pid"

# Remove logs unless KEEP_DATA is true
if [ "$KEEP_DATA" = "false" ]; then
  rm -rf "$APP_DIR/logs"
  echo "Logs removed"
else
  echo "Keeping logs at $APP_DIR/logs"
fi

echo "Mock App uninstalled successfully"
