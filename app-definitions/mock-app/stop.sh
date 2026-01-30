#!/bin/bash
# Stop script for Mock App
# Note: In production, the agent calls systemctl directly via privileged helper.
# This script is for manual/dev use only.
set -e

echo "Stopping Mock App..."

SERVICE_NAME="ownprem-mock-app"

# Try systemctl (will work if run as root or via privileged helper)
if systemctl list-unit-files "$SERVICE_NAME.service" &>/dev/null; then
  systemctl stop "$SERVICE_NAME" 2>/dev/null && {
    echo "Mock App stopped via systemd"
    exit 0
  }
fi

# Fallback for dev mode - use PID file
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="${APP_DIR:-$SCRIPT_DIR}"

if [ -f "$APP_DIR/mock-app.pid" ]; then
  PID=$(cat "$APP_DIR/mock-app.pid")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    rm -f "$APP_DIR/mock-app.pid"
    echo "Mock App stopped (PID: $PID)"
    exit 0
  else
    rm -f "$APP_DIR/mock-app.pid"
    echo "Mock App was not running (stale PID file removed)"
    exit 0
  fi
fi

# Fallback: try to find by process name
pkill -f "node.*$APP_DIR/server.js" 2>/dev/null || true
echo "Mock App stopped"
