import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';

import { RIDER_GPS_OPTIONS } from './riderGps.js';
import { API_BASE_URL } from './runtime.js';

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

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

export async function requestRiderLocationAccess() {
  if (isNativeRiderApp()) {
    await requestNativeLocationPermission();
    await requestNativeNotificationPermission();
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
    await requestNativeNotificationPermission();
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
