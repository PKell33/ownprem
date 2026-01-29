import { spawnSync, spawn, ChildProcess } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, chmodSync } from 'fs';
import { dirname, resolve, normalize } from 'path';
import type { CommandPayload, ConfigFile } from '@ownprem/shared';

// Allowed base directories for file operations
const ALLOWED_PATH_PREFIXES = [
  '/opt/ownprem/',
  '/etc/ownprem/',
  '/var/lib/ownprem/',
  '/var/log/ownprem/',
];

// Valid owner format: user or user:group (alphanumeric, underscore, hyphen)
const OWNER_PATTERN = /^[a-z_][a-z0-9_-]*(?::[a-z_][a-z0-9_-]*)?$/i;

// Valid file mode (octal)
const MODE_PATTERN = /^[0-7]{3,4}$/;

export class Executor {
  private runningProcesses: Map<string, ChildProcess> = new Map();
  private appsDir: string;
  private allowedPaths: string[];

  constructor(appsDir: string = '/opt/ownprem/apps') {
    // Ensure appsDir is absolute
    this.appsDir = resolve(appsDir);
    mkdirSync(this.appsDir, { recursive: true });

    // Build allowed paths list (include appsDir for dev mode)
    this.allowedPaths = [...ALLOWED_PATH_PREFIXES];
    if (!this.allowedPaths.some(p => this.appsDir.startsWith(p))) {
      // In dev mode, appsDir might be outside /opt/ownprem
      this.allowedPaths.push(this.appsDir + '/');
    }
  }

  /**
   * Validates that a path is within allowed directories to prevent path traversal
   */
  private validatePath(filePath: string): string {
    // Normalize and resolve the path
    const normalizedPath = normalize(resolve(filePath));

    // Check if path is within allowed directories
    const isAllowed = this.allowedPaths.some(prefix =>
      normalizedPath.startsWith(prefix) || normalizedPath === prefix.slice(0, -1)
    );

    if (!isAllowed) {
      throw new Error(`Path traversal attempt blocked: ${filePath} is outside allowed directories`);
    }

    // Check for path traversal attempts in the original path
    if (filePath.includes('..')) {
      throw new Error(`Path traversal attempt blocked: ${filePath} contains '..'`);
    }

    return normalizedPath;
  }

  /**
   * Validates owner string format to prevent command injection
   */
  private validateOwner(owner: string): string {
    if (!OWNER_PATTERN.test(owner)) {
      throw new Error(`Invalid owner format: ${owner}. Expected format: user or user:group`);
    }
    return owner;
  }

  /**
   * Validates file mode format
   */
  private validateMode(mode: string): string {
    if (!MODE_PATTERN.test(mode)) {
      throw new Error(`Invalid file mode: ${mode}. Expected octal format (e.g., 755)`);
    }
    return mode;
  }

  async install(appName: string, payload: CommandPayload): Promise<void> {
    const appDir = `${this.appsDir}/${appName}`;
    mkdirSync(appDir, { recursive: true });

    // Write config files
    if (payload.files) {
      await this.writeFiles(payload.files);
    }

    // Run install script
    const installScript = `${appDir}/install.sh`;
    if (existsSync(installScript)) {
      await this.runScript(installScript, {
        ...process.env,
        ...payload.env,
        APP_NAME: appName,
        APP_VERSION: payload.version || '',
        APP_DIR: appDir,
      });
    }
  }

  async configure(appName: string, files: ConfigFile[]): Promise<void> {
    // Write config files
    await this.writeFiles(files);

    // Run configure script if it exists
    const configureScript = `${this.appsDir}/${appName}/configure.sh`;
    if (existsSync(configureScript)) {
      await this.runScript(configureScript, {
        APP_NAME: appName,
        APP_DIR: `${this.appsDir}/${appName}`,
      });
    }
  }

  async uninstall(appName: string): Promise<void> {
    // Stop service first
    await this.systemctl('stop', appName).catch(() => {
      // Ignore errors if service doesn't exist
    });

    // Disable service
    await this.systemctl('disable', appName).catch(() => {
      // Ignore errors
    });

    // Run uninstall script if it exists
    const uninstallScript = `${this.appsDir}/${appName}/uninstall.sh`;
    if (existsSync(uninstallScript)) {
      await this.runScript(uninstallScript, {
        APP_NAME: appName,
        APP_DIR: `${this.appsDir}/${appName}`,
      });
    }
  }

  async systemctl(action: string, service: string): Promise<void> {
    // Validate action (whitelist)
    const allowedActions = ['start', 'stop', 'restart', 'enable', 'disable', 'status'];
    if (!allowedActions.includes(action)) {
      throw new Error(`Invalid systemctl action: ${action}`);
    }

    // Validate service name (alphanumeric, hyphen, underscore, dots)
    if (!/^[a-zA-Z0-9_.-]+$/.test(service)) {
      throw new Error(`Invalid service name: ${service}`);
    }

    // First try systemctl
    try {
      await this.runSystemctl(action, service);
      return;
    } catch (err) {
      // If systemctl fails, try dev mode fallback
      console.log(`systemctl failed, trying dev mode fallback for ${action} ${service}`);
    }

    // Dev mode fallback
    const appDir = `${this.appsDir}/${service}`;
    const startScript = `${appDir}/start.sh`;

    if (action === 'start') {
      if (existsSync(startScript)) {
        // Run start.sh in background
        const proc = spawn('bash', [startScript], {
          cwd: appDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true,
        });

        proc.stdout?.on('data', (data) => console.log(`[${service}] ${data.toString().trim()}`));
        proc.stderr?.on('data', (data) => console.error(`[${service}] ${data.toString().trim()}`));

        this.runningProcesses.set(service, proc);
        proc.unref();
        console.log(`Started ${service} in dev mode (pid: ${proc.pid})`);
      } else {
        throw new Error(`No start.sh found for ${service} in dev mode`);
      }
    } else if (action === 'stop') {
      const proc = this.runningProcesses.get(service);
      if (proc && proc.pid) {
        try {
          process.kill(-proc.pid, 'SIGTERM');
        } catch {
          process.kill(proc.pid, 'SIGTERM');
        }
        this.runningProcesses.delete(service);
        console.log(`Stopped ${service} in dev mode`);
      } else {
        console.log(`${service} not running in dev mode`);
      }
    } else if (action === 'restart') {
      await this.systemctl('stop', service);
      await this.systemctl('start', service);
    }
  }

  private runSystemctl(action: string, service: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('systemctl', [action, service], {
        stdio: 'inherit',
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`systemctl ${action} ${service} failed with code ${code}`));
        }
      });

      proc.on('error', reject);
    });
  }

  private async writeFiles(files: ConfigFile[]): Promise<void> {
    for (const file of files) {
      // Validate path to prevent path traversal attacks
      const safePath = this.validatePath(file.path);
      const dir = dirname(safePath);

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      writeFileSync(safePath, file.content);

      if (file.mode) {
        // Validate mode format
        const safeMode = this.validateMode(file.mode);
        chmodSync(safePath, parseInt(safeMode, 8));
      }

      if (file.owner) {
        try {
          // Validate owner format to prevent command injection
          const safeOwner = this.validateOwner(file.owner);
          // Use spawnSync with array arguments to prevent shell injection
          const result = spawnSync('chown', [safeOwner, safePath], { stdio: 'pipe' });
          if (result.status !== 0) {
            const stderr = result.stderr?.toString() || 'Unknown error';
            console.warn(`Failed to change owner of ${safePath}: ${stderr}`);
          }
        } catch (err) {
          console.warn(`Failed to change owner of ${safePath}: ${err}`);
        }
      }

      console.log(`Wrote file: ${safePath}`);
    }
  }

  private async runScript(script: string, env: Record<string, string | undefined>): Promise<void> {
    // Validate script path to prevent path traversal
    const safeScript = this.validatePath(script);

    // Verify the script exists and is a file
    if (!existsSync(safeScript)) {
      throw new Error(`Script not found: ${safeScript}`);
    }

    return new Promise((resolve, reject) => {
      console.log(`Running script: ${safeScript}`);

      const proc = spawn('bash', [safeScript], {
        stdio: 'inherit',
        env: env as NodeJS.ProcessEnv,
      });

      proc.on('close', (code) => {
        if (code === 0) {
          console.log(`Script completed: ${safeScript}`);
          resolve();
        } else {
          reject(new Error(`Script ${safeScript} failed with code ${code}`));
        }
      });

      proc.on('error', reject);
    });
  }
}
