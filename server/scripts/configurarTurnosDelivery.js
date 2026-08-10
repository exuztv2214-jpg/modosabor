/*
 * Configuración operativa acordada para Modo Sabor.
 *
 * Sólo escribe con --apply para que pueda revisarse antes de correrla en una
 * base productiva. Los turnos se guardan en Personal, que es la fuente de
 * verdad de los repartidores vinculados.
 */
const db = require('../db');
const { createDatabaseBackup } = require('../utils/backupManager');

const aplicar = process.argv.includes('--apply');
const deliveries = db
  .prepare(
    "SELECT id, nombre, turno_preferido FROM personal WHERE rol_operativo = 'delivery' AND activo = 1 ORDER BY nombre COLLATE NOCASE"
  )
  .all();
const estado = deliveries.map((personal) => {
  const nombre = String(personal.nombre || '').trim();
  const turno = nombre.toLowerCase() === 'cristian galvan' ? 'noche' : 'manana';
  return {
    nombre,
    turno,
    anterior: personal?.turno_preferido || '',
  };
});

if (!aplicar) {
  console.log(JSON.stringify({ aplicar: false, cambios: estado }, null, 2));
  process.exit(0);
}

if (!estado.length) {
  throw new Error('No hay repartidores activos vinculados a Personal');
}

const backup = createDatabaseBackup(db, { reason: 'antes-turnos-delivery-agosto-2026' });
const actualizar = db.prepare(
  'UPDATE personal SET turno_preferido = ?, actualizado_en = CURRENT_TIMESTAMP WHERE lower(trim(nombre)) = lower(?)'
);
db.transaction(() => estado.forEach(({ nombre, turno }) => actualizar.run(turno, nombre)))();

console.log(JSON.stringify({ backup, cambios: estado }, null, 2));
