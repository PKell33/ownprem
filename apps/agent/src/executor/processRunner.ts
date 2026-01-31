/**
 * Process spawning utility with resource limits.
 * Provides consistent process management with optional limits for memory, CPU time, etc.
 */

import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import logger from '../lib/logger.js';

const processLogger = logger.child({ component: 'processRunner' });

/**
 * Resource limits for spawned processes.
 * Values are in the units expected by ulimit/prlimit.
 */
export interface ResourceLimits {
  /** Maximum virtual memory in bytes (RLIMIT_AS). Default: 512MB */
  maxMemory?: number;
  /** Maximum CPU time in seconds (RLIMIT_CPU). Default: 600 (10 minutes) */
  maxCpuTime?: number;
  /** Maximum number of open file descriptors (RLIMIT_NOFILE). Default: 1024 */
  maxOpenFiles?: number;
  /** Maximum number of processes/threads (RLIMIT_NPROC). Default: 128 */
  maxProcesses?: number;
  /** Maximum file size in bytes (RLIMIT_FSIZE). Default: 1GB */
  maxFileSize?: number;
}

/** Default resource limits for script execution */
export const DEFAULT_SCRIPT_LIMITS: ResourceLimits = {
  maxMemory: 512 * 1024 * 1024, // 512MB
  maxCpuTime: 600, // 10 minutes
  maxOpenFiles: 1024,
  maxProcesses: 128,
  maxFileSize: 1024 * 1024 * 1024, // 1GB
};

/** More permissive limits for installation scripts */
export const INSTALL_SCRIPT_LIMITS: ResourceLimits = {
  maxMemory: 2 * 1024 * 1024 * 1024, // 2GB (compiling may need more)
  maxCpuTime: 1800, // 30 minutes
  maxOpenFiles: 4096,
  maxProcesses: 256,
  maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB
};

/** Minimal limits for quick utility scripts */
export const UTILITY_SCRIPT_LIMITS: ResourceLimits = {
  maxMemory: 128 * 1024 * 1024, // 128MB
  maxCpuTime: 60, // 1 minute
  maxOpenFiles: 256,
  maxProcesses: 32,
  maxFileSize: 100 * 1024 * 1024, // 100MB
};

/**
 * Build ulimit commands to set resource limits.
 * Returns a shell command prefix that sets limits before running the actual command.
 */
function buildLimitPrefix(limits: ResourceLimits): string {
  const parts: string[] = [];

  // -v: virtual memory (in KB for ulimit)
  if (limits.maxMemory !== undefined) {
    const memoryKb = Math.floor(limits.maxMemory / 1024);
    parts.push(`ulimit -v ${memoryKb}`);
  }

  // -t: CPU time in seconds
  if (limits.maxCpuTime !== undefined) {
    parts.push(`ulimit -t ${limits.maxCpuTime}`);
  }

  // -n: number of open files
  if (limits.maxOpenFiles !== undefined) {
    parts.push(`ulimit -n ${limits.maxOpenFiles}`);
  }

  // -u: number of processes
  if (limits.maxProcesses !== undefined) {
    parts.push(`ulimit -u ${limits.maxProcesses}`);
  }

  // -f: file size (in 512-byte blocks for ulimit)
  if (limits.maxFileSize !== undefined) {
    const fileSizeBlocks = Math.floor(limits.maxFileSize / 512);
    parts.push(`ulimit -f ${fileSizeBlocks}`);
  }

  return parts.join(' && ');
}

export interface SpawnWithLimitsOptions extends Omit<SpawnOptions, 'shell'> {
  /** Resource limits to apply */
  limits?: ResourceLimits;
  /** Whether to create a new process group (for killing all children) */
  detached?: boolean;
}

/**
 * Spawn a process with optional resource limits.
 * Uses a shell wrapper to set ulimit before executing the command.
 *
 * @param command - Command to execute (script path or executable)
 * @param args - Arguments to pass to the command
 * @param options - Spawn options including resource limits
 * @returns ChildProcess instance
 */
export function spawnWithLimits(
  command: string,
  args: string[] = [],
  options: SpawnWithLimitsOptions = {}
): ChildProcess {
  const { limits, ...spawnOptions } = options;

  // If no limits specified, use regular spawn
  if (!limits) {
    return spawn(command, args, spawnOptions);
  }

  // Build the full command with ulimit prefix
  const limitPrefix = buildLimitPrefix(limits);
  const quotedArgs = args.map(arg => `'${arg.replace(/'/g, "'\\''")}'`).join(' ');
  const fullCommand = limitPrefix
    ? `${limitPrefix} && exec '${command}' ${quotedArgs}`
    : `exec '${command}' ${quotedArgs}`;

  processLogger.debug({
    command,
    args,
    limits,
  }, 'Spawning process with resource limits');

  // Use bash -c to execute the command with limits
  return spawn('bash', ['-c', fullCommand], {
    ...spawnOptions,
    shell: false, // We're already using bash
  });
}

/**
 * Spawn a bash script with resource limits.
 * Convenience wrapper for running shell scripts.
 *
 * @param scriptPath - Path to the script
 * @param env - Environment variables
 * @param limits - Resource limits (defaults to DEFAULT_SCRIPT_LIMITS)
 * @param detached - Create new process group (default: true)
 * @returns ChildProcess instance
 */
export function spawnScript(
  scriptPath: string,
  env?: Record<string, string | undefined>,
  limits: ResourceLimits = DEFAULT_SCRIPT_LIMITS,
  detached: boolean = true
): ChildProcess {
  // Build the full command with ulimit prefix
  const limitPrefix = buildLimitPrefix(limits);
  const fullCommand = limitPrefix
    ? `${limitPrefix} && exec bash '${scriptPath}'`
    : `exec bash '${scriptPath}'`;

  processLogger.debug({
    scriptPath,
    limits,
    detached,
  }, 'Spawning script with resource limits');

  return spawn('bash', ['-c', fullCommand], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: env as NodeJS.ProcessEnv,
    detached, // Creates new process group with PGID = PID
  });
}

/**
 * Kill a process group with escalating signals (SIGTERM → SIGKILL).
 * Waits for confirmation that the process is dead.
 *
 * @param pid - Process ID (will kill process group -pid)
 * @param gracePeriodMs - Time to wait for graceful shutdown before SIGKILL (default: 5000)
 * @returns Promise that resolves when process is confirmed dead
 */
export async function killProcessGroup(pid: number, gracePeriodMs: number = 5000): Promise<void> {
  // Check if process is alive
  try {
    process.kill(pid, 0);
  } catch {
    // Already dead
    return;
  }

  // Try to kill process group (negative PID)
  try {
    process.kill(-pid, 'SIGTERM');
    processLogger.debug({ pid }, 'Sent SIGTERM to process group');
  } catch {
    // Process group might not exist, try individual process
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      return; // Already dead
    }
  }

  // Wait for graceful shutdown
  const checkIntervalMs = 100;
  const maxChecks = Math.floor(gracePeriodMs / checkIntervalMs);

  for (let i = 0; i < maxChecks; i++) {
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    try {
      process.kill(pid, 0);
      // Still alive, continue waiting
    } catch {
      // Dead, good
      processLogger.debug({ pid }, 'Process terminated gracefully');
      return;
    }
  }

  // Force kill with SIGKILL
  processLogger.warn({ pid }, 'Process did not respond to SIGTERM, sending SIGKILL');
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      return; // Already dead
    }
  }

  // Brief wait for SIGKILL to take effect
  await new Promise(resolve => setTimeout(resolve, 500));
}
