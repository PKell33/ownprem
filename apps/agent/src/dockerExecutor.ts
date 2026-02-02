import { execSync, spawn } from 'child_process';
import { mkdir, writeFile, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import logger from './lib/logger.js';

const DOCKER_BASE_DIR = process.env.DOCKER_BASE_DIR || '/var/lib/ownprem/docker';

export interface ContainerStatus {
  name: string;
  service: string;
  state: string;
  status: string;
  health?: string;
}

export interface DockerInfo {
  available: boolean;
  version?: string;
  error?: string;
}

export interface DeployResult {
  success: boolean;
  containers: string[];
  error?: string;
}

export class DockerExecutor {
  /**
   * Check if Docker is available and get version info
   */
  async checkDocker(): Promise<DockerInfo> {
    try {
      const version = execSync('docker --version', { encoding: 'utf8' }).trim();
      // Also verify Docker daemon is running
      execSync('docker info', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      return {
        available: true,
        version: version.replace('Docker version ', '').split(',')[0],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        available: false,
        error: message.includes('Cannot connect')
          ? 'Docker daemon is not running'
          : message.includes('not found')
          ? 'Docker is not installed'
          : message,
      };
    }
  }

  /**
   * Deploy an app using docker compose
   */
  async deploy(composeYaml: string, appId: string): Promise<DeployResult> {
    const appDir = path.join(DOCKER_BASE_DIR, appId);
    const composeFile = path.join(appDir, 'docker-compose.yml');

    try {
      // Create app directory
      await mkdir(appDir, { recursive: true });

      // Write compose file
      await writeFile(composeFile, composeYaml, 'utf8');
      logger.info({ appId, composeFile }, 'Wrote docker-compose.yml');

      // Pull images first
      logger.info({ appId }, 'Pulling Docker images...');
      await this.execCompose(appId, ['pull']);

      // Start containers
      logger.info({ appId }, 'Starting containers...');
      await this.execCompose(appId, ['up', '-d']);

      // Get container names
      const containers = await this.getContainerNames(appId);

      logger.info({ appId, containers }, 'Deployment complete');
      return { success: true, containers };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ appId, error }, 'Deployment failed');
      return { success: false, containers: [], error };
    }
  }

  /**
   * Start a stopped app
   */
  async start(appId: string): Promise<void> {
    logger.info({ appId }, 'Starting app');
    await this.execCompose(appId, ['start']);
  }

  /**
   * Stop a running app (keeps containers)
   */
  async stop(appId: string): Promise<void> {
    logger.info({ appId }, 'Stopping app');
    await this.execCompose(appId, ['stop']);
  }

  /**
   * Remove an app completely (containers + volumes)
   */
  async remove(appId: string): Promise<void> {
    const appDir = path.join(DOCKER_BASE_DIR, appId);

    logger.info({ appId }, 'Removing app');

    // Stop and remove containers, networks, volumes
    try {
      await this.execCompose(appId, ['down', '-v', '--remove-orphans']);
    } catch {
      // Ignore errors if compose file doesn't exist
    }

    // Remove app directory
    if (existsSync(appDir)) {
      await rm(appDir, { recursive: true });
    }

    logger.info({ appId }, 'App removed');
  }

  /**
   * Get logs from all containers in an app
   */
  async logs(appId: string, lines: number = 100, follow: boolean = false): Promise<string> {
    const args = ['logs', `--tail=${lines}`];
    if (follow) {
      args.push('-f');
    }

    try {
      const output = await this.execCompose(appId, args);
      return output;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return `Error fetching logs: ${error}`;
    }
  }

  /**
   * Get status of all containers in an app
   */
  async status(appId: string): Promise<ContainerStatus[]> {
    try {
      const output = await this.execCompose(appId, ['ps', '--format', 'json']);

      // docker compose ps --format json outputs one JSON object per line
      const lines = output.trim().split('\n').filter(Boolean);
      const containers: ContainerStatus[] = [];

      for (const line of lines) {
        try {
          const container = JSON.parse(line);
          containers.push({
            name: container.Name || container.name,
            service: container.Service || container.service,
            state: container.State || container.state,
            status: container.Status || container.status,
            health: container.Health || container.health,
          });
        } catch {
          // Skip unparseable lines
        }
      }

      return containers;
    } catch {
      return [];
    }
  }

  /**
   * Restart all containers in an app
   */
  async restart(appId: string): Promise<void> {
    logger.info({ appId }, 'Restarting app');
    await this.execCompose(appId, ['restart']);
  }

  /**
   * List all OwnPrem-managed apps with their status
   */
  async listApps(): Promise<Array<{ appId: string; status: ContainerStatus[] }>> {
    const apps: Array<{ appId: string; status: ContainerStatus[] }> = [];

    if (!existsSync(DOCKER_BASE_DIR)) {
      return apps;
    }

    const { readdirSync } = await import('fs');
    const dirs = readdirSync(DOCKER_BASE_DIR, { withFileTypes: true });

    for (const dir of dirs) {
      if (dir.isDirectory()) {
        const composeFile = path.join(DOCKER_BASE_DIR, dir.name, 'docker-compose.yml');
        if (existsSync(composeFile)) {
          const status = await this.status(dir.name);
          apps.push({ appId: dir.name, status });
        }
      }
    }

    return apps;
  }

  /**
   * Execute a docker compose command for an app
   */
  private async execCompose(appId: string, args: string[]): Promise<string> {
    const composeFile = path.join(DOCKER_BASE_DIR, appId, 'docker-compose.yml');

    if (!existsSync(composeFile)) {
      throw new Error(`Compose file not found for app: ${appId}`);
    }

    return new Promise((resolve, reject) => {
      const fullArgs = ['compose', '-f', composeFile, ...args];
      logger.debug({ cmd: 'docker', args: fullArgs }, 'Executing docker compose');

      const proc = spawn('docker', fullArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout || stderr); // Some docker commands output to stderr
        } else {
          reject(new Error(stderr || stdout || `Exit code: ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Get container names for an app
   */
  private async getContainerNames(appId: string): Promise<string[]> {
    const status = await this.status(appId);
    return status.map(c => c.name);
  }

  /**
   * Get the compose file content for an app (for debugging)
   */
  async getComposeFile(appId: string): Promise<string | null> {
    const composeFile = path.join(DOCKER_BASE_DIR, appId, 'docker-compose.yml');

    if (!existsSync(composeFile)) {
      return null;
    }

    return readFile(composeFile, 'utf8');
  }
}

// Export singleton instance
export const dockerExecutor = new DockerExecutor();
