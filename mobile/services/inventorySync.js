/**
 * Keeps the on-device inventory and the server's copy in step.
 *
 * Every change is applied locally first and recorded in a queue. The queue is sent
 * to the server in order whenever a connection is available, so the app keeps
 * working offline and nothing is lost if the phone drops off the network mid-save.
 */

import { request, ApiError } from './api';
import { loadQueue, saveQueue } from './storage';

let opCounter = 0;
const newOpId = () => `${Date.now()}-${(opCounter += 1)}`;

/** Queue with a save for `item`; it replaces any earlier queued save of the same item. */
export function queuePut(queue, item) {
  return [
    ...queue.filter((op) => !(op.type === 'put' && op.item.id === item.id)),
    { opId: newOpId(), type: 'put', item }
  ];
}

/** Queue with a delete for `id`; it makes any earlier queued change to that item pointless. */
export function queueDelete(queue, id) {
  return [
    ...queue.filter((op) => (op.type === 'put' ? op.item.id !== id : op.id !== id)),
    { opId: newOpId(), type: 'delete', id }
  ];
}

/** The server's items with not-yet-sent local changes applied on top. */
export function applyPending(serverItems, queue) {
  const byId = new Map(serverItems.map((item) => [item.id, item]));
  for (const op of queue) {
    if (op.type === 'put') byId.set(op.item.id, op.item);
    else byId.delete(op.id);
  }
  return [...byId.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

// Queue edits are serialised so two quick changes can never overwrite each other's write.
let queueChain = Promise.resolve();

export function updateQueue(userId, change) {
  queueChain = queueChain
    .catch(() => {})
    .then(async () => {
      const next = change(await loadQueue(userId));
      await saveQueue(userId, next);
      return next;
    });
  return queueChain;
}

/** A rejected change the server will never accept; retrying it would block the queue forever. */
function isPermanent(error) {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 && ![401, 408, 429].includes(error.status);
}

let flushing = null;

/**
 * Send queued changes in order. Stops at the first failure that a retry could fix
 * (offline, server error, expired session) and reports why.
 */
export function flushQueue(userId) {
  if (flushing) return flushing;

  flushing = (async () => {
    for (;;) {
      const [op] = await loadQueue(userId);
      if (!op) return { remaining: 0, offline: false, unauthorized: false };

      try {
        if (op.type === 'put') {
          await request(`/inventory/${encodeURIComponent(op.item.id)}`, { method: 'PUT', body: op.item });
        } else {
          await request(`/inventory/${encodeURIComponent(op.id)}`, { method: 'DELETE' });
        }
      } catch (error) {
        if (!isPermanent(error)) {
          const remaining = (await loadQueue(userId)).length;
          return { remaining, offline: Boolean(error.network), unauthorized: error.status === 401 };
        }
      }
      // Drop exactly the change that was sent. If the item was edited while it was in
      // flight, its queued save was replaced, and the newer one must stay queued.
      await updateQueue(userId, (queue) => queue.filter((queued) => queued.opId !== op.opId));
    }
  })().finally(() => {
    flushing = null;
  });

  return flushing;
}

export async function pullInventory() {
  const { items } = await request('/inventory');
  return Array.isArray(items) ? items : [];
}
