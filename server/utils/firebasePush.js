const admin = require('firebase-admin');
const logger = require('./logger');

let initializationAttempted = false;
let firebaseMessaging = null;

function getMessaging() {
  if (initializationAttempted) return firebaseMessaging;
  initializationAttempted = true;

  const rawCredential = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!rawCredential) {
    logger.info('FCM inactivo: falta FIREBASE_SERVICE_ACCOUNT_JSON');
    return null;
  }

  try {
    const credential = JSON.parse(rawCredential);
    if (!credential?.project_id || !credential?.client_email || !credential?.private_key) {
      throw new Error('La credencial de Firebase no contiene los campos requeridos');
    }

    // Firebase Admin v14 reemplazó `admin.apps` por `getApps()`.
    // Usar la API actual evita que FCM falle al iniciar antes de intentar
    // enviar cualquier aviso.
    if (admin.getApps().length === 0) {
      admin.initializeApp({ credential: admin.credential.cert(credential) });
    }
    firebaseMessaging = admin.messaging();
  } catch (error) {
    logger.error('FCM inactivo: no se pudo inicializar Firebase Admin', {
      message: error.message,
    });
  }

  return firebaseMessaging;
}

function isInvalidRegistrationToken(error) {
  return [
    'messaging/invalid-registration-token',
    'messaging/registration-token-not-registered',
  ].includes(String(error?.code || ''));
}

/**
 * Aviso de pedido asignado. Es deliberadamente no bloqueante: un fallo de FCM
 * nunca puede impedir que se asigne un pedido ni que Socket.IO lo entregue a
 * una Rider que ya está abierta.
 */
async function sendRiderAssignmentPush(db, pedido) {
  const riderId = Number(pedido?.repartidor_id || 0);
  const pedidoId = Number(pedido?.id || 0);
  if (!riderId || !pedidoId) return { sent: false, reason: 'missing_assignment' };

  const messaging = getMessaging();
  if (!messaging) return { sent: false, reason: 'not_configured' };

  const rider = db.prepare('SELECT id, fcm_token FROM repartidores WHERE id = ?').get(riderId);
  const token = String(rider?.fcm_token || '').trim();
  if (!token) return { sent: false, reason: 'missing_token' };

  try {
    const messageId = await messaging.send({
      token,
      data: {
        type: 'pedido_asignado',
        pedidoId: String(pedidoId),
        title: 'Nuevo pedido asignado',
        // No exponer nombre, dirección ni importe en la pantalla bloqueada.
        body: `Pedido #${pedido.numero || pedidoId} listo para revisar`,
      },
      android: {
        priority: 'high',
      },
    });
    logger.info('FCM enviado a Rider', { pedidoId, riderId, messageId });
    return { sent: true, messageId };
  } catch (error) {
    if (isInvalidRegistrationToken(error)) {
      db.prepare(
        `UPDATE repartidores
         SET fcm_token = '', fcm_platform = '', fcm_actualizado_en = NULL
         WHERE id = ? AND fcm_token = ?`
      ).run(riderId, token);
    }
    logger.warn('No se pudo enviar FCM a Rider', {
      pedidoId,
      riderId,
      code: error?.code || '',
      invalidToken: isInvalidRegistrationToken(error),
    });
    return { sent: false, reason: 'send_failed' };
  }
}

async function sendRiderUpdatePush(db, update = {}) {
  const messaging = getMessaging();
  if (!messaging) return { sent: 0, reason: 'not_configured' };

  const riders = db
    .prepare("SELECT id, fcm_token FROM repartidores WHERE TRIM(COALESCE(fcm_token, '')) <> ''")
    .all();
  let sent = 0;

  for (const rider of riders) {
    const token = String(rider.fcm_token || '').trim();
    try {
      await messaging.send({
        token,
        notification: {
          title: 'Actualizá Modo Sabor Rider',
          body: `Ya está disponible la versión ${update.versionName || 'nueva'}`,
        },
        data: { type: 'rider_update', versionCode: String(update.versionCode || '') },
        android: { priority: 'high', notification: { channelId: 'rider-orders-v2' } },
      });
      sent += 1;
    } catch (error) {
      if (isInvalidRegistrationToken(error)) {
        db.prepare('UPDATE repartidores SET fcm_token = ?, fcm_platform = ? WHERE id = ?').run(
          '',
          '',
          rider.id
        );
      }
      logger.warn('No se pudo enviar aviso de actualización Rider', {
        riderId: rider.id,
        code: error?.code || '',
      });
    }
  }
  return { sent, total: riders.length };
}

module.exports = {
  getMessaging,
  sendRiderAssignmentPush,
  sendRiderUpdatePush,
};
