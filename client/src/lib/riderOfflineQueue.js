// Cola offline de acciones críticas del rider. Si el celular pierde señal
// (típico en calles del interior), el rider puede seguir usando la app:
// las acciones (marcar entregado, subir ubicación, incidencia) quedan en
// cola persistente en Preferences y se reenvían automáticamente al
// recuperar red. Sin esto, un momento sin señal a mitad de entrega puede
// bloquear al rider.

import { riderStorageGet, riderStorageSet } from './nativeRiderGps.js';

const QUEUE_KEY = 'ms_rider_offline_queue_v1';
/*
  Las acciones que se dieron por perdidas van a otra lista en vez de borrarse.
  Ver `processRiderQueue` para el porqué.
*/
const FALLIDAS_KEY = 'ms_rider_acciones_fallidas_v1';
const MAX_ITEMS = 100;
const MAX_ATTEMPTS = 10;

/*
  Acciones que no se pueden perder sin avisar.

  Una posición de GPS que no llega no le importa a nadie: cinco segundos después
  hay otra. Pero una entrega que no llegó significa que el rider cree que cerró
  el pedido, el sistema cree que sigue en la calle, y si era en efectivo la caja
  no va a cuadrar.
*/
const CRITICAS = new Set(['mark_delivered', 'change_state', 'report_issue']);

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
  const fallidas = [];
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
      /*
        El interceptor de axios rechaza con `.error`, no con `.message`, así que
        leer sólo `message` dejaba el motivo siempre en blanco.
      */
      const motivo = err?.error || err?.message || String(err);
      const estado = err?._httpStatus;
      const attempts = (entry.attempts || 0) + 1;

      /*
        Un 4xx no se reintenta: el servidor entendió y dijo que no. Puede ser
        que el pedido ya esté entregado, o que se haya cancelado. Reintentarlo
        diez veces no lo va a arreglar y tapa la cola de las que sí pueden salir.

        Los errores de red y los 5xx sí se reintentan: ahí el problema es
        temporal.
      */
      const esDefinitivo = estado >= 400 && estado < 500;
      const agotado = attempts >= MAX_ATTEMPTS;

      if (!esDefinitivo && !agotado) {
        remaining.push({ ...entry, attempts, lastError: motivo });
        continue;
      }

      /*
        Acá antes se borraba la acción en silencio.

        Para una posición de GPS está bien. Para una entrega es grave: el rider
        marcó que entregó, el pedido nunca se cerró en el sistema, y nadie se
        entera hasta que alguien nota que falta plata en la caja.

        Ahora las importantes se guardan aparte para poder mostrarlas.
      */
      if (CRITICAS.has(entry.kind)) {
        fallidas.push({ ...entry, attempts, lastError: motivo, estado, falloEn: nuevaFecha() });
      }
    }
  }

  await writeQueue(remaining);
  if (fallidas.length) await guardarFallidas(fallidas);

  return { processed, remaining: remaining.length, fallidas: fallidas.length };
}

function nuevaFecha() {
  return new Date().toISOString();
}

async function guardarFallidas(nuevas) {
  const previas = await readFailedActions();
  await riderStorageSet(FALLIDAS_KEY, JSON.stringify([...previas, ...nuevas].slice(-30)));
}

/**
 * Acciones que se dieron por perdidas y hay que resolver a mano.
 *
 * La pantalla las muestra para que el rider avise, en vez de que la entrega
 * desaparezca sin que nadie lo note.
 */
export async function readFailedActions() {
  return safeParse(await riderStorageGet(FALLIDAS_KEY));
}

export async function clearFailedActions() {
  await riderStorageSet(FALLIDAS_KEY, '[]');
}

export async function clearRiderQueue() {
  await writeQueue([]);
}
