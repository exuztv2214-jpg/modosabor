/**
 * Firebase Cloud Messaging para la app rider.
 *
 * Este módulo está diseñado para ser DORMANT hasta que el operador:
 *   1. Cree el proyecto Firebase.
 *   2. Baje `google-services.json` y lo ponga en `client/android/app/`.
 *   3. Instale `@capacitor/push-notifications`: npm i @capacitor/push-notifications
 *   4. Corra `npx cap sync android` y rebuild APK.
 *
 * Hasta que esos 4 pasos estén hechos, `registerRiderPushToken()` es un no-op
 * silencioso (no rompe la app, no tira error, simplemente no hace nada).
 *
 * Cuando FCM está activo, el flujo es:
 *   1. Al login del rider, llamamos registerRiderPushToken(riderId, code).
 *   2. El plugin pide permiso, se registra en FCM, obtiene un token.
 *   3. Mandamos el token al backend (POST /repartidores/:id/fcm-token).
 *   4. El backend guarda el token y puede mandar push cuando asigna un pedido
 *      usando la Firebase Admin SDK.
 *
 * Con esto el rider recibe pedidos incluso con la app 100% cerrada
 * (kill del SO por RAM/ahorro de batería).
 */
import { Capacitor } from '@capacitor/core';

import api from './api.js';
import { riderStorageGet, riderStorageSet } from './nativeRiderGps.js';

let alreadyRegistered = false;
const DEVICE_ID_KEY = 'ms_rider_push_device_id_v1';

async function getDeviceId() {
  const existing = String((await riderStorageGet(DEVICE_ID_KEY)) || '').trim();
  if (existing) return existing;
  const next = globalThis.crypto?.randomUUID?.() || `rider-${Date.now()}-${Math.random()}`;
  await riderStorageSet(DEVICE_ID_KEY, next);
  return next;
}

async function loadPushPlugin() {
  try {
    const cap = await import('@capacitor/core');
    if (cap.Capacitor?.isNativePlatform?.() !== true) return null;
  } catch {
    return null;
  }
  try {
    const module = await import('@capacitor/push-notifications');
    return module?.PushNotifications || null;
  } catch {
    // Plugin no instalado todavía. OK, quedamos dormant.
    return null;
  }
}

/**
 * Registra el device del rider para push. Idempotente: si ya se registró
 * en esta sesión, no vuelve a hacerlo. El backend detecta duplicados por
 * (repartidor_id, token) y actualiza `updated_at`.
 */
export async function registerRiderPushToken(riderId, riderCode) {
  if (!riderId || !riderCode || alreadyRegistered) return null;

  const Push = await loadPushPlugin();
  if (!Push) return null; // FCM no activo, no-op silencioso

  try {
    // 1. Pedir permiso al usuario (Android 13+ obligatorio).
    const perm = await Push.checkPermissions();
    if (perm?.receive !== 'granted') {
      const req = await Push.requestPermissions();
      if (req?.receive !== 'granted') return null;
    }

    // 2. Registrar el device en FCM. El plugin dispara el evento
    //    'registration' con el token cuando lo obtiene.
    return new Promise((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      }, 12000);

      Push.addListener('registration', async (tokenPayload) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        const token = String(tokenPayload?.value || '').trim();
        if (!token) return resolve(null);

        try {
          const deviceId = await getDeviceId();
          const platform = Capacitor.getPlatform?.() === 'ios' ? 'ios' : 'android';
          await api.post(`/repartidores/${riderId}/rider/${riderCode}/fcm-token`, {
            token,
            platform,
            device_id: deviceId,
            device_label: platform === 'ios' ? 'App Rider iPhone' : 'App Rider Android',
            permission: 'granted',
          });
          alreadyRegistered = true;
          resolve(token);
        } catch {
          resolve(null);
        }
      });

      Push.addListener('registrationError', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(null);
        }
      });

      Push.register().catch(() => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(null);
        }
      });
    });
  } catch {
    return null;
  }
}

/**
 * Se llama cuando llega un push con la app en foreground. Ideal para
 * disparar la misma UI que un pedido llegado por socket (toast + sonido +
 * refresh).
 *
 * @param {Function} onNotification  callback(payload) que corre en foreground
 */
export async function subscribeRiderPush(onNotification) {
  const Push = await loadPushPlugin();
  if (!Push) return () => {};

  const remove = [];
  try {
    const l1 = await Push.addListener('pushNotificationReceived', (notification) => {
      try {
        onNotification?.(notification);
      } catch {}
    });
    remove.push(l1);

    const l2 = await Push.addListener('pushNotificationActionPerformed', (action) => {
      try {
        onNotification?.(action?.notification || action);
      } catch {}
    });
    remove.push(l2);
  } catch {}

  return () => {
    remove.forEach((h) => {
      try {
        h?.remove?.();
      } catch {}
    });
  };
}
