interface DocumentLock {
  documentId: number;
  userId: number;
  username: string;
  fullName: string;
  lockedAt: number;
  lastHeartbeat: number;
}

const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

const locks = new Map<number, DocumentLock>();

function cleanStale() {
  const now = Date.now();
  for (const [docId, lock] of locks) {
    if (now - lock.lastHeartbeat > LOCK_TIMEOUT_MS) {
      locks.delete(docId);
    }
  }
}

export function acquireLock(documentId: number, userId: number, username: string, fullName: string): { success: boolean; lock?: DocumentLock; heldBy?: DocumentLock } {
  cleanStale();
  const existing = locks.get(documentId);
  if (existing && existing.userId !== userId) {
    return { success: false, heldBy: existing };
  }
  const lock: DocumentLock = { documentId, userId, username, fullName, lockedAt: Date.now(), lastHeartbeat: Date.now() };
  if (existing && existing.userId === userId) {
    lock.lockedAt = existing.lockedAt;
  }
  locks.set(documentId, lock);
  return { success: true, lock };
}

export function releaseLock(documentId: number, userId: number): boolean {
  const existing = locks.get(documentId);
  if (existing && existing.userId === userId) {
    locks.delete(documentId);
    return true;
  }
  return false;
}

export function heartbeat(documentId: number, userId: number): boolean {
  const existing = locks.get(documentId);
  if (existing && existing.userId === userId) {
    existing.lastHeartbeat = Date.now();
    return true;
  }
  return false;
}

export function getLockStatus(documentId: number): DocumentLock | null {
  cleanStale();
  return locks.get(documentId) || null;
}

export function getUserLocks(userId: number): DocumentLock[] {
  cleanStale();
  const result: DocumentLock[] = [];
  for (const lock of locks.values()) {
    if (lock.userId === userId) result.push(lock);
  }
  return result;
}

export function releaseAllUserLocks(userId: number): number {
  let count = 0;
  for (const [docId, lock] of locks) {
    if (lock.userId === userId) {
      locks.delete(docId);
      count++;
    }
  }
  return count;
}
