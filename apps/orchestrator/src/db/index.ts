import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function initDb(): Database.Database {
  const dbDir = dirname(config.database.path);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.database.path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // Run migrations for schema changes
  runMigrations(db);

  console.log(`Database initialized at ${config.database.path}`);
  return db;
}

/**
 * Run database migrations for schema changes.
 * Each migration is idempotent and checks if it needs to be applied.
 */
function runMigrations(database: Database.Database): void {
  // Migration 1: Add rotated_at column to secrets table
  const secretsColumns = database.prepare("PRAGMA table_info(secrets)").all() as { name: string }[];
  const hasRotatedAt = secretsColumns.some(col => col.name === 'rotated_at');
  if (!hasRotatedAt) {
    database.exec('ALTER TABLE secrets ADD COLUMN rotated_at TIMESTAMP');
    console.log('Migration: Added rotated_at column to secrets table');
  }

  // Migration 2: Add name and expires_at columns to agent_tokens table
  const agentTokensColumns = database.prepare("PRAGMA table_info(agent_tokens)").all() as { name: string }[];
  const hasTokenName = agentTokensColumns.some(col => col.name === 'name');
  if (!hasTokenName) {
    database.exec('ALTER TABLE agent_tokens ADD COLUMN name TEXT');
    console.log('Migration: Added name column to agent_tokens table');
  }
  const hasExpiresAt = agentTokensColumns.some(col => col.name === 'expires_at');
  if (!hasExpiresAt) {
    database.exec('ALTER TABLE agent_tokens ADD COLUMN expires_at TIMESTAMP');
    database.exec('CREATE INDEX IF NOT EXISTS idx_agent_tokens_expires ON agent_tokens(expires_at)');
    console.log('Migration: Added expires_at column to agent_tokens table');
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Run a function within a database transaction.
 * If the function throws, the transaction is rolled back.
 * If the function succeeds, the transaction is committed.
 *
 * @param fn - The function to run within the transaction
 * @returns The return value of the function
 */
export function runInTransaction<T>(fn: () => T): T {
  const database = getDb();
  return database.transaction(fn)();
}
