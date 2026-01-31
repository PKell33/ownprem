/**
 * Status value constants.
 * Runtime values that mirror the TypeScript types for safe comparisons.
 * Named with "Values" suffix to avoid conflicts with type definitions.
 */

// Deployment status values
export const DeploymentStatusValues = {
  PENDING: 'pending',
  INSTALLING: 'installing',
  CONFIGURING: 'configuring',
  RUNNING: 'running',
  STOPPED: 'stopped',
  ERROR: 'error',
  UPDATING: 'updating',
  UNINSTALLING: 'uninstalling',
} as const;

// Transient deployment states (operations in progress)
export const TRANSIENT_DEPLOYMENT_STATES = [
  DeploymentStatusValues.INSTALLING,
  DeploymentStatusValues.CONFIGURING,
  DeploymentStatusValues.UNINSTALLING,
  DeploymentStatusValues.UPDATING,
] as const;

// Agent/Server status values
export const AgentStatusValues = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  ERROR: 'error',
} as const;

// Mount status values
export const MountStatusValues = {
  PENDING: 'pending',
  MOUNTING: 'mounting',
  MOUNTED: 'mounted',
  UNMOUNTED: 'unmounted',
  ERROR: 'error',
} as const;

// Command result status values
export const CommandStatusValues = {
  SUCCESS: 'success',
  ERROR: 'error',
  PENDING: 'pending',
  TIMEOUT: 'timeout',
} as const;

// App status values (from agent status reports)
export const AppStatusValues = {
  RUNNING: 'running',
  STOPPED: 'stopped',
  ERROR: 'error',
  NOT_INSTALLED: 'not-installed',
} as const;
