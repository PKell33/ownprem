#!/bin/bash
set -e

# Nodefoundry Uninstallation Script
# Usage: sudo ./uninstall.sh [--purge]

PURGE=false
if [[ "$1" == "--purge" ]]; then
    PURGE=true
fi

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

log_info "Stopping Nodefoundry services..."
systemctl stop nodefoundry-orchestrator 2>/dev/null || true
systemctl stop nodefoundry-agent 2>/dev/null || true

log_info "Disabling services..."
systemctl disable nodefoundry-orchestrator 2>/dev/null || true
systemctl disable nodefoundry-agent 2>/dev/null || true

log_info "Removing systemd service files..."
rm -f /etc/systemd/system/nodefoundry-orchestrator.service
rm -f /etc/systemd/system/nodefoundry-agent.service
systemctl daemon-reload

if $PURGE; then
    log_warn "Purge mode: Removing all data and configuration"

    read -p "This will delete ALL Nodefoundry data. Are you sure? (yes/no): " confirm
    if [[ "$confirm" != "yes" ]]; then
        log_info "Aborted"
        exit 0
    fi

    log_info "Removing data directories..."
    rm -rf /var/lib/nodefoundry
    rm -rf /var/log/nodefoundry
    rm -rf /opt/nodefoundry
    rm -rf /etc/nodefoundry

    log_info "Removing nodefoundry user..."
    userdel nodefoundry 2>/dev/null || true

    log_info "Purge complete"
else
    log_info "Services removed. Data preserved at:"
    echo "  - /var/lib/nodefoundry (database)"
    echo "  - /var/log/nodefoundry (logs)"
    echo "  - /opt/nodefoundry (apps and repo)"
    echo "  - /etc/nodefoundry (configuration)"
    echo ""
    echo "To remove all data, run: sudo ./uninstall.sh --purge"
fi

log_info "Uninstallation complete"
