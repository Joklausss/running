// Offline-resilient queue for finished runs. If saving an activity fails
// (no network / backend down), it's stored locally and flushed automatically
// when connectivity returns — so a run is never lost.
import { api, type SaveActivityPayload } from './api';

const QUEUE_KEY = 'pacer_pending_activities';

function read(): SaveActivityPayload[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function write(items: SaveActivityPayload[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export function pendingCount(): number {
  return read().length;
}

export function queueActivity(payload: SaveActivityPayload): void {
  write([...read(), payload]);
}

/**
 * Try to save an activity; on failure, queue it locally for later sync.
 * Returns whether it was saved online (false = queued offline).
 */
export async function saveActivityResilient(
  payload: SaveActivityPayload,
): Promise<{ synced: boolean }> {
  try {
    await api.saveActivity(payload);
    return { synced: true };
  } catch {
    queueActivity(payload);
    return { synced: false };
  }
}

/** Flush queued activities to the backend. Returns how many synced. */
export async function syncPendingActivities(): Promise<number> {
  const items = read();
  if (!items.length) return 0;
  const remaining: SaveActivityPayload[] = [];
  let synced = 0;
  for (const item of items) {
    try {
      await api.saveActivity(item);
      synced++;
    } catch {
      remaining.push(item); // keep for the next attempt
    }
  }
  write(remaining);
  return synced;
}

/** Register automatic flushing on reconnect + once at startup. */
export function registerActivitySync(onSynced?: (n: number) => void): void {
  const run = () => {
    if (navigator.onLine) {
      syncPendingActivities().then((n) => n > 0 && onSynced?.(n));
    }
  };
  window.addEventListener('online', run);
  run();
}
