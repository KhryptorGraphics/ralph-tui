/**
 * ABOUTME: Session registry for cross-directory session discovery.
 * Maintains a global registry of active sessions at ~/.config/ralph-tui/sessions.json
 * allowing users to resume sessions from any directory.
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  readFile,
  writeFile,
  mkdir,
  access,
  constants,
} from 'node:fs/promises';
import type { SessionStatus } from './types.js';

/**
 * Registry file location in user's config directory
 */
const REGISTRY_DIR = join(homedir(), '.config', 'ralph-tui');
const REGISTRY_FILE = 'sessions.json';

/**
 * Entry in the session registry
 */
export interface SessionRegistryEntry {
  /** Unique session identifier */
  sessionId: string;

  /** Working directory where the session was started */
  cwd: string;

  /** Current session status */
  status: SessionStatus;

  /** When the session was started (ISO 8601) */
  startedAt: string;

  /** When the session was last updated (ISO 8601) */
  updatedAt: string;

  /** Agent plugin being used */
  agentPlugin: string;

  /** Tracker plugin being used */
  trackerPlugin: string;

  /** Epic ID (for beads tracker) */
  epicId?: string;

  /** PRD path (for json tracker) */
  prdPath?: string;

  /** Whether sandbox mode was used */
  sandbox?: boolean;
}

/**
 * Session registry structure
 */
export interface SessionRegistry {
  /** Schema version for forward compatibility */
  version: 1;

  /** Map of session ID to registry entry */
  sessions: Record<string, SessionRegistryEntry>;
}

/**
 * Get the registry file path
 */
function getRegistryPath(): string {
  return join(REGISTRY_DIR, REGISTRY_FILE);
}

/**
 * Ensure registry directory exists
 */
async function ensureRegistryDir(): Promise<void> {
  try {
    await access(REGISTRY_DIR, constants.F_OK);
  } catch {
    await mkdir(REGISTRY_DIR, { recursive: true });
  }
}

/**
 * Load the session registry from disk
 */
export async function loadRegistry(): Promise<SessionRegistry> {
  const registryPath = getRegistryPath();

  try {
    await access(registryPath, constants.F_OK);
    const content = await readFile(registryPath, 'utf-8');
    const parsed = JSON.parse(content) as SessionRegistry;

    // Validate structure
    if (parsed.version !== 1 || typeof parsed.sessions !== 'object') {
      return { version: 1, sessions: {} };
    }

    return parsed;
  } catch {
    return { version: 1, sessions: {} };
  }
}

/**
 * Save the session registry to disk
 */
export async function saveRegistry(registry: SessionRegistry): Promise<void> {
  await ensureRegistryDir();
  const registryPath = getRegistryPath();
  await writeFile(registryPath, JSON.stringify(registry, null, 2));
}

/**
 * Register a new session in the global registry
 */
export async function registerSession(entry: SessionRegistryEntry): Promise<void> {
  const registry = await loadRegistry();
  registry.sessions[entry.sessionId] = entry;
  await saveRegistry(registry);
}

/**
 * Update a session's status in the registry
 */
export async function updateRegistryStatus(
  sessionId: string,
  status: SessionStatus
): Promise<void> {
  const registry = await loadRegistry();
  const entry = registry.sessions[sessionId];

  if (entry) {
    entry.status = status;
    entry.updatedAt = new Date().toISOString();
    await saveRegistry(registry);
  }
}

/**
 * Remove a session from the registry (on completion or explicit cleanup)
 */
export async function unregisterSession(sessionId: string): Promise<void> {
  const registry = await loadRegistry();
  delete registry.sessions[sessionId];
  await saveRegistry(registry);
}

/**
 * Get a session entry by ID
 */
export async function getSessionById(
  sessionId: string
): Promise<SessionRegistryEntry | null> {
  const registry = await loadRegistry();
  return registry.sessions[sessionId] ?? null;
}

/**
 * Get a session entry by working directory
 */
export async function getSessionByCwd(
  cwd: string
): Promise<SessionRegistryEntry | null> {
  const registry = await loadRegistry();

  for (const entry of Object.values(registry.sessions)) {
    if (entry.cwd === cwd) {
      return entry;
    }
  }

  return null;
}

/**
 * List all resumable sessions (paused, running, or interrupted)
 */
export async function listResumableSessions(): Promise<SessionRegistryEntry[]> {
  const registry = await loadRegistry();
  const resumableStatuses: SessionStatus[] = ['paused', 'running', 'interrupted'];

  return Object.values(registry.sessions).filter((entry) =>
    resumableStatuses.includes(entry.status)
  );
}

/**
 * List all sessions (including completed/failed for history)
 */
export async function listAllSessions(): Promise<SessionRegistryEntry[]> {
  const registry = await loadRegistry();
  return Object.values(registry.sessions);
}

/**
 * Clean up stale sessions from the registry
 * Removes entries for sessions that no longer have a session file
 */
export async function cleanupStaleRegistryEntries(
  checkSessionExists: (cwd: string) => Promise<boolean>
): Promise<number> {
  const registry = await loadRegistry();
  let cleaned = 0;

  for (const [sessionId, entry] of Object.entries(registry.sessions)) {
    const exists = await checkSessionExists(entry.cwd);
    if (!exists) {
      delete registry.sessions[sessionId];
      cleaned++;
    }
  }

  if (cleaned > 0) {
    await saveRegistry(registry);
  }

  return cleaned;
}

/**
 * Find sessions matching a partial session ID prefix
 */
export async function findSessionsByPrefix(
  prefix: string
): Promise<SessionRegistryEntry[]> {
  const registry = await loadRegistry();

  return Object.entries(registry.sessions)
    .filter(([id]) => id.startsWith(prefix))
    .map(([, entry]) => entry);
}

/**
 * Get the registry file path (exposed for testing/diagnostics)
 */
export function getRegistryFilePath(): string {
  return getRegistryPath();
}
