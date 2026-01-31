/**
 * Privileged Helper - Command Executor
 *
 * Executes validated privileged operations.
 * All requests should be validated BEFORE reaching this module.
 */

import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync, copyFileSync, chmodSync, chownSync, existsSync, mkdtempSync, unlinkSync, rmdirSync } from 'fs';
import { tmpdir } from 'os';
import type {
  HelperRequest,
  HelperResponse,
  CreateServiceUserRequest,
  CreateDirectoryRequest,
  SetOwnershipRequest,
  SetPermissionsRequest,
  WriteFileRequest,
  CopyFileRequest,
  SystemctlRequest,
  SetCapabilityRequest,
  RunAsUserRequest,
  MountRequest,
  UmountRequest,
  AptInstallRequest,
  RegisterServiceRequest,
  UnregisterServiceRequest,
} from './types.js';

// Directory where registered services are tracked
const REGISTERED_SERVICES_DIR = '/var/lib/ownprem/services';

function getUserIds(owner: string): { uid: number; gid: number } | null {
  const [user, group] = owner.includes(':') ? owner.split(':') : [owner, owner];

  try {
    const userResult = spawnSync('id', ['-u', user], { encoding: 'utf-8' });
    const groupResult = spawnSync('id', ['-g', group || user], { encoding: 'utf-8' });

    if (userResult.status !== 0 || groupResult.status !== 0) {
      return null;
    }

    return {
      uid: parseInt(userResult.stdout.trim(), 10),
      gid: parseInt(groupResult.stdout.trim(), 10),
    };
  } catch {
    return null;
  }
}

function createServiceUser(req: CreateServiceUserRequest): HelperResponse {
  // Check if user already exists
  const checkResult = spawnSync('id', [req.username], { encoding: 'utf-8' });
  if (checkResult.status === 0) {
    return { success: true, output: `User ${req.username} already exists` };
  }

  const result = spawnSync('useradd', [
    '--system',
    '--home-dir', req.homeDir,
    '--shell', '/usr/sbin/nologin',
    '--create-home',
    req.username,
  ], { encoding: 'utf-8' });

  if (result.status !== 0) {
    return { success: false, error: `Failed to create user: ${result.stderr}` };
  }

  return { success: true, output: `Created user ${req.username}` };
}

function createDirectory(req: CreateDirectoryRequest): HelperResponse {
  try {
    mkdirSync(req.path, { recursive: true, mode: req.mode ? parseInt(req.mode, 8) : 0o755 });

    if (req.owner) {
      const ids = getUserIds(req.owner);
      if (ids) {
        chownSync(req.path, ids.uid, ids.gid);
      } else {
        return { success: false, error: `Unknown owner: ${req.owner}` };
      }
    }

    return { success: true, output: `Created directory ${req.path}` };
  } catch (err) {
    return { success: false, error: `Failed to create directory: ${err}` };
  }
}

function setOwnership(req: SetOwnershipRequest): HelperResponse {
  const ids = getUserIds(req.owner);
  if (!ids) {
    return { success: false, error: `Unknown owner: ${req.owner}` };
  }

  try {
    if (req.recursive) {
      const result = spawnSync('chown', ['-R', req.owner, req.path], { encoding: 'utf-8' });
      if (result.status !== 0) {
        return { success: false, error: `Failed to set ownership: ${result.stderr}` };
      }
    } else {
      chownSync(req.path, ids.uid, ids.gid);
    }
    return { success: true, output: `Set ownership of ${req.path} to ${req.owner}` };
  } catch (err) {
    return { success: false, error: `Failed to set ownership: ${err}` };
  }
}

function setPermissions(req: SetPermissionsRequest): HelperResponse {
  try {
    chmodSync(req.path, parseInt(req.mode, 8));
    return { success: true, output: `Set permissions of ${req.path} to ${req.mode}` };
  } catch (err) {
    return { success: false, error: `Failed to set permissions: ${err}` };
  }
}

function writeFile(req: WriteFileRequest): HelperResponse {
  try {
    // Ensure parent directory exists
    const parentDir = req.path.substring(0, req.path.lastIndexOf('/'));
    if (parentDir && !existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    writeFileSync(req.path, req.content, { mode: req.mode ? parseInt(req.mode, 8) : 0o644 });

    if (req.owner) {
      const ids = getUserIds(req.owner);
      if (ids) {
        chownSync(req.path, ids.uid, ids.gid);
      } else {
        return { success: false, error: `Unknown owner: ${req.owner}` };
      }
    }

    return { success: true, output: `Wrote file ${req.path}` };
  } catch (err) {
    return { success: false, error: `Failed to write file: ${err}` };
  }
}

function copyFile(req: CopyFileRequest): HelperResponse {
  try {
    // Ensure parent directory exists
    const parentDir = req.destination.substring(0, req.destination.lastIndexOf('/'));
    if (parentDir && !existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    copyFileSync(req.source, req.destination);

    if (req.mode) {
      chmodSync(req.destination, parseInt(req.mode, 8));
    }

    if (req.owner) {
      const ids = getUserIds(req.owner);
      if (ids) {
        chownSync(req.destination, ids.uid, ids.gid);
      } else {
        return { success: false, error: `Unknown owner: ${req.owner}` };
      }
    }

    return { success: true, output: `Copied ${req.source} to ${req.destination}` };
  } catch (err) {
    return { success: false, error: `Failed to copy file: ${err}` };
  }
}

function systemctl(req: SystemctlRequest): HelperResponse {
  const args = req.operation === 'daemon-reload'
    ? ['daemon-reload']
    : [req.operation, req.service!];

  const result = spawnSync('systemctl', args, { encoding: 'utf-8' });

  if (result.status !== 0) {
    return { success: false, error: `systemctl failed: ${result.stderr}` };
  }

  return { success: true, output: result.stdout || `systemctl ${args.join(' ')} completed` };
}

function setCapability(req: SetCapabilityRequest): HelperResponse {
  const result = spawnSync('setcap', [req.capability, req.path], { encoding: 'utf-8' });

  if (result.status !== 0) {
    return { success: false, error: `setcap failed: ${result.stderr}` };
  }

  return { success: true, output: `Set capability ${req.capability} on ${req.path}` };
}

function runAsUser(req: RunAsUserRequest): HelperResponse {
  // Filter out undefined env values
  const baseEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      baseEnv[key] = value;
    }
  }
  const env: Record<string, string> = {
    ...baseEnv,
    ...req.env,
  };

  const args = ['-u', req.user];

  // Add environment variables
  if (req.env) {
    for (const [key, value] of Object.entries(req.env)) {
      args.push(`${key}=${value}`);
    }
  }

  args.push(req.command, ...req.args);

  const result = spawnSync('sudo', args, {
    encoding: 'utf-8',
    cwd: req.cwd,
    env,
    timeout: 300000, // 5 minute timeout
  });

  if (result.status !== 0) {
    return {
      success: false,
      error: `Command failed with code ${result.status}: ${result.stderr}`,
      output: result.stdout,
    };
  }

  return { success: true, output: result.stdout };
}

function mount(req: MountRequest): HelperResponse {
  const { mountType, source, mountPoint, options, credentials } = req;

  // Create mount point if it doesn't exist
  if (!existsSync(mountPoint)) {
    try {
      mkdirSync(mountPoint, { recursive: true });
    } catch (err) {
      return { success: false, error: `Failed to create mount point: ${err}` };
    }
  }

  // Check if already mounted
  const findmntResult = spawnSync('findmnt', ['-n', mountPoint], {
    encoding: 'utf-8',
    timeout: 5000,
  });
  if (findmntResult.status === 0 && findmntResult.stdout.trim()) {
    return { success: true, output: `Already mounted: ${mountPoint}` };
  }

  // Build mount command args
  const args: string[] = ['-t', mountType];

  if (mountType === 'cifs' && credentials) {
    // Create a secure temporary directory with restricted permissions
    // Using mkdtempSync ensures unpredictable directory name
    let credDir: string | null = null;
    let credFile: string | null = null;

    try {
      // Create temp directory in /run (tmpfs, not persisted to disk)
      // Fall back to /tmp if /run is not available
      const tempBase = existsSync('/run') ? '/run' : tmpdir();
      credDir = mkdtempSync(`${tempBase}/ownprem-mount-`);
      credFile = `${credDir}/credentials`;

      // Write credentials with strict permissions (owner read only)
      let credContent = `username=${credentials.username}\npassword=${credentials.password}\n`;
      if (credentials.domain) {
        credContent += `domain=${credentials.domain}\n`;
      }
      writeFileSync(credFile, credContent, { mode: 0o400 });

      const credOptions = `credentials=${credFile}`;
      const allOptions = options ? `${credOptions},${options}` : credOptions;
      args.push('-o', allOptions);
      args.push(source, mountPoint);

      const result = spawnSync('mount', args, {
        encoding: 'utf-8',
        timeout: 30000,
      });

      if (result.status !== 0) {
        return { success: false, error: `Mount failed: ${result.stderr || 'Unknown error'}` };
      }

      return { success: true, output: `Mounted ${source} at ${mountPoint}` };
    } catch (err) {
      return { success: false, error: `Mount failed: ${err}` };
    } finally {
      // Always clean up credentials - this runs even if mount throws
      if (credFile) {
        try {
          // Overwrite file content before deletion to prevent recovery
          writeFileSync(credFile, '0'.repeat(256), { mode: 0o400 });
          unlinkSync(credFile);
        } catch {
          // Log but don't fail - credential cleanup is best effort
        }
      }
      if (credDir) {
        try {
          rmdirSync(credDir);
        } catch {
          // Directory removal is best effort
        }
      }
    }
  } else {
    // NFS or CIFS without credentials
    if (options) {
      args.push('-o', options);
    }
    args.push(source, mountPoint);

    const result = spawnSync('mount', args, {
      encoding: 'utf-8',
      timeout: 30000,
    });

    if (result.status !== 0) {
      return { success: false, error: `Mount failed: ${result.stderr || 'Unknown error'}` };
    }

    return { success: true, output: `Mounted ${source} at ${mountPoint}` };
  }
}

function umount(req: UmountRequest): HelperResponse {
  const { mountPoint } = req;

  // Check if mounted
  const findmntResult = spawnSync('findmnt', ['-n', mountPoint], {
    encoding: 'utf-8',
    timeout: 5000,
  });

  if (findmntResult.status !== 0 || !findmntResult.stdout.trim()) {
    return { success: true, output: `Not mounted: ${mountPoint}` };
  }

  const result = spawnSync('umount', [mountPoint], {
    encoding: 'utf-8',
    timeout: 30000,
  });

  if (result.status !== 0) {
    return { success: false, error: `Unmount failed: ${result.stderr || 'Unknown error'}` };
  }

  return { success: true, output: `Unmounted ${mountPoint}` };
}

function aptInstall(req: AptInstallRequest): HelperResponse {
  const { packages } = req;

  const result = spawnSync('apt-get', ['install', '-y', ...packages], {
    encoding: 'utf-8',
    timeout: 300000, // 5 minute timeout
    env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' },
  });

  if (result.status !== 0) {
    return { success: false, error: `apt-get install failed: ${result.stderr}` };
  }

  return { success: true, output: `Installed packages: ${packages.join(', ')}` };
}

function registerService(req: RegisterServiceRequest): HelperResponse {
  const { serviceName } = req;

  try {
    // Ensure the services directory exists
    if (!existsSync(REGISTERED_SERVICES_DIR)) {
      mkdirSync(REGISTERED_SERVICES_DIR, { recursive: true, mode: 0o755 });
    }

    // Create registration file with timestamp
    const registrationFile = `${REGISTERED_SERVICES_DIR}/${serviceName}`;
    const registrationData = JSON.stringify({
      serviceName,
      registeredAt: new Date().toISOString(),
    });
    writeFileSync(registrationFile, registrationData, { mode: 0o644 });

    return { success: true, output: `Registered service: ${serviceName}` };
  } catch (err) {
    return { success: false, error: `Failed to register service: ${err}` };
  }
}

function unregisterService(req: UnregisterServiceRequest): HelperResponse {
  const { serviceName } = req;
  const registrationFile = `${REGISTERED_SERVICES_DIR}/${serviceName}`;

  try {
    if (existsSync(registrationFile)) {
      const { unlinkSync } = require('fs');
      unlinkSync(registrationFile);
    }
    return { success: true, output: `Unregistered service: ${serviceName}` };
  } catch (err) {
    return { success: false, error: `Failed to unregister service: ${err}` };
  }
}

export function executeRequest(request: HelperRequest): HelperResponse {
  switch (request.action) {
    case 'create_service_user':
      return createServiceUser(request);
    case 'create_directory':
      return createDirectory(request);
    case 'set_ownership':
      return setOwnership(request);
    case 'set_permissions':
      return setPermissions(request);
    case 'write_file':
      return writeFile(request);
    case 'copy_file':
      return copyFile(request);
    case 'systemctl':
      return systemctl(request);
    case 'set_capability':
      return setCapability(request);
    case 'run_as_user':
      return runAsUser(request);
    case 'mount':
      return mount(request);
    case 'umount':
      return umount(request);
    case 'apt_install':
      return aptInstall(request);
    case 'register_service':
      return registerService(request);
    case 'unregister_service':
      return unregisterService(request);
    default:
      return { success: false, error: `Unknown action: ${(request as any).action}` };
  }
}
