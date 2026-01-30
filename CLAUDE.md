# Ownprem

Sovereign Bitcoin infrastructure platform. Deploy and manage Bitcoin nodes, indexers, and Lightning services across one or more servers with a unified web interface.

## Quick Reference

| Concept | Description |
|---------|-------------|
| Orchestrator | Central API server, manages deployments, secrets, proxy config |
| Agent | Runs on each server, executes commands from orchestrator |
| App | Bitcoin software (bitcoin, electrs, mempool, lnd, etc.) |
| Server | Machine running an agent (core server runs both orchestrator + agent) |

## Architecture

```
User → https://ownprem.local
              │
              ▼
┌──────────────────────────────────────────┐
│              CORE SERVER                 │
│                                          │
│  ┌─────────┐    ┌──────────────────────┐│
│  │  Caddy  │───→│    Orchestrator      ││
│  │ (proxy) │    │  - Express API       ││
│  │         │    │  - WebSocket server  ││
│  │ Admin   │←───│  - SQLite DB         ││
│  │  API    │    │  - Secrets manager   ││
│  └─────────┘    │  - Proxy manager     ││
│       │         └──────────┬───────────┘│
│       │                    │            │
│       ▼              WebSocket          │
│  ┌─────────┐              │            │
│  │   UI    │         ┌────┴────┐       │
│  │ (React) │         │  Agent  │       │
│  └─────────┘         └────┬────┘       │
│       │                   │            │
│       ▼                   ▼            │
│  /apps/mock-app →   [mock-app:9999]    │
│  /apps/bitcoin  →   [bitcoind:8332]    │
└──────────────────────────────────────────┘
              │
         WebSocket
              │
      ┌───────┴───────┐
      ▼               ▼
┌──────────┐   ┌──────────┐
│ server-1 │   │ server-2 │
│  Agent   │   │  Agent   │
│    │     │   │    │     │
│ electrs  │   │   lnd    │
│ mempool  │   │   rtl    │
└──────────┘   └──────────┘
```

## Project Structure

```
ownprem/
├── packages/shared/           # Shared types (@ownprem/shared)
├── apps/
│   ├── orchestrator/          # API, WebSocket, DB, secrets, proxy
│   │   └── src/
│   │       ├── api/           # Express routes
│   │       ├── db/            # SQLite schema and queries
│   │       ├── services/      # Business logic
│   │       └── websocket/     # Socket.IO server
│   ├── agent/                 # Command executor
│   └── ui/                    # React frontend (Vite)
├── app-definitions/           # App manifests and install scripts
│   ├── mock-app/              # Test app for development
│   ├── bitcoin/               # Bitcoin Core
│   └── .../                   # More apps
└── scripts/                   # Installation and deployment
    ├── install.sh             # Main installer
    ├── caddy/                 # Caddy setup
    └── systemd/               # Service files
```

## Development

### Prerequisites

- Node.js 20+
- Caddy with Admin API enabled (`admin localhost:2019`)
- Local domain: add `127.0.0.1 ownprem.local` to `/etc/hosts`

### Start Development

```bash
npm run dev    # Starts orchestrator + agent + UI concurrently
```

This starts:
- Orchestrator on `:3001` (API + WebSocket)
- Agent connecting to orchestrator
- Vite dev server on `:5173`
- Caddy proxies `https://ownprem.local` → services

### Access Points

| URL | Description |
|-----|-------------|
| https://ownprem.local | Main UI (via Caddy) |
| https://ownprem.local/api | API endpoints |
| https://ownprem.local/apps/* | Deployed app UIs |
| http://localhost:5173 | Vite dev server (direct) |
| http://localhost:3001/api | API (direct, no TLS) |

### First-Time Setup

1. Start dev server: `npm run dev`
2. Open https://ownprem.local
3. Accept self-signed certificate (or install Caddy's root CA)
4. Create admin account at first login
5. Deploy mock-app to test the flow

### Local Data

```
./data/ownprem.sqlite    # Database
./data/apps/             # Installed apps
./logs/                  # Log files
```

## Key Services

### Proxy Manager (`proxyManager.ts`)

Manages Caddy reverse proxy routes via **Admin API** (not Caddyfile).

- Routes stored in `proxy_routes` and `service_routes` tables
- `updateAndReload()` pushes JSON config to Caddy Admin API
- Orchestrator syncs config on startup
- Supports web UI routes (`/apps/*`) and TCP service routes

### Deployer (`deployer.ts`)

Handles app lifecycle:
- `installApp()` - Deploy app to a server
- `startApp()` / `stopApp()` - Control running state
- `uninstallApp()` - Remove app and cleanup

### Secrets Manager (`secretsManager.ts`)

- Generates credentials (RPC passwords, etc.)
- Encrypts secrets at rest (AES-256-GCM)
- Renders secrets into app config files

## API Endpoints

### Authentication
```
POST /api/auth/register     # First-time admin setup
POST /api/auth/login        # Login (returns JWT)
POST /api/auth/logout       # Logout
GET  /api/auth/status       # Check auth state
POST /api/auth/totp/setup   # Enable 2FA
POST /api/auth/totp/verify  # Verify 2FA code
```

### Servers
```
GET    /api/servers         # List all servers
POST   /api/servers         # Register new server
GET    /api/servers/:id     # Get server details
PUT    /api/servers/:id     # Update server
DELETE /api/servers/:id     # Remove server
```

### Apps
```
GET  /api/apps              # List available apps
GET  /api/apps/:name        # Get app manifest
```

### Deployments
```
GET    /api/deployments           # List deployments
POST   /api/deployments           # Deploy app
GET    /api/deployments/:id       # Get deployment
DELETE /api/deployments/:id       # Uninstall app
POST   /api/deployments/:id/start # Start app
POST   /api/deployments/:id/stop  # Stop app
```

### System
```
GET  /api/certificate       # Download Caddy root CA
GET  /health                # Health check
GET  /ready                 # Readiness check
```

## WebSocket Events

```
Server → Client:
  server:status        # Server online/offline status
  server:connected     # Agent connected
  server:disconnected  # Agent disconnected
  deployment:status    # Deployment state change
  deployment:log       # Real-time logs

Agent → Orchestrator:
  register             # Agent registration
  status               # Periodic heartbeat
  command:result       # Command execution result

Orchestrator → Agent:
  command              # Execute command (install, start, stop, etc.)
```

## App Manifest Structure

```yaml
name: electrs
displayName: Electrs
version: 0.11.0
category: indexer
description: Electrum server for Bitcoin

source:
  type: git
  url: https://github.com/romanz/electrs.git

requires:
  - service: bitcoin-rpc
    locality: prefer-same-server

provides:
  - name: electrs-rpc
    port: 50001
    protocol: tcp

webui:
  enabled: true
  port: 3006
  basePath: /apps/electrs

configSchema:
  - name: network
    type: string
    default: mainnet
    options: [mainnet, testnet, regtest]
```

## Privileged Helper

The agent runs as the `ownprem` user (non-root). Operations requiring elevated privileges are handled by a separate **privileged helper** service that runs as root and communicates via Unix socket.

### Service Naming Convention

**IMPORTANT:** All systemd service names MUST start with `ownprem-` prefix (e.g., `ownprem-mock-app`, `ownprem-caddy`).

The privileged helper only allows controlling services matching these patterns:
- `ownprem-*` (e.g., `ownprem-caddy`, `ownprem-ca`, `ownprem-mock-app`)
- `step-ca`, `caddy`, `keepalived` (legacy exceptions)

When creating a new app:
1. Set `logging.serviceName` in manifest.yaml to `ownprem-{appname}`
2. Name the systemd service file `ownprem-{appname}.service`
3. The agent will use the privileged helper to start/stop the service

### Privileged Helper Operations

| Operation | Description |
|-----------|-------------|
| `systemctl` | Start/stop/restart services (must match allowed patterns) |
| `create_service_user` | Create system users for services |
| `create_directory` | Create directories with ownership |
| `write_file` | Write to allowed paths (systemd units, config files) |
| `set_capability` | Set Linux capabilities on binaries |
| `mount`/`umount` | Mount/unmount NFS/CIFS storage |
| `apt_install` | Install whitelisted packages |

### Key Files

| File | Purpose |
|------|---------|
| `apps/privileged-helper/src/validator.ts` | Whitelist rules for allowed operations |
| `apps/privileged-helper/src/executor.ts` | Executes validated operations |
| `apps/agent/src/privilegedClient.ts` | Agent's client for the helper |
| `/run/ownprem/helper.sock` | Unix socket (ownprem user only) |

## Database Schema

SQLite at `./data/ownprem.sqlite` (dev) or `/var/lib/ownprem/db.sqlite` (prod)

**Tables:**
- `users` - Admin accounts with password hashes and TOTP secrets
- `servers` - Registered servers and connection state
- `deployments` - Installed apps and their status
- `secrets` - Encrypted credentials
- `proxy_routes` - Web UI reverse proxy routes
- `service_routes` - TCP/HTTP service routes
- `audit_log` - Security audit trail

## Production Installation

```bash
# Full installation (orchestrator + agent + Caddy)
sudo ./scripts/install.sh --local

# With Let's Encrypt (public domain)
sudo ./scripts/install.sh --domain ownprem.example.com --email admin@example.com

# Agent-only (additional servers)
sudo ./scripts/install.sh --type agent --skip-caddy
```

### Service Management

```bash
# Status
systemctl status ownprem-orchestrator ownprem-agent caddy

# Logs
journalctl -u ownprem-orchestrator -f
journalctl -u ownprem-agent -f

# Restart
systemctl restart ownprem-orchestrator
```

### Configuration Files

```
/etc/ownprem/orchestrator.env   # Orchestrator config
/etc/ownprem/agent.env          # Agent config
/etc/caddy/Caddyfile            # Caddy (minimal, config via Admin API)
```

## Key Files

| File | Purpose |
|------|---------|
| `apps/orchestrator/src/index.ts` | Orchestrator entry point |
| `apps/orchestrator/src/services/deployer.ts` | App deployment logic |
| `apps/orchestrator/src/services/proxyManager.ts` | Caddy Admin API integration |
| `apps/orchestrator/src/services/secretsManager.ts` | Credential encryption |
| `apps/agent/src/executor.ts` | Command execution |
| `apps/ui/src/App.tsx` | React app entry |
| `app-definitions/*/manifest.yaml` | App definitions |

## Troubleshooting

### Caddy not proxying routes

```bash
# Check Caddy config via Admin API
curl -s localhost:2019/config/ | jq .

# Force sync from orchestrator
curl -X POST https://ownprem.local/api/proxy-routes/reload
```

### Agent not connecting

```bash
# Check agent logs
journalctl -u ownprem-agent -f

# Verify orchestrator URL in config
cat /etc/ownprem/agent.env
```

### Reset development database

```bash
rm ./data/ownprem.sqlite
npm run dev  # Recreates schema
```

### Certificate issues

```bash
# Get Caddy root CA
curl -k https://ownprem.local/api/certificate -o caddy-root-ca.crt

# Install on Linux
sudo cp caddy-root-ca.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates
```
