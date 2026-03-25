/**
 * PostGen – Pipeline lock file.
 *
 * Prevents concurrent pipeline runs from colliding on the same workspace.
 * Uses a simple .postgen-lock file with PID and timestamp. Detects stale
 * locks from crashed processes via PID liveness checks.
 *
 * Usage:
 *   import { acquireLock, releaseLock } from './pipeline-lock.mjs';
 *
 *   const lockPath = acquireLock(postDir);  // throws if locked
 *   try {
 *     // ... run pipeline ...
 *   } finally {
 *     releaseLock(lockPath);
 *   }
 */
import fs from 'fs';
import path from 'path';

const LOCK_FILENAME = '.postgen-lock';
const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes — locks older than this are considered stale

/**
 * Try to acquire a pipeline lock for the given directory.
 *
 * @param {string} dir  The post directory or workspace root to lock
 * @returns {string}    Path to the lock file (pass to releaseLock)
 * @throws {Error}      If another pipeline is already running
 */
export function acquireLock(dir) {
  const lockPath = path.join(dir, LOCK_FILENAME);

  if (fs.existsSync(lockPath)) {
    // Check if the existing lock is stale
    let lockData;
    try {
      lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    } catch {
      // Corrupt lock file — remove it
      console.warn(`  [lock] Removing corrupt lock file: ${lockPath}`);
      fs.unlinkSync(lockPath);
    }

    if (lockData) {
      const lockAge = Date.now() - (lockData.timestamp || 0);
      const isProcessAlive = isPidAlive(lockData.pid);

      if (isProcessAlive && lockAge < STALE_THRESHOLD_MS) {
        throw new Error(
          `Pipeline is already running (PID ${lockData.pid}, started ${Math.round(lockAge / 1000)}s ago). ` +
          `If this is wrong, delete ${lockPath}`
        );
      }

      // Stale lock — process is dead or lock is too old
      const reason = !isProcessAlive ? `PID ${lockData.pid} is no longer running` : `lock is ${Math.round(lockAge / 60000)}min old`;
      console.warn(`  [lock] Removing stale lock (${reason})`);
      fs.unlinkSync(lockPath);
    }
  }

  // Write new lock
  const lockData = {
    pid: process.pid,
    timestamp: Date.now(),
    startedAt: new Date().toISOString(),
  };
  fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2));
  return lockPath;
}

/**
 * Release the pipeline lock.
 *
 * @param {string} lockPath  Path returned by acquireLock
 */
export function releaseLock(lockPath) {
  try {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Check if a PID is still alive.
 */
function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0); // signal 0 = existence check, doesn't kill
    return true;
  } catch {
    return false;
  }
}
