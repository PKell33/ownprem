/**
 * Privileged Helper Client
 *
 * Client library for communicating with the privileged helper service.
 * Used by the agent to perform operations that require root privileges.
 */

import { createConnection, Socket } from 'net';

const SOCKET_PATH = '/run/ownprem/helper.sock';
const TIMEOUT = 30000; // 30 second timeout

export interface HelperResponse {
  success: boolean;
  error?: string;
  output?: string;
}

class PrivilegedClient {
  private socket: Socket | null = null;
  private responseBuffer = '';
  private pendingResolve: ((response: HelperResponse) => void) | null = null;
  private pendingReject: ((error: Error) => void) | null = null;

  /**
   * Send a request to the privileged helper and wait for response.
   */
  async request(action: string, params: Record<string, unknown>): Promise<HelperResponse> {
    const request = { action, ...params };

    return new Promise((resolve, reject) => {
      const socket = createConnection(SOCKET_PATH);
      let buffer = '';
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          reject(new Error('Request timeout'));
        }
      }, TIMEOUT);

      socket.on('connect', () => {
        socket.write(JSON.stringify(request) + '\n');
      });

      socket.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            socket.end();
            try {
              resolve(JSON.parse(line));
            } catch {
              reject(new Error('Invalid response from helper'));
            }
          }
        }
      });

      socket.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(err);
        }
      });

      socket.on('close', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error('Connection closed unexpectedly'));
        }
      });
    });
  }

  /**
   * Create a system user for a service.
   */
  async createServiceUser(username: string, homeDir: string): Promise<HelperResponse> {
    return this.request('create_service_user', { username, homeDir });
  }

  /**
   * Create a directory with optional owner and mode.
   */
  async createDirectory(path: string, owner?: string, mode?: string): Promise<HelperResponse> {
    return this.request('create_directory', { path, owner, mode });
  }

  /**
   * Set ownership of a file or directory.
   */
  async setOwnership(path: string, owner: string, recursive = false): Promise<HelperResponse> {
    return this.request('set_ownership', { path, owner, recursive });
  }

  /**
   * Set permissions on a file or directory.
   */
  async setPermissions(path: string, mode: string): Promise<HelperResponse> {
    return this.request('set_permissions', { path, mode });
  }

  /**
   * Write content to a file.
   */
  async writeFile(path: string, content: string, owner?: string, mode?: string): Promise<HelperResponse> {
    return this.request('write_file', { path, content, owner, mode });
  }

  /**
   * Copy a file.
   */
  async copyFile(source: string, destination: string, owner?: string, mode?: string): Promise<HelperResponse> {
    return this.request('copy_file', { source, destination, owner, mode });
  }

  /**
   * Control a systemd service.
   */
  async systemctl(
    operation: 'start' | 'stop' | 'restart' | 'enable' | 'disable' | 'daemon-reload',
    service?: string
  ): Promise<HelperResponse> {
    return this.request('systemctl', { operation, service });
  }

  /**
   * Set a Linux capability on a binary.
   */
  async setCapability(path: string, capability: string): Promise<HelperResponse> {
    return this.request('set_capability', { path, capability });
  }

  /**
   * Run a command as a specific user.
   */
  async runAsUser(
    user: string,
    command: string,
    args: string[],
    env?: Record<string, string>,
    cwd?: string
  ): Promise<HelperResponse> {
    return this.request('run_as_user', { user, command, args, env, cwd });
  }

  /**
   * Mount network storage (NFS or CIFS).
   */
  async mount(
    mountType: 'nfs' | 'cifs',
    source: string,
    mountPoint: string,
    options?: string,
    credentials?: { username: string; password: string; domain?: string }
  ): Promise<HelperResponse> {
    return this.request('mount', { mountType, source, mountPoint, options, credentials });
  }

  /**
   * Unmount network storage.
   */
  async umount(mountPoint: string): Promise<HelperResponse> {
    return this.request('umount', { mountPoint });
  }

  /**
   * Install packages via apt-get.
   */
  async aptInstall(packages: string[]): Promise<HelperResponse> {
    return this.request('apt_install', { packages });
  }

  /**
   * Register a service for systemctl operations.
   * Must be called before systemctl can control the service.
   */
  async registerService(serviceName: string): Promise<HelperResponse> {
    return this.request('register_service', { serviceName });
  }

  /**
   * Unregister a service.
   * Called when uninstalling an app.
   */
  async unregisterService(serviceName: string): Promise<HelperResponse> {
    return this.request('unregister_service', { serviceName });
  }
}

export const privilegedClient = new PrivilegedClient();
