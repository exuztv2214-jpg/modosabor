/*
 * Retira la flota anterior sin destruir el historial de pedidos ni de Personal.
 *
 * Sin --aplicar sólo informa. Al aplicar crea un backup consistente de SQLite,
 * desasigna pedidos todavía abiertos y desactiva riders y Personal delivery.
 */
const db = require('../db');
const { createDatabaseBackup } = require('../utils/backupManager');

const aplicar = process.argv.includes('--aplicar');

const riders = db
  .prepare(
    `SELECT r.id, r.nombre, r.activo, r.disponible, r.personal_id,
            p.nombre AS personal_nombre, p.activo AS personal_activo,
            p.turno_preferido
     FROM repartidores r
     LEFT JOIN personal p ON p.id = r.personal_id
     ORDER BY r.nombre COLLATE NOCASE, r.id`
  )
  .all();

const personalDelivery = db
  .prepare(
    `SELECT id, nombre, activo, turno_preferido
     FROM personal
     WHERE rol_operativo = 'delivery'
     ORDER BY nombre COLLATE NOCASE, id`
  )
  .all();

const pedidosAbiertos = db
  .prepare(
    `SELECT id, numero, estado, repartidor_id, repartidor_nombre
     FROM pedidos
     WHERE repartidor_id IS NOT NULL
       AND estado NOT IN ('entregado', 'cancelado')
     ORDER BY id`
  )
  .all();

console.log(
  JSON.stringify(
    {
      aplicar,
      riders,
      personal_delivery: personalDelivery,
      pedidos_abiertos_a_desasignar: pedidosAbiertos,
    },
    null,
    2
  )
);

if (!aplicar) process.exit(0);

if (!riders.length && !personalDelivery.some((item) => Number(item.activo) === 1)) {
  console.log('No hay riders anteriores para retirar.');
  process.exit(0);
}

const backup = createDatabaseBackup(db, {
  reason: 'antes-retirar-riders-anteriores',
  maxFiles: 20,
});

db.transaction(() => {
  db.prepare(
    `UPDATE pedidos
     SET repartidor_id = NULL, repartidor_nombre = '', actualizado_en = CURRENT_TIMESTAMP
     WHERE repartidor_id IS NOT NULL
       AND estado NOT IN ('entregado', 'cancelado')`
  ).run();

  db.prepare(
    `UPDATE repartidores
     SET activo = 0, disponible = 0, latitud = NULL, longitud = NULL,
         ultima_ubicacion_en = NULL, fcm_token = '', fcm_platform = '',
         fcm_device_id = '', fcm_device_label = '', fcm_permission = '',
         fcm_actualizado_en = NULL`
  ).run();

  db.prepare(
    `UPDATE personal
     SET activo = 0, actualizado_en = CURRENT_TIMESTAMP
     WHERE rol_operativo = 'delivery'`
  ).run();
})();

const verificacion = {
  riders_activos: db.prepare('SELECT COUNT(*) AS total FROM repartidores WHERE activo = 1').get()
    .total,
  personal_delivery_activo: db
    .prepare(
      "SELECT COUNT(*) AS total FROM personal WHERE rol_operativo = 'delivery' AND activo = 1"
    )
    .get().total,
  pedidos_abiertos_asignados: db
    .prepare(
      `SELECT COUNT(*) AS total FROM pedidos
       WHERE repartidor_id IS NOT NULL AND estado NOT IN ('entregado', 'cancelado')`
    )
    .get().total,
};

console.log(JSON.stringify({ backup, verificacion }, null, 2));

if (Object.values(verificacion).some((value) => Number(value) !== 0)) {
  throw new Error('La verificación final encontró riders o pedidos abiertos todavía asignados');
}
