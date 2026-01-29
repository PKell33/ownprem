#!/bin/bash
# Start script for Mock App
# Note: Mock App is a real Node.js server for testing the platform,
# so it runs in both dev and production modes (no systemd).
set -e

echo "Starting Mock App..."

# Get the directory where this script lives
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export APP_DIR="${APP_DIR:-$SCRIPT_DIR}"

# Check if already running
if [ -f "$APP_DIR/mock-app.pid" ]; then
  PID=$(cat "$APP_DIR/mock-app.pid")
  if kill -0 "$PID" 2>/dev/null; then
    echo "Mock App is already running (PID: $PID)"
    exit 0
  fi
  # Stale PID file, remove it
  rm -f "$APP_DIR/mock-app.pid"
fi

# Run node server (exec replaces the shell process)
exec node "$APP_DIR/server.js"
