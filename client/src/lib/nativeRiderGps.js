import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';

import { RIDER_GPS_OPTIONS } from './riderGps.js';
import { API_BASE_URL } from './runtime.js';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
const RIDER_AUTH_KEY = 'ms_rider_auth_v1';

export function isNativeRiderApp() {
  return Capacitor.isNativePlatform?.() === true;
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
  await Preferences.set({ key: RIDER_AUTH_KEY, value: JSON.stringify({ id, code }) });
}

export async function loadNativeRiderAuth() {
  try {
    const { value } = await Preferences.get({ key: RIDER_AUTH_KEY });
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
  await Preferences.remove({ key: RIDER_AUTH_KEY });
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
      const { value } = await Preferences.get({ key });
      return value ?? null;
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
      await Preferences.set({ key, value: v });
    } catch {
      // silent
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
      await Preferences.remove({ key });
    } catch {
      // silent
    }
    return;
  }
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  } catch {
    // silent
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
        id: 'rider-orders',
        name: 'Pedidos del rider',
        description: 'Avisos de nuevos pedidos asignados',
        importance: 5,
        visibility: 1,
        vibration: true,
        // Si existe client/android/app/src/main/res/raw/rider_alert.mp3
        // se usa ese sonido custom fuerte; si no, Android cae al default
        // del sistema automatico (no rompe la notificacion).
        sound: 'rider_alert',
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
        channelId: 'rider-orders',
        // Si existe client/android/app/src/main/res/raw/rider_alert.mp3
        // se usa ese sonido custom fuerte; si no, Android cae al default
        // del sistema automatico (no rompe la notificacion).
        sound: 'rider_alert',
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
