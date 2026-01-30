/**
 * Privileged Helper - Type Definitions
 *
 * Defines the allowed operations and their parameters.
 * Each operation has strict validation rules.
 */

export type HelperAction =
  | 'create_service_user'
  | 'create_directory'
  | 'set_ownership'
  | 'set_permissions'
  | 'write_file'
  | 'copy_file'
  | 'systemctl'
  | 'set_capability'
  | 'run_as_user'
  | 'mount'
  | 'umount'
  | 'apt_install';

export interface CreateServiceUserRequest {
  action: 'create_service_user';
  username: string;
  homeDir: string;
}

export interface CreateDirectoryRequest {
  action: 'create_directory';
  path: string;
  owner?: string;
  mode?: string;
}

export interface SetOwnershipRequest {
  action: 'set_ownership';
  path: string;
  owner: string;
  recursive?: boolean;
}

export interface SetPermissionsRequest {
  action: 'set_permissions';
  path: string;
  mode: string;
}

export interface WriteFileRequest {
  action: 'write_file';
  path: string;
  content: string;
  owner?: string;
  mode?: string;
}

export interface CopyFileRequest {
  action: 'copy_file';
  source: string;
  destination: string;
  owner?: string;
  mode?: string;
}

export interface SystemctlRequest {
  action: 'systemctl';
  operation: 'start' | 'stop' | 'restart' | 'enable' | 'disable' | 'daemon-reload';
  service?: string;
}

export interface SetCapabilityRequest {
  action: 'set_capability';
  path: string;
  capability: string;
}

export interface RunAsUserRequest {
  action: 'run_as_user';
  user: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface MountRequest {
  action: 'mount';
  mountType: 'nfs' | 'cifs';
  source: string;
  mountPoint: string;
  options?: string;
  credentials?: {
    username: string;
    password: string;
    domain?: string;
  };
}

export interface UmountRequest {
  action: 'umount';
  mountPoint: string;
}

export interface AptInstallRequest {
  action: 'apt_install';
  packages: string[];
}

export type HelperRequest =
  | CreateServiceUserRequest
  | CreateDirectoryRequest
  | SetOwnershipRequest
  | SetPermissionsRequest
  | WriteFileRequest
  | CopyFileRequest
  | SystemctlRequest
  | SetCapabilityRequest
  | RunAsUserRequest
  | MountRequest
  | UmountRequest
  | AptInstallRequest;

export interface HelperResponse {
  success: boolean;
  error?: string;
  output?: string;
}
