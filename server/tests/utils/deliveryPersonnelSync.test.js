const assert = require('assert');
const Database = require('better-sqlite3');
const { syncPersonalFromDeliveryRepartidor } = require('../../utils/deliveryPersonnelSync');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE repartidores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id INTEGER,
    nombre TEXT,
    telefono TEXT DEFAULT '',
    vehiculo TEXT DEFAULT '',
    activo INTEGER DEFAULT 1,
    disponible INTEGER DEFAULT 1,
    codigo_acceso TEXT DEFAULT '',
    zona_preferida TEXT DEFAULT '',
    direccion TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    notas TEXT DEFAULT '',
    fecha_ingreso TEXT DEFAULT ''
  );
  CREATE TABLE personal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    rol_operativo TEXT,
    telefono TEXT DEFAULT '',
    direccion TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    notas TEXT DEFAULT '',
    fecha_ingreso TEXT DEFAULT '',
    activo INTEGER DEFAULT 1,
    turno_preferido TEXT DEFAULT '',
    frecuencia_pago TEXT DEFAULT '',
    monto_base INTEGER DEFAULT 0,
    medio_pago_preferido TEXT DEFAULT '',
    categoria_id INTEGER,
    clock_pin TEXT DEFAULT '',
    actualizado_en TEXT
  );
`);

const riderId = db
  .prepare("INSERT INTO repartidores (nombre, telefono) VALUES ('Rider prueba', '3810000000')")
  .run().lastInsertRowid;

syncPersonalFromDeliveryRepartidor(db, {
  id: riderId,
  nombre: 'Rider prueba',
  telefono: '3810000000',
  turno_preferido: 'manana',
  activo: 1,
});

let personal = db.prepare('SELECT * FROM personal WHERE telefono = ?').get('3810000000');
assert.strictEqual(personal.turno_preferido, 'manana', 'el alta debe conservar el turno elegido');
assert.strictEqual(personal.rol_operativo, 'delivery');

syncPersonalFromDeliveryRepartidor(db, {
  id: riderId,
  personal_id: personal.id,
  nombre: 'Rider prueba',
  telefono: '3810000000',
  turno_preferido: 'doble',
  activo: 1,
});

personal = db.prepare('SELECT * FROM personal WHERE id = ?').get(personal.id);
assert.strictEqual(personal.turno_preferido, 'doble', 'la edición debe actualizar el turno');

db.close();
console.log('deliveryPersonnelSync.test.js OK');
