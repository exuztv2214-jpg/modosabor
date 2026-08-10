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
const turnos = [
  ['Cristian Galvan', 'noche'],
  ['Mathias Gonzalez', 'manana'],
  ['Ivan Lopez', 'manana'],
];

const estado = turnos.map(([nombre, turno]) => {
  const personal = db
    .prepare(
      'SELECT id, nombre, turno_preferido FROM personal WHERE lower(trim(nombre)) = lower(?)'
    )
    .get(nombre);
  return {
    nombre,
    turno,
    encontrado: Boolean(personal),
    anterior: personal?.turno_preferido || '',
  };
});

if (!aplicar) {
  console.log(JSON.stringify({ aplicar: false, cambios: estado }, null, 2));
  process.exit(0);
}

const faltantes = estado.filter((item) => !item.encontrado);
if (faltantes.length) {
  throw new Error(`No se encontraron: ${faltantes.map((item) => item.nombre).join(', ')}`);
}

const backup = createDatabaseBackup(db, { reason: 'antes-turnos-delivery-agosto-2026' });
const actualizar = db.prepare(
  'UPDATE personal SET turno_preferido = ?, actualizado_en = CURRENT_TIMESTAMP WHERE lower(trim(nombre)) = lower(?)'
);
db.transaction(() => turnos.forEach(([nombre, turno]) => actualizar.run(turno, nombre)))();

console.log(JSON.stringify({ backup, cambios: estado }, null, 2));
