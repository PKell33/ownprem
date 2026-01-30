#!/bin/bash
set -euo pipefail

# OwnPrem Caddy Configuration Script
# Called when configuration changes are made

CONFIG_DIR="/etc/caddy"
APP_DIR="${APP_DIR:-/opt/ownprem/apps/ownprem-caddy}"

# Configuration from environment
CA_URL="${CA_URL:-https://ca.ownprem.local:8443/acme/acme/directory}"
CA_ROOT_CERT="${CA_ROOT_CERT:-/etc/step-ca/root_ca.crt}"
ADMIN_API_LISTEN="${ADMIN_API_LISTEN:-localhost:2019}"
HA_ENABLED="${HA_ENABLED:-false}"
HA_VIP="${HA_VIP:-}"
HA_INTERFACE="${HA_INTERFACE:-eth0}"
HA_PRIORITY="${HA_PRIORITY:-100}"
HA_ROUTER_ID="${HA_ROUTER_ID:-51}"

echo "Updating Caddy configuration..."

# Update Caddyfile global options
# Note: The actual site configuration is managed via Admin API by orchestrator
cat > "$CONFIG_DIR/Caddyfile" << EOF
{
    # Use internal CA for certificates
    acme_ca ${CA_URL}
    acme_ca_root ${CA_ROOT_CERT}

    # Admin API
    admin ${ADMIN_API_LISTEN}

    # Logging
    log {
        output file /var/log/caddy/access.log
        format json
    }
}

# Proxy routes are managed via Admin API
# This file only contains global settings
EOF

# Update keepalived configuration if HA is enabled
if [[ "$HA_ENABLED" == "true" ]] && [[ -f /etc/keepalived/keepalived.conf ]]; then
    echo "Updating keepalived configuration..."

    # Get existing auth pass or generate new
    VRRP_AUTH_PASS=""
    if [[ -f "$CONFIG_DIR/.vrrp_auth_pass" ]]; then
        VRRP_AUTH_PASS=$(cat "$CONFIG_DIR/.vrrp_auth_pass")
    else
        VRRP_AUTH_PASS=$(openssl rand -hex 4)
        echo "$VRRP_AUTH_PASS" > "$CONFIG_DIR/.vrrp_auth_pass"
        chmod 600 "$CONFIG_DIR/.vrrp_auth_pass"
    fi

    cat > /etc/keepalived/keepalived.conf << EOF
global_defs {
    router_id ownprem_caddy_${HOSTNAME}
    script_user root
    enable_script_security
}

vrrp_script check_caddy {
    script "/usr/bin/curl -sf http://localhost:2019/config/ > /dev/null"
    interval 2
    weight 2
    fall 3
    rise 2
}

vrrp_instance VI_CADDY {
    state BACKUP
    interface ${HA_INTERFACE}
    virtual_router_id ${HA_ROUTER_ID}
    priority ${HA_PRIORITY}
    advert_int 1

    authentication {
        auth_type PASS
        auth_pass ${VRRP_AUTH_PASS}
    }

    virtual_ipaddress {
        ${HA_VIP}
    }

    track_script {
        check_caddy
    }
}
EOF

    systemctl restart keepalived
fi

# Reload Caddy if running
if systemctl is-active --quiet ownprem-caddy; then
    echo "Reloading Caddy..."
    "$APP_DIR/bin/caddy" reload --config "$CONFIG_DIR/Caddyfile" --adapter caddyfile || true
fi

echo "Caddy configuration updated"
