import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';

import { RIDER_GPS_OPTIONS } from './riderGps.js';
import { API_BASE_URL } from './runtime.js';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
const RiderSecureStore = registerPlugin('RiderSecureStore');
const RiderAlert = registerPlugin('RiderAlert');
const RIDER_AUTH_KEY = 'ms_rider_auth_v1';
const RIDER_STORAGE_PREFIX = 'ms_rider_';

export function isNativeRiderApp() {
  return Capacitor.isNativePlatform?.() === true;
}

/**
 * Voz nativa, no la del WebView. Funciona aunque Android haya suspendido el
 * motor de voz del navegador y mantiene el anuncio al nivel del sistema.
 */
export async function announceRiderOrder(text) {
  if (!isNativeRiderApp() || !String(text || '').trim()) return false;
  try {
    await RiderAlert.speak({ text: String(text).trim() });
    return true;
  } catch {
    return false;
  }
}

function toBrowserLikePosition(location) {
  return {
    timestamp: Number(location?.time || location?.timestamp || Date.now()),
    coords: {
      latitude: Number(location?.latitude ?? location?.coords?.latitude),
      longitude: Number(location?.longitude ?? location?.coords?.longitude),
      accuracy: Number(location?.accuracy ?? location?.coords?.accuracy),
      speed: location?.speed ?? location?.coords?.speed ?? null,
      altitude: location?.altitude ?? location?.coords?.altitude ?? null,
      altitudeAccuracy: location?.altitudeAccuracy ?? location?.coords?.altitudeAccuracy ?? null,
      heading: location?.bearing ?? location?.heading ?? location?.coords?.heading ?? null,
    },
  };
}

async function requestNativeLocationPermission() {
  try {
    const current = await Geolocation.checkPermissions();
    if (current?.location === 'granted') return current;
    return Geolocation.requestPermissions({ permissions: ['location'] });
  } catch (error) {
    return Geolocation.requestPermissions({ permissions: ['location'] });
  }
}

export async function getRiderLocationPermission() {
  if (isNativeRiderApp()) {
    try {
      const current = await Geolocation.checkPermissions();
      return current?.location || current?.coarseLocation || 'prompt';
    } catch {
      return 'prompt';
    }
  }

  if (!navigator.permissions?.query) return 'prompt';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return 'prompt';
  }
}

export async function saveNativeRiderAuth(auth) {
  const id = String(auth?.id || '').trim();
  const code = String(auth?.code || '').trim();
  if (!id || !code) return;
  await riderStorageSet(RIDER_AUTH_KEY, JSON.stringify({ id, code }));
}

export async function loadNativeRiderAuth() {
  try {
    const value = await riderStorageGet(RIDER_AUTH_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value);
    const id = String(parsed?.id || '').trim();
    const code = String(parsed?.code || '').trim();
    return id && code ? { id, code } : null;
  } catch {
    return null;
  }
}

export async function clearNativeRiderAuth() {
  await riderStorageRemove(RIDER_AUTH_KEY);
}

// Helpers universales de storage persistente. Usan @capacitor/preferences
// cuando la app corre nativa (persiste 100% entre cierres, no lo limpia
// Android por RAM) y localStorage cuando corre en web/PWA. Esto arregla
// el bug de que el rider tenia que loguearse cada vez que abria la app
// en el APK, porque el WebView de Capacitor no persiste localStorage
// entre sesiones cerradas del proceso.
export async function riderStorageGet(key) {
  if (isNativeRiderApp()) {
    try {
      const secure = await RiderSecureStore.get({ key });
      if (secure?.value != null) return secure.value;

      // Migración de APKs anteriores: se lee una vez del Preferences plano,
      // se cifra y se elimina inmediatamente la copia heredada.
      const legacy = await Preferences.get({ key });
      if (legacy?.value != null && String(key).startsWith(RIDER_STORAGE_PREFIX)) {
        await RiderSecureStore.set({ key, value: legacy.value });
        await Preferences.remove({ key });
      }
      return legacy?.value ?? null;
    } catch {
      return null;
    }
  }
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

export async function riderStorageSet(key, value) {
  const v = value == null ? '' : String(value);
  if (isNativeRiderApp()) {
    try {
      await RiderSecureStore.set({ key, value: v });
    } catch {
      // En nativo no se degrada a texto plano: si Keystore falla, es más
      // seguro pedir login otra vez que dejar credenciales legibles.
    }
    return;
  }
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, v);
  } catch {
    // silent
  }
}

export async function riderStorageRemove(key) {
  if (isNativeRiderApp()) {
    try {
      await RiderSecureStore.remove({ key });
    } catch {
      // La copia antigua se intenta limpiar igual debajo.
    }
    try {
      await Preferences.remove({ key });
    } catch {
      // Puede no existir una instalación anterior.
    }
    return;
  }
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  } catch {
    // silent
  }
}

/**
 * Borra TODO el rastro del rider en el dispositivo.
 *
 * Escenario real: un rider renuncia y el celular pasa a otro. Con el
 * logout normal solo se limpiaban las credenciales, pero quedaban el
 * historial del dia, el record personal, la cola offline pendiente y
 * los pedidos ya notificados del rider anterior — que despues aparecian
 * mezclados con los del nuevo.
 *
 * Barre por prefijos porque varias claves llevan el id del rider o la
 * fecha en el nombre (ms_rider_history_3_2026-08-02).
 */
const RIDER_KEY_PREFIXES = ['ms_rider_'];

export async function wipeRiderDevice() {
  // Claves exactas conocidas. Se listan igual que los prefijos por si
  // alguna cambia de formato en el futuro.
  const exactas = [
    'ms_rider_auth_v1',
    'ms_rider_id',
    'ms_rider_code',
    'ms_rider_online',
    'ms_rider_last_seen',
    'ms_rider_turno_inicio',
    'ms_rider_theme',
    'ms_rider_queue_v1',
    'ms_rider_last_update_check',
    'ms_rider_dismissed_update',
  ];

  if (isNativeRiderApp()) {
    try {
      // Preferences.keys() nos deja barrer tambien las dinamicas
      // (historial por fecha, notificados por dia, record por rider).
      const { keys } = await Preferences.keys();
      const objetivo = new Set(exactas);
      for (const k of keys || []) {
        if (RIDER_KEY_PREFIXES.some((p) => String(k).startsWith(p))) objetivo.add(k);
      }
      await Promise.all(
        Array.from(objetivo).map((k) => Preferences.remove({ key: k }).catch(() => {}))
      );
    } catch {
      // Fallback: al menos las exactas.
      await Promise.all(exactas.map((k) => Preferences.remove({ key: k }).catch(() => {})));
    }
    try {
      const secure = await RiderSecureStore.keys();
      const objetivo = (secure?.keys || []).filter((k) =>
        RIDER_KEY_PREFIXES.some((p) => String(k).startsWith(p))
      );
      await Promise.all(objetivo.map((k) => RiderSecureStore.remove({ key: k }).catch(() => {})));
    } catch {
      await Promise.all(exactas.map((k) => RiderSecureStore.remove({ key: k }).catch(() => {})));
    }
    return true;
  }

  try {
    if (typeof window === 'undefined') return false;
    const ls = window.localStorage;
    const aBorrar = new Set(exactas);
    for (let i = 0; i < ls.length; i += 1) {
      const k = ls.key(i);
      if (k && RIDER_KEY_PREFIXES.some((p) => k.startsWith(p))) aBorrar.add(k);
    }
    aBorrar.forEach((k) => {
      try {
        ls.removeItem(k);
      } catch {}
    });
    return true;
  } catch {
    return false;
  }
}

async function requestNativeNotificationPermission() {
  if (Capacitor.getPlatform?.() !== 'android') return null;
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current?.display === 'granted') return current;
    return LocalNotifications.requestPermissions();
  } catch {
    return null;
  }
}

export async function prepareRiderNotifications() {
  if (!isNativeRiderApp()) {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        return Notification.requestPermission();
      } catch {
        return null;
      }
    }
    return null;
  }

  const permission = await requestNativeNotificationPermission();
  if (permission?.display !== 'granted') return permission;

  if (Capacitor.getPlatform?.() === 'android') {
    try {
      await LocalNotifications.createChannel({
        // Canal nuevo: Android no permite corregir el sonido de un canal ya
        // creado. La v2 fuerza el sonido del sistema en APKs actualizadas.
        id: 'rider-orders-v2',
        name: 'Pedidos del rider',
        description: 'Avisos de nuevos pedidos asignados',
        importance: 5,
        visibility: 1,
        vibration: true,
      });
    } catch {}
  }

  return permission;
}

export async function notifyRiderNewOrder(pedido = {}) {
  const numero = pedido?.numero || pedido?.id || '';
  const cliente = String(pedido?.cliente_nombre || '').trim();
  const body = cliente
    ? `Pedido #${numero} para ${cliente}`
    : `Tenés asignado el pedido #${numero}`;

  if (!isNativeRiderApp()) {
    if ('Notification' in window && Notification.permission === 'granted') {
      return new Notification('Nuevo pedido asignado', {
        body,
        icon: '/icons/icon-192.png',
        tag: `rider-order-${pedido?.id || numero}`,
      });
    }
    return null;
  }

  const permission = await prepareRiderNotifications();
  if (permission?.display !== 'granted') return null;

  const numericId = Math.max(
    1,
    Number.parseInt(
      String(pedido?.id || Date.now())
        .replace(/\D/g, '')
        .slice(-8),
      10
    ) || 1
  );
  return LocalNotifications.schedule({
    notifications: [
      {
        id: numericId,
        title: 'Nuevo pedido asignado',
        body,
        channelId: 'rider-orders-v2',
        extra: {
          pedidoId: pedido?.id,
          numero,
        },
      },
    ],
  });
}

export async function requestRiderLocationAccess() {
  if (isNativeRiderApp()) {
    await requestNativeLocationPermission();
    await prepareRiderNotifications();
    return Geolocation.getCurrentPosition(RIDER_GPS_OPTIONS);
  }

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalizacion no disponible'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, RIDER_GPS_OPTIONS);
  });
}

export async function startRiderLocationWatcher({ onPosition, onError }) {
  if (isNativeRiderApp()) {
    await requestNativeLocationPermission();
    await prepareRiderNotifications();
    const watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundTitle: 'Modo Sabor Rider',
        backgroundMessage: 'Compartiendo ubicacion para el seguimiento del pedido.',
        requestPermissions: true,
        stale: false,
        distanceFilter: 8,
      },
      (location, error) => {
        if (error) {
          onError?.(error);
          return;
        }
        if (location) onPosition?.(toBrowserLikePosition(location));
      }
    );

    return {
      mode: 'native-background',
      stop: () => BackgroundGeolocation.removeWatcher({ id: watcherId }),
    };
  }

  if (!navigator.geolocation) {
    throw new Error('Geolocalizacion no disponible');
  }

  const watchId = navigator.geolocation.watchPosition(onPosition, onError, RIDER_GPS_OPTIONS);
  return {
    mode: 'web',
    stop: () => navigator.geolocation.clearWatch(watchId),
  };
}

export async function openNativeLocationSettings() {
  if (!isNativeRiderApp()) return false;
  await BackgroundGeolocation.openSettings();
  return true;
}

export async function sendRiderLocationUpdate({ riderId, riderCode, payload, webClient }) {
  const path = `/repartidores/${riderId}/rider/${riderCode}/ubicacion`;

  if (!isNativeRiderApp()) {
    return webClient.put(path, payload);
  }

  return CapacitorHttp.put({
    url: `${API_BASE_URL}${path}`,
    headers: {
      'Content-Type': 'application/json',
    },
    data: payload,
  });
}
