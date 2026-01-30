import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, copyFileSync } from 'fs';
import { join, basename } from 'path';
import { getDb, closeDb, initDb } from '../db/index.js';
import { config } from '../config.js';
import logger from '../lib/logger.js';
import { auditService } from './auditService.js';

export interface BackupResult {
  path: string;
  filename: string;
  size: number;
  timestamp: Date;
  checksum: string;
}

export interface RestoreResult {
  success: boolean;
  tablesRestored: string[];
  warnings: string[];
  backupPath: string;
}

export interface BackupInfo {
  filename: string;
  path: string;
  size: number;
  createdAt: Date;
  checksum?: string;
}

/**
 * BackupService handles SQLite database backup and restore operations.
 * Uses VACUUM INTO for consistent snapshots without locking.
 */
class BackupService {
  private backupPath: string;

  constructor() {
    this.backupPath = config.paths.backups;
  }

  /**
   * Ensure the backup directory exists.
   */
  private ensureBackupDir(): void {
    if (!existsSync(this.backupPath)) {
      mkdirSync(this.backupPath, { recursive: true });
      logger.info({ path: this.backupPath }, 'Created backup directory');
    }
  }

  /**
   * Generate a backup filename with timestamp.
   */
  private generateBackupFilename(): string {
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[:-]/g, '')
      .replace('T', '-')
      .replace(/\.\d{3}Z$/, '');
    return `ownprem-backup-${timestamp}.sqlite`;
  }

  /**
   * Calculate SHA256 checksum of a file.
   */
  private async calculateChecksum(filePath: string): Promise<string> {
    const { createReadStream } = await import('fs');
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Create a database backup using SQLite VACUUM INTO.
   * This creates a consistent snapshot without locking the database.
   */
  async createBackup(outputPath?: string): Promise<BackupResult> {
    this.ensureBackupDir();

    const filename = this.generateBackupFilename();
    const backupFilePath = outputPath || join(this.backupPath, filename);

    const db = getDb();

    try {
      // VACUUM INTO creates a consistent copy without locking
      // This consolidates WAL data and creates a clean backup
      db.exec(`VACUUM INTO '${backupFilePath}'`);

      const stats = statSync(backupFilePath);
      const checksum = await this.calculateChecksum(backupFilePath);

      const result: BackupResult = {
        path: backupFilePath,
        filename: basename(backupFilePath),
        size: stats.size,
        timestamp: new Date(),
        checksum,
      };

      logger.info({
        filename: result.filename,
        size: result.size,
        checksum: result.checksum,
      }, 'Database backup created');

      auditService.log({
        action: 'backup_created',
        resourceType: 'system',
        details: {
          filename: result.filename,
          size: result.size,
          checksum: result.checksum,
        },
      });

      return result;
    } catch (error) {
      logger.error({ error, backupFilePath }, 'Failed to create backup');
      throw new Error(`Failed to create backup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Restore database from a backup file.
   * WARNING: This replaces the current database and requires orchestrator restart.
   */
  async restoreFromBackup(backupPath: string): Promise<RestoreResult> {
    if (!existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`);
    }

    const warnings: string[] = [];
    const tablesRestored: string[] = [];

    try {
      // Verify the backup is a valid SQLite database
      const { default: Database } = await import('better-sqlite3');
      const backupDb = new Database(backupPath, { readonly: true });

      // Get list of tables in backup
      const tables = backupDb.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      `).all() as { name: string }[];

      tablesRestored.push(...tables.map(t => t.name));
      backupDb.close();

      // Validate required tables exist
      const requiredTables = ['users', 'servers', 'deployments', 'secrets'];
      const missingTables = requiredTables.filter(t => !tablesRestored.includes(t));
      if (missingTables.length > 0) {
        throw new Error(`Backup is missing required tables: ${missingTables.join(', ')}`);
      }

      // Create a backup of current database before restore
      const currentDbPath = config.database.path;
      const preRestoreBackup = `${currentDbPath}.pre-restore-${Date.now()}`;

      if (existsSync(currentDbPath)) {
        copyFileSync(currentDbPath, preRestoreBackup);
        warnings.push(`Created pre-restore backup at ${preRestoreBackup}`);
      }

      // Close current database connection
      closeDb();

      // Copy backup file to database location
      copyFileSync(backupPath, currentDbPath);

      // Remove WAL and SHM files if they exist (they're now stale)
      const walPath = `${currentDbPath}-wal`;
      const shmPath = `${currentDbPath}-shm`;
      if (existsSync(walPath)) unlinkSync(walPath);
      if (existsSync(shmPath)) unlinkSync(shmPath);

      // Reinitialize database
      initDb();

      logger.info({
        backupPath,
        tablesRestored,
      }, 'Database restored from backup');

      auditService.log({
        action: 'backup_restored',
        resourceType: 'system',
        details: {
          backupPath,
          tablesRestored,
          warnings,
        },
      });

      warnings.push('Orchestrator restart recommended to ensure clean state');

      return {
        success: true,
        tablesRestored,
        warnings,
        backupPath,
      };
    } catch (error) {
      logger.error({ error, backupPath }, 'Failed to restore backup');
      throw new Error(`Failed to restore backup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List all available backups.
   */
  listBackups(): BackupInfo[] {
    this.ensureBackupDir();

    try {
      const files = readdirSync(this.backupPath);
      const backups: BackupInfo[] = [];

      for (const file of files) {
        if (!file.endsWith('.sqlite')) continue;

        const filePath = join(this.backupPath, file);
        const stats = statSync(filePath);

        backups.push({
          filename: file,
          path: filePath,
          size: stats.size,
          createdAt: stats.mtime,
        });
      }

      // Sort by creation time, newest first
      backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return backups;
    } catch (error) {
      logger.error({ error }, 'Failed to list backups');
      throw new Error(`Failed to list backups: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a specific backup by filename.
   */
  getBackup(filename: string): BackupInfo | null {
    const filePath = join(this.backupPath, filename);

    if (!existsSync(filePath)) {
      return null;
    }

    // Security: ensure filename doesn't contain path traversal
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      throw new Error('Invalid filename');
    }

    const stats = statSync(filePath);
    return {
      filename,
      path: filePath,
      size: stats.size,
      createdAt: stats.mtime,
    };
  }

  /**
   * Delete a backup file.
   */
  deleteBackup(filename: string): boolean {
    // Security: ensure filename doesn't contain path traversal
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      throw new Error('Invalid filename');
    }

    const filePath = join(this.backupPath, filename);

    if (!existsSync(filePath)) {
      return false;
    }

    try {
      unlinkSync(filePath);
      logger.info({ filename }, 'Backup deleted');

      auditService.log({
        action: 'backup_deleted',
        resourceType: 'system',
        details: { filename },
      });

      return true;
    } catch (error) {
      logger.error({ error, filename }, 'Failed to delete backup');
      throw new Error(`Failed to delete backup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete old backups based on retention policy.
   * @param keepDays Number of days to keep backups
   * @returns Number of backups deleted
   */
  pruneBackups(keepDays: number): number {
    if (keepDays < 1) {
      throw new Error('keepDays must be at least 1');
    }

    const backups = this.listBackups();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);

    let deletedCount = 0;

    for (const backup of backups) {
      if (backup.createdAt < cutoffDate) {
        try {
          this.deleteBackup(backup.filename);
          deletedCount++;
        } catch (error) {
          logger.warn({ error, filename: backup.filename }, 'Failed to prune backup');
        }
      }
    }

    if (deletedCount > 0) {
      logger.info({ deletedCount, keepDays }, 'Pruned old backups');
    }

    return deletedCount;
  }

  /**
   * Get the backup directory path.
   */
  getBackupPath(): string {
    return this.backupPath;
  }
}

export const backupService = new BackupService();
