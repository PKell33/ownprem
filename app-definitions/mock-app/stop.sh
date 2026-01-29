#!/bin/bash
# Stop script for Mock App
# Note: Mock App is a real Node.js server for testing the platform,
# so it runs in both dev and production modes (no systemd).
set -e

echo "Stopping Mock App..."

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="${APP_DIR:-$SCRIPT_DIR}"

# Find and kill the node process using PID file
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
