#!/bin/bash
set -e

# Ownprem Full Server Deployment Script
# Deploys orchestrator + agent + caddy + firewall
# Usage: sudo ./deploy-server.sh <domain> [email]

DOMAIN="${1:-ownprem.local}"
EMAIL="${2:-}"
REPO_URL="${REPO_URL:-https://github.com/your-org/ownprem.git}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "\n${BLUE}==== $1 ====${NC}\n"; }

if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

# Show help if requested
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
    echo "Usage: $0 [domain] [admin-email]"
    echo ""
    echo "Arguments:"
    echo "  domain      Domain name (default: ownprem.local)"
    echo "  admin-email Email for Let's Encrypt (only for public domains)"
    echo ""
    echo "Examples:"
    echo "  $0                           # Uses ownprem.local with self-signed cert"
    echo "  $0 ownprem.local             # Local domain with self-signed cert"
    echo "  $0 ownprem.example.com       # Public domain with Let's Encrypt"
    echo ""
    echo "Environment variables:"
    echo "  REPO_URL - Git repository URL (default: $REPO_URL)"
    exit 0
fi

echo ""
echo "========================================"
echo "  Ownprem Full Server Deployment"
echo "========================================"
echo ""
echo "Domain: $DOMAIN"
if [[ -n "$EMAIL" ]]; then
    echo "Email:  $EMAIL"
fi
echo "Repo:   $REPO_URL"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# ============================================
# Step 1: System Prerequisites
# ============================================
log_step "Step 1/6: Installing system prerequisites"

if [[ -f /etc/debian_version ]]; then
    apt-get update
    apt-get install -y curl git build-essential
else
    dnf install -y curl git gcc gcc-c++ make
fi

# Install Node.js 20 if not present
if ! command -v node &> /dev/null || [[ $(node -v | cut -d'v' -f2 | cut -d'.' -f1) -lt 20 ]]; then
    log_info "Installing Node.js 20..."
    if [[ -f /etc/debian_version ]]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    else
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
        dnf install -y nodejs
    fi
fi
log_info "Node.js version: $(node -v)"

# ============================================
# Step 2: Clone Repository
# ============================================
log_step "Step 2/6: Cloning repository"

REPO_DIR="/opt/ownprem/repo"

if [[ -d "$REPO_DIR/.git" ]]; then
    log_info "Repository exists, pulling latest..."
    cd "$REPO_DIR"
    git pull
else
    log_info "Cloning repository..."
    mkdir -p /opt/ownprem
    git clone "$REPO_URL" "$REPO_DIR"
    cd "$REPO_DIR"
fi

# ============================================
# Step 3: Install Ownprem
# ============================================
log_step "Step 3/6: Installing Ownprem (orchestrator + agent)"

chmod +x scripts/*.sh scripts/**/*.sh 2>/dev/null || true
./scripts/install.sh both

# ============================================
# Step 4: Install and Configure Caddy
# ============================================
log_step "Step 4/6: Installing Caddy with HTTPS"

if [[ -n "$EMAIL" ]]; then
    ./scripts/caddy/install-caddy.sh "$DOMAIN" "$EMAIL"
else
    ./scripts/caddy/install-caddy.sh "$DOMAIN"
fi

# ============================================
# Step 5: Configure Firewall
# ============================================
log_step "Step 5/6: Configuring firewall (SSH + HTTPS only)"

./scripts/setup-firewall.sh

# ============================================
# Step 6: Start Services
# ============================================
log_step "Step 6/6: Starting services"

# Configure agent for local orchestrator
AGENT_ENV="/etc/ownprem/agent.env"
if [[ -f "$AGENT_ENV" ]]; then
    sed -i "s|^SERVER_ID=.*|SERVER_ID=core|" "$AGENT_ENV"
    sed -i "s|^ORCHESTRATOR_URL=.*|ORCHESTRATOR_URL=http://localhost:3001|" "$AGENT_ENV"
fi

# Start services
systemctl start ownprem-orchestrator
sleep 2
systemctl start ownprem-agent

# Verify services
log_info "Checking service status..."
systemctl is-active ownprem-orchestrator && log_info "Orchestrator: running" || log_error "Orchestrator: failed"
systemctl is-active ownprem-agent && log_info "Agent: running" || log_error "Agent: failed"
systemctl is-active caddy && log_info "Caddy: running" || log_error "Caddy: failed"

# ============================================
# Complete
# ============================================
echo ""
echo "========================================"
echo "  Deployment Complete!"
echo "========================================"
echo ""
echo "Access:"
echo "  UI:  https://$DOMAIN"
echo "  API: https://$DOMAIN/api"
echo ""
echo "Services:"
echo "  systemctl status ownprem-orchestrator"
echo "  systemctl status ownprem-agent"
echo "  systemctl status caddy"
echo ""
echo "Logs:"
echo "  journalctl -u ownprem-orchestrator -f"
echo "  journalctl -u ownprem-agent -f"
echo "  tail -f /var/log/caddy/ownprem-access.log"
echo ""
echo "Firewall:"
echo "  SSH (22), HTTP (80), HTTPS (443) only"
echo "  All app UIs accessible via https://$DOMAIN/apps/*"
echo ""
echo "Config files:"
echo "  /etc/ownprem/orchestrator.env"
echo "  /etc/ownprem/agent.env"
echo "  /etc/caddy/Caddyfile"
echo ""

# Check if local domain
if [[ "$DOMAIN" =~ \.(local|localhost|lan|internal|home|test)$ ]]; then
    SERVER_IP=$(hostname -I | awk '{print $1}')
    log_warn "Add to your client hosts file:"
    echo "  $SERVER_IP $DOMAIN"
    echo ""
    echo "Then accept the self-signed certificate in your browser."
else
    log_warn "Ensure DNS A record for $DOMAIN points to this server!"
fi
