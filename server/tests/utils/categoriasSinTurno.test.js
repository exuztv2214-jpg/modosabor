const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../../db/migrations');

/*
  El turno de la categoría nació para la web y terminó bloqueando la caja: al
  mediodía no se podía vender ni una bebida. La migración suelta ese candado,
  salvo en el menú del día, que tiene precio propio de ese servicio y una regla
  aparte en el backend.
*/
function crearBase() {
  const db = new Database(':memory:');
  const schema = fs.readFileSync(path.join(__dirname, '../../db/schema.sql'), 'utf8');
  db.exec(schema.replace(/^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\b[\s\S]*?;\s*$/gim, ''));
  // `menu_dia_base` la agrega una migración, y acá hace falta antes para poder
  // sembrar el caso que se quiere probar.
  db.exec('ALTER TABLE productos ADD COLUMN menu_dia_base INTEGER DEFAULT 0');
  return db;
}

function run() {
  console.log('\nTests de categorías atadas al turno');
  const db = crearBase();
  try {
    db.prepare(
      "INSERT INTO categorias (id, nombre, turno_id) VALUES (1, 'Empanadas', 'noche')"
    ).run();
    db.prepare(
      "INSERT INTO categorias (id, nombre, turno_id) VALUES (2, 'Bebidas', 'noche')"
    ).run();
    db.prepare(
      "INSERT INTO categorias (id, nombre, turno_id) VALUES (3, 'Menu del Dia', 'manana')"
    ).run();
    db.prepare("INSERT INTO categorias (id, nombre, turno_id) VALUES (4, 'Pastas', '')").run();
    // Lo que distingue al menú del día son sus platos, no su nombre.
    db.prepare(
      "INSERT INTO productos (nombre, precio, categoria_id, menu_dia_base) VALUES ('Suprema', 700000, 3, 1)"
    ).run();
    db.prepare(
      "INSERT INTO productos (nombre, precio, categoria_id, menu_dia_base) VALUES ('Docena', 900000, 1, 0)"
    ).run();

    runMigrations(db);

    const turno = (nombre) =>
      db.prepare('SELECT turno_id FROM categorias WHERE nombre = ?').get(nombre)?.turno_id;

    assert.strictEqual(
      turno('Empanadas'),
      '',
      'las empanadas tienen que venderse en los dos turnos'
    );
    assert.strictEqual(
      turno('Bebidas'),
      '',
      'no poder vender una bebida al mediodía era el síntoma'
    );
    assert.strictEqual(turno('Pastas'), '', 'las que ya estaban libres siguen igual');
    assert.strictEqual(
      turno('Menu del Dia'),
      'manana',
      'el menú del día se queda a la mañana: su precio es el de ese servicio'
    );
    console.log('  ✓ suelta las categorías del turno y deja el menú del día a la mañana');

    // Una segunda corrida no puede pisar lo que el dueño cambie después.
    db.prepare("UPDATE categorias SET turno_id = 'noche' WHERE nombre = 'Empanadas'").run();
    runMigrations(db);
    assert.strictEqual(
      turno('Empanadas'),
      'noche',
      'si después se ata una categoría a mano, la migración no la vuelve a soltar'
    );
    console.log('  ✓ corre una sola vez: no pisa una decisión posterior');

    console.log('✅ Categorías y turnos verificados');
  } finally {
    db.close();
  }
}

if (require.main === module) run();

module.exports = { run };
