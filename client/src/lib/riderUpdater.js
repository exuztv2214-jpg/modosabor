/**
 * Sistema de auto-actualización de la app rider (Android).
 *
 * Flujo:
 *   1. Al abrir la app (después del login), llamamos a checkForUpdate()
 *      que hace GET a /api/rider-app/version.
 *   2. Comparamos el versionCode devuelto contra el versionCode instalado
 *      (leído con @capacitor/app).
 *   3. Si el server tiene una versión más nueva, retornamos la info del
 *      update (RiderPanel muestra un modal).
 *   4. Cuando el rider acepta, downloadAndInstall() abre la URL del APK
 *      en el navegador del sistema. Android descarga, muestra el diálogo
 *      "¿Instalar esta app?" y el rider toca "Instalar".
 *
 * Requisitos Android:
 *   - Permiso REQUEST_INSTALL_PACKAGES en AndroidManifest.xml (agregado).
 *   - La primera vez el rider tiene que aceptar "instalar apps de esta
 *     fuente" en el diálogo del sistema. Después queda persistido.
 *
 * No usamos @capacitor/filesystem porque abrir el APK con intent nativo
 * desde un archivo interno requiere un plugin adicional (Cordova FileOpener2
 * o custom Java). Delegar en el browser del sistema es más simple y
 * funciona igual de bien: es UX estándar en apps que se autoactualizan
 * fuera de Play Store (Rappi partner, Uber partner, etc.).
 */

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 horas
const LAST_CHECK_KEY = 'ms_rider_last_update_check';
const DISMISSED_VERSION_KEY = 'ms_rider_dismissed_update';

/**
 * Detecta si estamos corriendo en Capacitor Android (no en web).
 */
async function isNative() {
  try {
    const cap = await import('@capacitor/core');
    return cap.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/**
 * Devuelve el versionCode + versionName instalados. En web devuelve null
 * (el sistema de update no aplica).
 */
export async function getInstalledVersion() {
  if (!(await isNative())) return null;
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    // Capacitor Android devuelve build como string, lo convertimos a número.
    const versionCode = parseInt(info?.build, 10) || 0;
    const versionName = String(info?.version || '');
    return { versionCode, versionName };
  } catch {
    return null;
  }
}

/**
 * Chequea contra el backend si hay una versión nueva disponible.
 *
 * @param {Object} httpClient  Axios instance con baseURL configurada.
 * @param {Object} [options]
 * @param {boolean} [options.force=false]  Ignora throttle y flag de dismiss.
 * @returns {Promise<null|Object>}  null si no hay update; objeto con info si sí.
 */
export async function checkForUpdate(httpClient, options = {}) {
  const force = Boolean(options.force);
  const installed = await getInstalledVersion();
  if (!installed) return null;

  // Throttle: no chequeamos más de 1 vez cada CHECK_INTERVAL_MS salvo force.
  if (!force) {
    try {
      const last = parseInt(localStorage.getItem(LAST_CHECK_KEY), 10) || 0;
      if (Date.now() - last < CHECK_INTERVAL_MS) {
        return null;
      }
    } catch {}
  }

  let manifest;
  try {
    const res = await httpClient.get('/rider-app/version', {
      timeout: 8000,
      // No mandamos auth: el endpoint es público.
    });
    manifest = res?.data;
  } catch (error) {
    // Silent: sin red o server caído, seguimos como si no hubiera update.
    return null;
  }

  try {
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
  } catch {}

  if (!manifest || !manifest.hasBinary || !manifest.downloadUrl) {
    return null;
  }

  const serverCode = Number(manifest.versionCode) || 0;
  const minCode = Number(manifest.minVersionCode) || 0;
  const currentCode = installed.versionCode;

  // No hay update: server no tiene nada nuevo.
  if (serverCode <= currentCode) return null;

  // Chequear si el rider ya dismiseó esta misma versión (para no rebombardear).
  // Ignoramos dismiss si es forceUpdate o si su versión < minVersionCode.
  const isForced = Boolean(manifest.forceUpdate) || currentCode < minCode;
  if (!force && !isForced) {
    try {
      const dismissed = parseInt(localStorage.getItem(DISMISSED_VERSION_KEY), 10) || 0;
      if (dismissed === serverCode) return null;
    } catch {}
  }

  return {
    ...manifest,
    installedVersionCode: currentCode,
    installedVersionName: installed.versionName,
    isForced,
  };
}

/**
 * Marca esta versión como "más tarde" para no molestar hasta que salga
 * una versión aún más nueva.
 */
export function dismissUpdate(versionCode) {
  try {
    localStorage.setItem(DISMISSED_VERSION_KEY, String(versionCode || 0));
  } catch {}
}

/**
 * Dispara la descarga + instalación del APK. En Android abre el link
 * en el browser del sistema para que descargue y muestre el instalador.
 * En web hace un noop / abre en tab nueva por si estamos testeando.
 */
export async function downloadAndInstall(downloadUrl) {
  if (!downloadUrl) return false;

  if (await isNative()) {
    try {
      // Intento con el AppLauncher si está disponible (más limpio, respeta
      // el browser default del usuario). Fallback a Browser plugin.
      try {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: downloadUrl, presentationStyle: 'popover' });
        return true;
      } catch {}
      // Último recurso: window.open que en Capacitor abre en el browser
      // externo automáticamente (por config del WebView).
      window.open(downloadUrl, '_system');
      return true;
    } catch (error) {
      // Aún así intentamos con href como último fallback
      try {
        window.location.assign(downloadUrl);
      } catch {}
      return false;
    }
  }

  // Web: abre en nueva pestaña.
  try {
    window.open(downloadUrl, '_blank', 'noopener');
    return true;
  } catch {
    return false;
  }
}
