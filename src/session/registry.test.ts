/**
 * ABOUTME: Tests for session registry functionality.
 * Covers registration, lookup, listing, and cleanup of sessions.
 */

import { describe, expect, test, afterEach } from 'bun:test';
import {
  loadRegistry,
  registerSession,
  updateRegistryStatus,
  unregisterSession,
  getSessionById,
  getSessionByCwd,
  listResumableSessions,
  cleanupStaleRegistryEntries,
  findSessionsByPrefix,
  type SessionRegistryEntry,
} from './registry.js';

// Mock the registry directory for tests
// Note: These tests modify the actual registry file at ~/.config/ralph-tui/sessions.json
// In a real test environment, we'd want to mock the file system or use dependency injection

describe('Session Registry', () => {
  let testSessionIds: string[] = [];

  // Clean up any test sessions after each test
  afterEach(async () => {
    for (const id of testSessionIds) {
      await unregisterSession(id);
    }
    testSessionIds = [];
  });

  describe('registerSession', () => {
    test('registers a new session', async () => {
      const sessionId = `test-session-${Date.now()}-1`;
      testSessionIds.push(sessionId);

      const entry: SessionRegistryEntry = {
        sessionId,
        cwd: '/tmp/test-project',
        status: 'running',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        agentPlugin: 'claude',
        trackerPlugin: 'json',
        prdPath: '/tmp/test-project/prd.json',
      };

      await registerSession(entry);

      const retrieved = await getSessionById(sessionId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionId).toBe(sessionId);
      expect(retrieved?.cwd).toBe('/tmp/test-project');
      expect(retrieved?.status).toBe('running');
    });

    test('updates existing session on re-register', async () => {
      const sessionId = `test-session-${Date.now()}-2`;
      testSessionIds.push(sessionId);

      const entry1: SessionRegistryEntry = {
        sessionId,
        cwd: '/tmp/project-1',
        status: 'running',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        agentPlugin: 'claude',
        trackerPlugin: 'json',
      };

      await registerSession(entry1);

      const entry2: SessionRegistryEntry = {
        ...entry1,
        cwd: '/tmp/project-2',
        status: 'paused',
      };

      await registerSession(entry2);

      const retrieved = await getSessionById(sessionId);
      expect(retrieved?.cwd).toBe('/tmp/project-2');
      expect(retrieved?.status).toBe('paused');
    });
  });

  describe('updateRegistryStatus', () => {
    test('updates session status', async () => {
      const sessionId = `test-session-${Date.now()}-3`;
      testSessionIds.push(sessionId);

      await registerSession({
        sessionId,
        cwd: '/tmp/test',
        status: 'running',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        agentPlugin: 'claude',
        trackerPlugin: 'beads',
      });

      await updateRegistryStatus(sessionId, 'paused');

      const retrieved = await getSessionById(sessionId);
      expect(retrieved?.status).toBe('paused');
    });

    test('does not fail for non-existent session', async () => {
      // Should not throw
      await updateRegistryStatus('non-existent-session', 'paused');
    });
  });

  describe('unregisterSession', () => {
    test('removes session from registry', async () => {
      const sessionId = `test-session-${Date.now()}-4`;

      await registerSession({
        sessionId,
        cwd: '/tmp/test',
        status: 'completed',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        agentPlugin: 'claude',
        trackerPlugin: 'json',
      });

      await unregisterSession(sessionId);

      const retrieved = await getSessionById(sessionId);
      expect(retrieved).toBeNull();
    });
  });

  describe('getSessionByCwd', () => {
    test('finds session by working directory', async () => {
      const sessionId = `test-session-${Date.now()}-5`;
      testSessionIds.push(sessionId);
      const testCwd = `/tmp/unique-test-cwd-${Date.now()}`;

      await registerSession({
        sessionId,
        cwd: testCwd,
        status: 'running',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        agentPlugin: 'claude',
        trackerPlugin: 'json',
      });

      const retrieved = await getSessionByCwd(testCwd);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionId).toBe(sessionId);
    });

    test('returns null for non-existent cwd', async () => {
      const retrieved = await getSessionByCwd('/non/existent/path');
      expect(retrieved).toBeNull();
    });
  });

  describe('listResumableSessions', () => {
    test('lists only resumable sessions', async () => {
      const baseId = `test-session-${Date.now()}`;

      // Create sessions with various statuses
      const sessions: Array<{ id: string; status: 'running' | 'paused' | 'interrupted' | 'completed' | 'failed' }> = [
        { id: `${baseId}-running`, status: 'running' },
        { id: `${baseId}-paused`, status: 'paused' },
        { id: `${baseId}-interrupted`, status: 'interrupted' },
        { id: `${baseId}-completed`, status: 'completed' },
        { id: `${baseId}-failed`, status: 'failed' },
      ];

      for (const { id, status } of sessions) {
        testSessionIds.push(id);
        await registerSession({
          sessionId: id,
          cwd: `/tmp/${id}`,
          status,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          agentPlugin: 'claude',
          trackerPlugin: 'json',
        });
      }

      const resumable = await listResumableSessions();
      const testResumable = resumable.filter(s => s.sessionId.startsWith(baseId));

      expect(testResumable.length).toBe(3);
      const statuses = testResumable.map(s => s.status);
      expect(statuses).toContain('running');
      expect(statuses).toContain('paused');
      expect(statuses).toContain('interrupted');
      expect(statuses).not.toContain('completed');
      expect(statuses).not.toContain('failed');
    });
  });

  describe('findSessionsByPrefix', () => {
    test('finds sessions by ID prefix', async () => {
      const uniquePrefix = `prefix-test-${Date.now()}`;

      const sessions = [
        `${uniquePrefix}-aaa`,
        `${uniquePrefix}-aab`,
        `${uniquePrefix}-bbb`,
      ];

      for (const id of sessions) {
        testSessionIds.push(id);
        await registerSession({
          sessionId: id,
          cwd: `/tmp/${id}`,
          status: 'running',
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          agentPlugin: 'claude',
          trackerPlugin: 'json',
        });
      }

      const matchesAa = await findSessionsByPrefix(`${uniquePrefix}-aa`);
      expect(matchesAa.length).toBe(2);

      const matchesBb = await findSessionsByPrefix(`${uniquePrefix}-bb`);
      expect(matchesBb.length).toBe(1);

      const matchesAll = await findSessionsByPrefix(uniquePrefix);
      expect(matchesAll.length).toBe(3);
    });

    test('returns empty array for no matches', async () => {
      const matches = await findSessionsByPrefix('definitely-not-a-real-prefix-xyz123');
      expect(matches).toEqual([]);
    });
  });

  describe('cleanupStaleRegistryEntries', () => {
    test('removes entries for sessions that no longer exist', async () => {
      const sessionId1 = `test-cleanup-${Date.now()}-exists`;
      const sessionId2 = `test-cleanup-${Date.now()}-gone`;
      testSessionIds.push(sessionId1);

      await registerSession({
        sessionId: sessionId1,
        cwd: '/tmp/exists',
        status: 'running',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        agentPlugin: 'claude',
        trackerPlugin: 'json',
      });

      await registerSession({
        sessionId: sessionId2,
        cwd: '/tmp/gone',
        status: 'running',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        agentPlugin: 'claude',
        trackerPlugin: 'json',
      });

      // Mock checker that says only /tmp/exists has a session
      const mockChecker = async (cwd: string): Promise<boolean> => {
        return cwd === '/tmp/exists';
      };

      const cleaned = await cleanupStaleRegistryEntries(mockChecker);

      // Should have cleaned up sessionId2
      expect(cleaned).toBeGreaterThanOrEqual(1);

      const remaining1 = await getSessionById(sessionId1);
      const remaining2 = await getSessionById(sessionId2);

      expect(remaining1).not.toBeNull();
      expect(remaining2).toBeNull();
    });
  });

  describe('loadRegistry and saveRegistry', () => {
    test('handles empty/new registry', async () => {
      const registry = await loadRegistry();
      expect(registry.version).toBe(1);
      expect(typeof registry.sessions).toBe('object');
    });

    test('preserves registry structure after save', async () => {
      const sessionId = `test-persist-${Date.now()}`;
      testSessionIds.push(sessionId);

      await registerSession({
        sessionId,
        cwd: '/tmp/persist-test',
        status: 'running',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        agentPlugin: 'codex',
        trackerPlugin: 'beads',
        epicId: 'test-epic',
        sandbox: true,
      });

      const registry = await loadRegistry();
      expect(registry.sessions[sessionId]).toBeDefined();
      expect(registry.sessions[sessionId].agentPlugin).toBe('codex');
      expect(registry.sessions[sessionId].trackerPlugin).toBe('beads');
      expect(registry.sessions[sessionId].epicId).toBe('test-epic');
      expect(registry.sessions[sessionId].sandbox).toBe(true);
    });
  });
});
