import { Capacitor, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const SecureStore = registerPlugin('MozoSecureStore');
const API_ORIGIN = String(import.meta.env.VITE_API_URL || 'https://modosabor.com.ar').replace(
  /\/$/,
  ''
);
const SESSION_KEY = 'ms_mozo_session_v1';
const PENDING_ORDERS_KEY = 'ms_mozo_pending_orders_v1';
const MAX_PENDING_ORDERS = 20;

function isNative() {
  return Capacitor.isNativePlatform?.() === true;
}

/**
 * Un APK viejo, una instalación incompleta o un teléfono que no puede abrir
 * Android Keystore no deben impedir que el mozo abra su turno. `registerPlugin`
 * crea el proxy JS aun cuando el bridge nativo no lo tenga registrado; por eso
 * se consulta explícitamente la disponibilidad antes de invocarlo.
 */
function hasSecureStore() {
  return isNative() && Capacitor.isPluginAvailable?.('MozoSecureStore') === true;
}

export async function loadSession() {
  try {
    const result = hasSecureStore() ? await SecureStore.get({ key: SESSION_KEY }) : null;
    if (result?.value) return JSON.parse(result.value);
  } catch {
    // En navegador de desarrollo se usa Preferences como respaldo temporal.
  }
  const fallback = await Preferences.get({ key: SESSION_KEY });
  return fallback.value ? JSON.parse(fallback.value) : null;
}

export async function saveSession(session) {
  const value = JSON.stringify(session);
  if (isNative()) {
    try {
      if (hasSecureStore()) {
        const result = await SecureStore.setAndVerify({ key: SESSION_KEY, value });
        if (result?.value === value) {
          await Preferences.remove({ key: SESSION_KEY });
          return { secure: true };
        }
      }
    } catch {
      // El respaldo mantiene la sesión si el bridge o Keystore no están listos.
    }
    await Preferences.set({ key: SESSION_KEY, value });
    return { secure: false };
  }
  await Preferences.set({ key: SESSION_KEY, value });
  return { secure: false };
}

export async function clearSession() {
  try {
    if (hasSecureStore()) await SecureStore.remove({ key: SESSION_KEY });
  } catch {
    // Igual se elimina el respaldo si el bridge aún no está listo.
  }
  await Preferences.remove({ key: SESSION_KEY });
}

export async function api(path, { token, method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`${API_ORIGIN}/api${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    const error = new Error('Sin conexión con el local.');
    error.network = true;
    error.cause = cause;
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'No se pudo comunicar con el local.');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function loadPendingOrdersRaw() {
  const result = await Preferences.get({ key: PENDING_ORDERS_KEY });
  try {
    const value = JSON.parse(result.value || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function savePendingOrders(orders) {
  await Preferences.set({ key: PENDING_ORDERS_KEY, value: JSON.stringify(orders) });
}

export async function loadPendingOrders() {
  return loadPendingOrdersRaw();
}

/* The idempotency key is kept with the draft so a retry cannot duplicate a sale. */
export async function queuePendingOrder(payload) {
  const orders = await loadPendingOrdersRaw();
  const key = String(payload?.idempotency_key || '');
  if (!key) throw new Error('La comanda no tiene una clave de envío válida.');
  if (orders.some((order) => order?.idempotency_key === key)) return orders;
  if (orders.length >= MAX_PENDING_ORDERS) {
    throw new Error('Hay demasiadas comandas pendientes. Volvé a conectarte antes de cargar más.');
  }
  const next = [...orders, { ...payload, queued_at: new Date().toISOString() }];
  await savePendingOrders(next);
  return next;
}

export async function removePendingOrder(idempotencyKey) {
  const orders = await loadPendingOrdersRaw();
  const next = orders.filter((order) => order?.idempotency_key !== idempotencyKey);
  await savePendingOrders(next);
  return next;
}
