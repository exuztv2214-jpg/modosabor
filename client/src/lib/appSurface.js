/**
 * Cada panel independiente se identifica por su hostname. Esto sólo define la
 * interfaz que se muestra: permisos y datos siguen validándose en la API.
 */
const MASIVOS_HOSTS = new Set(['masivos.modosabor.com.ar', 'masivos.localhost']);
const SOCIAL_HOSTS = new Set(['social.modosabor.com.ar', 'social.localhost']);

export function isMasivosSurface() {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.VITE_APP_SURFACE === 'masivos') return true;
  return MASIVOS_HOSTS.has(String(window.location.hostname || '').toLowerCase());
}

export function isSocialSurface() {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.VITE_APP_SURFACE === 'social') return true;
  return SOCIAL_HOSTS.has(String(window.location.hostname || '').toLowerCase());
}
