import { Capacitor, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const SecureStore = registerPlugin('MozoSecureStore');
const API_ORIGIN = String(import.meta.env.VITE_API_URL || 'https://modosabor.com.ar').replace(
  /\/$/,
  ''
);
const SESSION_KEY = 'ms_mozo_session_v1';

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
  const response = await fetch(`${API_ORIGIN}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'No se pudo comunicar con el local.');
  return data;
}
