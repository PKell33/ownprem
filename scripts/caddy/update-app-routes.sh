#!/bin/bash
set -e

# Update Caddy App Routes
# This script queries the orchestrator for proxy routes and updates Caddy
# Can be run manually or via cron/systemd timer

ORCHESTRATOR_URL="${ORCHESTRATOR_URL:-http://localhost:3001}"
CADDYFILE="/etc/caddy/Caddyfile"
ROUTES_FILE="/etc/caddy/app-routes.caddy"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Fetch proxy routes from orchestrator
log_info "Fetching proxy routes from orchestrator..."

ROUTES=$(curl -sf "$ORCHESTRATOR_URL/api/proxy-routes" 2>/dev/null || echo "[]")

if [[ "$ROUTES" == "[]" || -z "$ROUTES" ]]; then
    log_info "No proxy routes configured"
    # Clear routes file
    echo "# No app routes configured" > "$ROUTES_FILE"
else
    log_info "Generating Caddy routes..."

    # Generate Caddy snippet for app routes
    cat > "$ROUTES_FILE" << 'HEADER'
# Auto-generated app routes
# Do not edit manually - managed by update-app-routes.sh
HEADER

    # Parse JSON and generate routes
    echo "$ROUTES" | jq -r '.[] | select(.active == true) | "handle \(.path)/* {\n    reverse_proxy \(.upstream)\n}\n"' >> "$ROUTES_FILE"
fi

# Validate and reload Caddy
log_info "Validating Caddy configuration..."
if caddy validate --config "$CADDYFILE" 2>/dev/null; then
    log_info "Reloading Caddy..."
    systemctl reload caddy
    log_info "Done"
else
    log_error "Caddy validation failed - not reloading"
    exit 1
fi
