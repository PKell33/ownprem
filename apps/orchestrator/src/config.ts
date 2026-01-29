import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDevelopment = (process.env.NODE_ENV || 'development') === 'development';

// Default values
const DEFAULT_PORT = 3001;
const DEFAULT_BCRYPT_ROUNDS = 12;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 100;
const AUTH_RATE_LIMIT_MAX = 10; // Stricter limit for auth endpoints

export const config = {
  port: parseInt(process.env.PORT || String(DEFAULT_PORT), 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment,

  database: {
    path: process.env.DATABASE_PATH || join(__dirname, '../../../data/ownprem.sqlite'),
  },

  paths: {
    data: process.env.DATA_PATH || join(__dirname, '../../../data'),
    apps: process.env.APPS_PATH || join(__dirname, '../../../data/apps'),
    appDefinitions: process.env.APP_DEFINITIONS_PATH || join(__dirname, '../../../app-definitions'),
    logs: process.env.LOGS_PATH || join(__dirname, '../../../logs'),
    caddyConfig: process.env.CADDY_CONFIG_PATH || (isDevelopment ? join(__dirname, '../../../caddy/Caddyfile') : '/etc/caddy/Caddyfile'),
  },

  caddy: {
    domain: process.env.CADDY_DOMAIN || 'ownprem.local',
    reloadCommand: process.env.CADDY_RELOAD_CMD || (isDevelopment ? '' : 'systemctl reload caddy'),
    devUiPort: parseInt(process.env.DEV_UI_PORT || '5173', 10),
  },

  secrets: {
    key: process.env.SECRETS_KEY || '',
  },

  jwt: {
    secret: process.env.JWT_SECRET || (isDevelopment ? 'dev-jwt-secret-change-in-production' : ''),
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
  },

  security: {
    bcryptRounds: DEFAULT_BCRYPT_ROUNDS,
    rateLimitWindow: RATE_LIMIT_WINDOW_MS,
    rateLimitMax: RATE_LIMIT_MAX_REQUESTS,
    authRateLimitMax: AUTH_RATE_LIMIT_MAX,
  },

  cors: {
    origin: process.env.CORS_ORIGIN || (isDevelopment ? '*' : ''),
  },
};

export type Config = typeof config;
