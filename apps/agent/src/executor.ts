import { spawnSync, spawn, ChildProcess } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, chmodSync, readFileSync, statSync } from 'fs';
import { dirname, resolve, normalize } from 'path';
import type { CommandPayload, ConfigFile, LogRequestPayload, LogResult } from '@ownprem/shared';

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

// Valid app name pattern (alphanumeric, hyphen, underscore, dots)
const APP_NAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;

// Maximum log lines to return
const MAX_LOG_LINES = 1000;

export class Executor {
  private runningProcesses: Map<string, ChildProcess> = new Map();
  private appsDir: string;
  private dataDir: string;
  private allowedPaths: string[];

  constructor(appsDir: string = '/opt/ownprem/apps', dataDir?: string) {
    // Ensure appsDir is absolute
    this.appsDir = resolve(appsDir);
    // Default dataDir to /var/lib/ownprem in production, or appsDir in dev mode
    this.dataDir = dataDir ? resolve(dataDir) : (
      this.appsDir.includes('/opt/ownprem') ? '/var/lib/ownprem' : this.appsDir
    );
    mkdirSync(this.appsDir, { recursive: true });

    // Build allowed paths list (include appsDir and dataDir for dev mode)
    this.allowedPaths = [...ALLOWED_PATH_PREFIXES];
    if (!this.allowedPaths.some(p => this.appsDir.startsWith(p))) {
      // In dev mode, appsDir might be outside /opt/ownprem
      this.allowedPaths.push(this.appsDir + '/');
    }
    if (!this.allowedPaths.some(p => this.dataDir.startsWith(p))) {
      // In dev mode, dataDir might be outside standard paths
      this.allowedPaths.push(this.dataDir + '/');
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
    const appDir = `${this.appsDir}/${appName}`;
    const uninstallScript = `${appDir}/uninstall.sh`;
    if (existsSync(uninstallScript)) {
      await this.runScript(uninstallScript, {
        APP_NAME: appName,
        APP_DIR: appDir,
        DATA_DIR: `${this.dataDir}/${appName}`,
      });
    }

    // Clean up the app directory
    const { rmSync } = await import('fs');
    try {
      rmSync(appDir, { recursive: true, force: true });
      console.log(`Removed app directory: ${appDir}`);
    } catch (err) {
      console.error(`Failed to remove app directory: ${err}`);
    }
  }

  async getLogs(appName: string, options: LogRequestPayload = {}): Promise<Omit<LogResult, 'commandId'>> {
    // Validate app name to prevent injection
    if (!APP_NAME_PATTERN.test(appName)) {
      return {
        logs: [],
        source: 'file',
        hasMore: false,
        status: 'error',
        message: `Invalid app name: ${appName}`,
      };
    }

    const lines = Math.min(options.lines || 100, MAX_LOG_LINES);
    const source = options.source || 'auto';
    const serviceName = options.serviceName || appName;

    // Try journalctl first (for systemd services)
    if (source === 'auto' || source === 'journalctl') {
      const journalResult = await this.getJournalctlLogs(serviceName, lines, options.since, options.grep);
      // Check if we got actual logs (not just "-- No entries --")
      const hasRealLogs = journalResult.status === 'success' &&
        journalResult.logs.length > 0 &&
        !(journalResult.logs.length === 1 && journalResult.logs[0].includes('-- No entries --'));
      if (hasRealLogs) {
        return journalResult;
      }
      // If journalctl fails or returns no logs and we're on auto, try file
      if (source === 'journalctl') {
        return journalResult;
      }
    }

    // Fall back to file-based logs
    return this.getFileLogs(appName, lines, options.grep, options.logPath);
  }

  private async getJournalctlLogs(
    appName: string,
    lines: number,
    since?: string,
    grep?: string
  ): Promise<Omit<LogResult, 'commandId'>> {
    const args = ['--no-pager', '-u', appName, '-n', lines.toString(), '--output=short-iso'];

    if (since) {
      // Validate since format (ISO date or relative like "1h", "30m")
      if (/^\d{4}-\d{2}-\d{2}/.test(since) || /^\d+[smhd]$/.test(since)) {
        args.push('--since', since);
      }
    }

    try {
      const result = spawnSync('journalctl', args, {
        encoding: 'utf-8',
        timeout: 10000,
      });

      if (result.status !== 0) {
        // journalctl failed - might not be a systemd service
        return {
          logs: [],
          source: 'journalctl',
          hasMore: false,
          status: 'error',
          message: result.stderr || 'journalctl failed',
        };
      }

      let logLines = result.stdout.split('\n').filter(line => line.trim());

      // Apply grep filter if provided
      if (grep && logLines.length > 0) {
        const grepPattern = new RegExp(grep, 'i');
        logLines = logLines.filter(line => grepPattern.test(line));
      }

      return {
        logs: logLines,
        source: 'journalctl',
        hasMore: logLines.length >= lines,
        status: 'success',
      };
    } catch (err) {
      return {
        logs: [],
        source: 'journalctl',
        hasMore: false,
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to read journalctl logs',
      };
    }
  }

  private getFileLogs(
    appName: string,
    lines: number,
    grep?: string,
    customLogPath?: string
  ): Omit<LogResult, 'commandId'> {
    // Build list of paths to try
    const pathsToTry: string[] = [];
    const appDir = `${this.appsDir}/${appName}`;
    const appDataDir = `${this.dataDir}/${appName}`;

    // If custom log path is provided, expand variables and try it first
    if (customLogPath) {
      const expandedPath = customLogPath
        .replace(/\$\{appName\}/g, appName)
        .replace(/\$\{appDir\}/g, appDir)
        .replace(/\$\{dataDir\}/g, appDataDir);
      pathsToTry.push(expandedPath);
    }

    // Standard paths
    pathsToTry.push(`/var/log/ownprem/${appName}.log`);
    pathsToTry.push(`${appDir}/logs/${appName}.log`);

    // For bitcoin apps, also check common bitcoin log locations
    if (appName.startsWith('bitcoin')) {
      pathsToTry.push(`${appDataDir}/debug.log`);
      pathsToTry.push(`${appDir}/data/debug.log`);
    }

    // Try each path
    for (const logPath of pathsToTry) {
      if (existsSync(logPath)) {
        return this.readLogFile(logPath, lines, grep);
      }
    }

    return {
      logs: [],
      source: 'file',
      hasMore: false,
      status: 'error',
      message: `Log file not found. Tried: ${pathsToTry.join(', ')}`,
    };
  }

  private readLogFile(
    logPath: string,
    lines: number,
    grep?: string
  ): Omit<LogResult, 'commandId'> {
    try {
      // Validate path
      const normalizedPath = this.validatePath(logPath);

      // Read file (limit to last 5MB to prevent memory issues)
      const stats = statSync(normalizedPath);
      const maxBytes = 5 * 1024 * 1024;
      let content: string;

      if (stats.size > maxBytes) {
        // Read only the last 5MB of the file
        const fd = require('fs').openSync(normalizedPath, 'r');
        const buffer = Buffer.alloc(maxBytes);
        require('fs').readSync(fd, buffer, 0, maxBytes, stats.size - maxBytes);
        require('fs').closeSync(fd);
        content = buffer.toString('utf-8');
      } else {
        content = readFileSync(normalizedPath, 'utf-8');
      }

      let logLines = content.split('\n').filter(line => line.trim());

      // Apply grep filter if provided
      if (grep) {
        const grepPattern = new RegExp(grep, 'i');
        logLines = logLines.filter(line => grepPattern.test(line));
      }

      // Take last N lines
      const totalLines = logLines.length;
      logLines = logLines.slice(-lines);

      return {
        logs: logLines,
        source: 'file',
        hasMore: totalLines > lines,
        status: 'success',
      };
    } catch (err) {
      return {
        logs: [],
        source: 'file',
        hasMore: false,
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to read log file',
      };
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
          env: {
            ...process.env,
            APP_DIR: appDir,
            APP_NAME: service,
          },
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
      const stopScript = `${appDir}/stop.sh`;
      if (existsSync(stopScript)) {
        // Run stop.sh
        const result = spawnSync('bash', [stopScript], {
          cwd: appDir,
          stdio: 'pipe',
          env: {
            ...process.env,
            APP_DIR: appDir,
            APP_NAME: service,
          },
        });
        if (result.status !== 0) {
          console.error(`stop.sh failed: ${result.stderr?.toString()}`);
        }
      }
      // Also clean up tracked process
      const proc = this.runningProcesses.get(service);
      if (proc && proc.pid) {
        try {
          process.kill(-proc.pid, 'SIGTERM');
        } catch {
          try { process.kill(proc.pid, 'SIGTERM'); } catch { /* ignore */ }
        }
        this.runningProcesses.delete(service);
      }
      console.log(`Stopped ${service} in dev mode`);
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
