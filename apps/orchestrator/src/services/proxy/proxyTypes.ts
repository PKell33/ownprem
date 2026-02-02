/**
 * Type definitions for proxy management.
 * Shared across proxy-related modules.
 */

import { ProxyRouteRow, ServiceRouteRow } from '../../db/types.js';

// Re-export base types
export type { ProxyRouteRow, ServiceRouteRow };

export interface ProxyRoute {
  id: string;
  path: string;
  upstream: string;
  appName: string;
  serverName: string;
}

export interface ServiceRoute {
  id: string;
  serviceId: string;
  serviceName: string;
  routeType: 'http' | 'tcp';
  externalPath?: string;
  externalPort?: number;
  upstreamHost: string;
  upstreamPort: number;
  appName: string;
  serverName: string;
}

// Extended row type with JOIN fields for queries
export interface ServiceRouteRowWithJoins extends ServiceRouteRow {
  service_name: string;
  app_name: string;
  server_name: string;
}

export interface DeploymentWithManifest {
  id: string;
  server_id: string;
  app_name: string;
  status: string;
  host: string | null;
  manifest: string;
  server_name: string;
}

export interface CADeploymentRow {
  id: string;
  server_id: string;
  status: string;
  config: string;
  host: string | null;
  is_core: number;
}

// Port range for TCP service proxying
export const TCP_PORT_RANGE_START = 50000;
export const TCP_PORT_RANGE_END = 50100;
