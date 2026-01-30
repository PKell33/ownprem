#!/bin/bash
# Start script for Mock App
# Note: In production, the agent calls systemctl directly via privileged helper.
# This script is for manual/dev use only.
set -e

echo "Starting Mock App..."

SERVICE_NAME="ownprem-mock-app"

# Check if running via systemd
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  echo "Mock App is already running"
  exit 0
fi

# Try systemctl (will work if run as root or via privileged helper)
if systemctl list-unit-files "$SERVICE_NAME.service" &>/dev/null; then
  systemctl start "$SERVICE_NAME" 2>/dev/null && {
    echo "Mock App started via systemd"
    exit 0
  }
fi

# Fallback for dev mode - run directly
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export APP_DIR="${APP_DIR:-$SCRIPT_DIR}"

if [ -f "$APP_DIR/mock-app.pid" ]; then
  PID=$(cat "$APP_DIR/mock-app.pid")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Mock App is already running (PID: $PID)"
    exit 0
  fi
  rm -f "$APP_DIR/mock-app.pid"
fi

exec node "$APP_DIR/server.js"
