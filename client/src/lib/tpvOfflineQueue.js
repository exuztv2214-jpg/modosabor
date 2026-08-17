// Cola local del TPV. No intenta cobrar ni imprimir: sólo conserva el pedido
// ya validado por caja para reenviarlo cuando la red vuelve. El servidor usa
// `idempotency_key`, por lo que un corte durante la respuesta no lo duplica.

const QUEUE_KEY = 'ms_tpv_offline_orders_v1';
const MAX_PENDING_ORDERS = 50;

function leerJson(raw, fallback = []) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function generarClave() {
  if (globalThis.crypto?.randomUUID) return `tpv-offline:${globalThis.crypto.randomUUID()}`;
  return `tpv-offline:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
}

export function leerPedidosOffline() {
  if (typeof window === 'undefined') return [];
  return leerJson(window.localStorage.getItem(QUEUE_KEY));
}

function guardarPedidosOffline(pedidos) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(pedidos));
}

export function encolarPedidoOffline(payload) {
  const pendientes = leerPedidosOffline();
  if (pendientes.length >= MAX_PENDING_ORDERS) {
    throw new Error(
      'La cola sin conexión llegó a 50 pedidos. Recuperá internet y sincronizá antes de seguir cobrando.'
    );
  }
  const idempotency_key = String(payload?.idempotency_key || '').trim() || generarClave();
  const entry = {
    idempotency_key,
    payload: { ...payload, idempotency_key },
    creado_en: new Date().toISOString(),
    intentos: 0,
    ultimo_error: '',
  };
  guardarPedidosOffline([...pendientes, entry]);
  return entry;
}

/** Reenvía en el orden en que el cajero tomó los pedidos. */
export async function sincronizarPedidosOffline(httpClient) {
  const pendientes = leerPedidosOffline();
  if (!pendientes.length) return { enviados: 0, pendientes: 0, fallidos: 0 };

  const restantes = [];
  let enviados = 0;
  let fallidos = 0;

  for (let index = 0; index < pendientes.length; index += 1) {
    const entry = pendientes[index];
    try {
      await httpClient.post('/pedidos/interno', entry.payload);
      enviados += 1;
    } catch (error) {
      fallidos += 1;
      /* No se pierde un 4xx: alguien debe resolver stock, caja o validación. */
      restantes.push({
        ...entry,
        intentos: Number(entry.intentos || 0) + 1,
        ultimo_error: error?.error || error?.message || 'No se pudo sincronizar',
      });
      // Se conserva el orden: un pedido anterior pendiente no debe saltearse.
      restantes.push(...pendientes.slice(index + 1));
      break;
    }
  }

  guardarPedidosOffline(restantes);
  return { enviados, pendientes: restantes.length, fallidos };
}
