#!/bin/bash
set -e

# Firewall Setup Script for Ownprem
# Locks down server to only allow SSH and HTTPS via Caddy
# Usage: sudo ./setup-firewall.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

log_info "Setting up firewalld for Ownprem..."

# Install firewalld if not present
if ! command -v firewall-cmd &> /dev/null; then
    log_info "Installing firewalld..."
    if [[ -f /etc/debian_version ]]; then
        apt-get update
        apt-get install -y firewalld
    elif [[ -f /etc/redhat-release ]]; then
        dnf install -y firewalld
    else
        log_error "Unsupported OS. Please install firewalld manually."
        exit 1
    fi
fi

# Enable and start firewalld
log_info "Enabling firewalld..."
systemctl enable firewalld
systemctl start firewalld

# Get current zone
ZONE=$(firewall-cmd --get-default-zone)
log_info "Default zone: $ZONE"

# Remove all services first (clean slate)
log_info "Removing default services..."
CURRENT_SERVICES=$(firewall-cmd --zone=$ZONE --list-services 2>/dev/null || echo "")
for service in $CURRENT_SERVICES; do
    if [[ "$service" != "ssh" ]]; then
        log_info "  Removing: $service"
        firewall-cmd --zone=$ZONE --remove-service=$service --permanent 2>/dev/null || true
    fi
done

# Remove any open ports
log_info "Removing open ports..."
CURRENT_PORTS=$(firewall-cmd --zone=$ZONE --list-ports 2>/dev/null || echo "")
for port in $CURRENT_PORTS; do
    log_info "  Removing: $port"
    firewall-cmd --zone=$ZONE --remove-port=$port --permanent 2>/dev/null || true
done

# Add only required services
log_info "Adding required services..."

# SSH (port 22)
firewall-cmd --zone=$ZONE --add-service=ssh --permanent
log_info "  Added: ssh (22/tcp)"

# HTTP (port 80) - needed for Let's Encrypt ACME challenge
firewall-cmd --zone=$ZONE --add-service=http --permanent
log_info "  Added: http (80/tcp) - for Let's Encrypt"

# HTTPS (port 443)
firewall-cmd --zone=$ZONE --add-service=https --permanent
log_info "  Added: https (443/tcp)"

# Reload firewall
log_info "Reloading firewall..."
firewall-cmd --reload

# Verify configuration
log_info "Verifying firewall configuration..."
echo ""
echo "Active zone: $ZONE"
echo "Allowed services:"
firewall-cmd --zone=$ZONE --list-services
echo ""
echo "Allowed ports:"
firewall-cmd --zone=$ZONE --list-ports || echo "  (none)"
echo ""

# Show active rules
log_info "Current firewall rules:"
firewall-cmd --list-all

log_info "Firewall setup complete!"
echo ""
echo "Summary:"
echo "  - SSH (22/tcp): ALLOWED"
echo "  - HTTP (80/tcp): ALLOWED (Let's Encrypt only)"
echo "  - HTTPS (443/tcp): ALLOWED"
echo "  - All other ports: BLOCKED"
echo ""
echo "Internal services (not exposed):"
echo "  - Orchestrator API: localhost:3001"
echo "  - Agent: localhost only"
echo "  - App ports: Proxied through Caddy"
echo ""
log_warn "Ensure you can still SSH in before closing this session!"
