#!/bin/bash
set -e

# Ownprem Bootstrap Script
# Downloads and runs the full installer on a clean Ubuntu system
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/PKell33/ownprem/main/scripts/bootstrap.sh | sudo bash
#   curl -fsSL https://raw.githubusercontent.com/PKell33/ownprem/main/scripts/bootstrap.sh | sudo bash -s -- --local
#   curl -fsSL https://raw.githubusercontent.com/PKell33/ownprem/main/scripts/bootstrap.sh | sudo bash -s -- --domain example.com --email admin@example.com

REPO_URL="https://github.com/PKell33/ownprem.git"
REPO_DIR="/opt/ownprem/repo"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

echo ""
echo "========================================"
echo "       Ownprem Bootstrap"
echo "========================================"
echo ""

# Install git if not present
if ! command -v git &> /dev/null; then
    log_info "Installing git..."
    apt-get update
    apt-get install -y git
fi

# Clone or update repository
if [[ -d "$REPO_DIR/.git" ]]; then
    log_info "Updating existing repository..."
    cd "$REPO_DIR"
    git pull
else
    log_info "Cloning repository..."
    mkdir -p "$(dirname "$REPO_DIR")"
    git clone "$REPO_URL" "$REPO_DIR"
fi

# Run the main installer with all passed arguments
log_info "Running installer..."
cd "$REPO_DIR"
exec ./scripts/install.sh "$@"
