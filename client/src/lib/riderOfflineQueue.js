// Cola offline de acciones críticas del rider. Si el celular pierde señal
// (típico en calles del interior), el rider puede seguir usando la app:
// las acciones (marcar entregado, subir ubicación, incidencia) quedan en
// cola persistente en Preferences y se reenvían automáticamente al
// recuperar red. Sin esto, un momento sin señal a mitad de entrega puede
// bloquear al rider.

import { riderStorageGet, riderStorageSet } from './nativeRiderGps.js';

const QUEUE_KEY = 'ms_rider_offline_queue_v1';
const MAX_ITEMS = 100;
const MAX_ATTEMPTS = 10;

function safeParse(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function readQueue() {
  const raw = await riderStorageGet(QUEUE_KEY);
  return safeParse(raw);
}

async function writeQueue(items) {
  const trimmed = items.slice(-MAX_ITEMS);
  await riderStorageSet(QUEUE_KEY, JSON.stringify(trimmed));
}

/**
 * Encola una acción para ser reintentada más tarde.
 * @param {object} action - { kind, url, method, body, meta }
 *   - kind:    string identificador ('mark_delivered', 'gps_update', 'incidencia', ...)
 *   - url:     path relativo a la API (ej: '/pedidos/123/estado')
 *   - method:  'PUT' | 'POST' | ...
 *   - body:    objeto a serializar como JSON
 *   - meta:    metadata libre para debug (opcional)
 */
export async function enqueueRiderAction(action) {
  if (!action || !action.url) return null;
  const items = await readQueue();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
    ...action,
  };
  items.push(entry);
  await writeQueue(items);
  return entry.id;
}

/**
 * Procesa la cola: intenta reenviar todas las acciones pendientes usando
 * el httpClient recibido (axios instance del proyecto). Retorna
 * { processed, remaining }.
 */
export async function processRiderQueue(httpClient) {
  const items = await readQueue();
  if (!items.length) return { processed: 0, remaining: 0 };

  const remaining = [];
  let processed = 0;

  for (const entry of items) {
    try {
      const method = String(entry.method || 'POST').toLowerCase();
      if (typeof httpClient[method] !== 'function') {
        throw new Error(`Método ${method} no soportado`);
      }
      await httpClient[method](entry.url, entry.body || {});
      processed += 1;
    } catch (err) {
      const attempts = (entry.attempts || 0) + 1;
      if (attempts < MAX_ATTEMPTS) {
        remaining.push({
          ...entry,
          attempts,
          lastError: err?.message || String(err),
        });
      }
      // Si supera MAX_ATTEMPTS, la descarto silent para no acumular basura.
    }
  }

  await writeQueue(remaining);
  return { processed, remaining: remaining.length };
}

export async function clearRiderQueue() {
  await writeQueue([]);
}
