import type { Server, Deployment, AppManifest } from '../../api/client';

export interface ServerCardProps {
  server: Server;
  deployments?: Deployment[];
  apps?: AppManifest[];
  onClick?: () => void;
  onDelete?: () => void;
  onRegenerate?: () => void;
  onViewGuide?: () => void;
  onStartApp?: (deploymentId: string) => void;
  onStopApp?: (deploymentId: string) => void;
  onRestartApp?: (deploymentId: string) => void;
  onUninstallApp?: (deploymentId: string, appName: string) => void;
  canManage?: boolean;
  canOperate?: boolean;
}

export type ConfirmAction = {
  type: 'stop' | 'restart' | 'uninstall';
  deploymentId: string;
  appName: string;
};

export interface DeploymentItemProps {
  deployment: Deployment;
  app: AppManifest | undefined;
  canManage: boolean;
  canOperate: boolean;
  onAppClick: (deployment: Deployment, e: React.MouseEvent) => void;
  onStartApp?: (deploymentId: string) => void;
  onSetConfirmAction: (action: ConfirmAction) => void;
  onSetConnectionInfo: (deployment: Deployment) => void;
  onSetLogsDeployment: (data: { deployment: Deployment; appName: string }) => void;
  onSetEditConfigData: (data: { deployment: Deployment; app: AppManifest }) => void;
}

export interface MetricItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sparkline?: React.ReactNode;
}

export interface AppSelectButtonProps {
  app: AppManifest;
  onSelect: () => void;
}
