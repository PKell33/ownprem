#!/bin/bash
# Install script for Mock App
# Note: Mock App is a simple Node.js server for testing the platform.
# Unlike other apps, it doesn't require downloading or building - the
# server code is embedded in this script.
set -e

# Configuration from environment
APP_DIR="${APP_DIR:-/opt/ownprem/apps/mock-app}"
VERSION="${APP_VERSION:-1.0.0}"

echo "Installing Mock App ${VERSION}..."
echo "APP_DIR: $APP_DIR"

# Create directories
mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/logs"

# Create the server script
cat > "$APP_DIR/server.js" << 'SERVEREOF'
const http = require('http');
const fs = require('fs');
const path = require('path');

const appDir = process.env.APP_DIR || '.';
const port = 9999;
const logFile = path.join(appDir, 'logs', 'mock-app.log');
const configFile = path.join(appDir, 'config.json');
const pidFile = path.join(appDir, 'mock-app.pid');

// Load config (with defaults)
let config = { message: 'Mock App Running' };
try {
  if (fs.existsSync(configFile)) {
    config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
  }
} catch (err) {
  console.error('Failed to load config:', err.message);
}

// Environment variable overrides config file
const msg = process.env.MESSAGE || config.message || 'Mock App Running';

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `${timestamp} ${message}\n`;
  try {
    fs.appendFileSync(logFile, line);
  } catch (err) {
    // Ignore write errors
  }
  console.log(line.trim());
}

// Write PID file
fs.writeFileSync(pidFile, process.pid.toString());

const server = http.createServer((req, res) => {
  log(`[INFO] ${req.method} ${req.url} from ${req.socket.remoteAddress}`);
  res.setHeader('Content-Type', 'text/html');
  res.end(`<h1>${msg}</h1><p>Mock App is running!</p>`);
});

server.listen(port, () => {
  log(`[INFO] Mock App started on port ${port}`);
  log(`[INFO] Message: ${msg}`);
});

// Log periodically to have some log content
setInterval(() => {
  log(`[INFO] Heartbeat - app is alive`);
}, 30000);

// Cleanup on shutdown
function cleanup() {
  log(`[INFO] Shutting down...`);
  try {
    fs.unlinkSync(pidFile);
  } catch (err) {
    // Ignore
  }
  server.close();
  process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
SERVEREOF

# Create default config
cat > "$APP_DIR/config.json" << EOF
{
  "message": "${MESSAGE:-Hello from Mock App}"
}
EOF

# Create systemd service (ownprem- prefix required for privileged helper)
cat > /etc/systemd/system/ownprem-mock-app.service << EOF
[Unit]
Description=OwnPrem Mock App
After=network.target

[Service]
Type=simple
User=ownprem
Group=ownprem
WorkingDirectory=$APP_DIR
Environment=APP_DIR=$APP_DIR
ExecStart=/usr/bin/node $APP_DIR/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

echo "Mock App ${VERSION} installed successfully"
