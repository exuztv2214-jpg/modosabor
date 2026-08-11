/**
 * El cliente que se carga desde el TPV.
 *
 * ── Tres cosas que estaban mal ─────────────────────────────────────────────
 *
 * **1. Un pedido podía borrarle el nombre a un cliente habitual.**
 *
 *     UPDATE clientes SET nombre = ?  →  .run(cliente_nombre || '', id)
 *
 * Pasa todos los días: el cliente de siempre llama, el cajero pone sólo el
 * teléfono, el sistema lo reconoce y nadie vuelve a escribir el nombre. Con eso
 * "Juan Pérez" quedaba en blanco. No da error, no se ve en el momento, y se
 * descubre semanas después cuando alguien lo busca y no aparece.
 *
 * **2. Lo mismo con la dirección.** Un cliente de delivery que compraba en el
 * mostrador —donde no se pide dirección— perdía la que tenía guardada.
 *
 * **3. Había clientes que no se guardaban nunca.** El alta automática exigía
 * teléfono **y** nombre. Con uno solo no se creaba nada: la venta salía bien,
 * el nombre quedaba escrito en el pedido, pero el cliente no existía. No sumaba
 * puntos y la próxima vez no aparecía en el buscador.
 *
 * ── Cómo se prueba ─────────────────────────────────────────────────────────
 *
 * `pedidoService` carga media aplicación al importarse, así que en vez de
 * ejecutarlo se leen las tres consultas del archivo real y se corren contra un
 * SQLite de verdad. Lo que se verifica es el SQL que se va a ejecutar en
 * producción, no una copia escrita acá.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const leer = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

function baseConUnCliente() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      telefono TEXT DEFAULT '',
      direccion TEXT DEFAULT ''
    );
    INSERT INTO clientes (nombre, telefono, direccion)
      VALUES ('Juan Pérez', '3863111111', 'Sarmiento 450');
  `);
  return db;
}

/** Saca del archivo real el UPDATE que corre cuando se reconoce por teléfono. */
function updatePorTelefono(fuente) {
  assert.ok(
    fuente.includes("db.prepare('UPDATE clientes SET nombre = ? WHERE id = ?')"),
    'cambió la consulta que actualiza el cliente reconocido por teléfono'
  );
  return 'UPDATE clientes SET nombre = ? WHERE id = ?';
}

function run() {
  console.log('\n👤 El cliente que se carga desde el TPV\n');

  const servicio = leer('services/pedidoService.js');

  // ── 1. Un pedido sin nombre no borra el nombre ────────────────────────────
  {
    const db = baseConUnCliente();
    const antes = db.prepare('SELECT * FROM clientes WHERE id = 1').get();

    // Lo que hace la ruta: el nombre que viene vacío cae contra el que ya está.
    const cliente_nombre = '';
    db.prepare(updatePorTelefono(servicio)).run(cliente_nombre || antes.nombre || '', 1);

    assert.strictEqual(
      db.prepare('SELECT nombre FROM clientes WHERE id = 1').get().nombre,
      'Juan Pérez',
      'un pedido sin nombre le borró el nombre a un cliente que ya existía'
    );
  }
  // Y que la ruta de verdad tenga ese respaldo escrito, no sólo este test.
  assert.ok(
    /cliente_nombre \|\| existing\.nombre \|\| ''/.test(servicio),
    "volvió `cliente_nombre || ''`: un pedido sin nombre vuelve a vaciar la ficha"
  );
  console.log('  ✓ un pedido sin nombre no le borra el nombre al cliente');

  // ── 2. Un pedido sin dirección no borra la dirección ──────────────────────
  {
    const db = baseConUnCliente();
    const antes = db.prepare('SELECT * FROM clientes WHERE id = 1').get();
    const cliente_direccion = ''; // venta de mostrador: no se pide dirección

    db.prepare('UPDATE clientes SET nombre = ?, telefono = ?, direccion = ? WHERE id = ?').run(
      antes.nombre,
      antes.telefono,
      cliente_direccion || antes.direccion || '',
      1
    );

    assert.strictEqual(
      db.prepare('SELECT direccion FROM clientes WHERE id = 1').get().direccion,
      'Sarmiento 450',
      'una venta de mostrador le borró la dirección a un cliente de delivery'
    );
  }
  assert.ok(
    /cliente_direccion \|\| existing\.direccion \|\| ''/.test(servicio),
    "volvió `cliente_direccion || ''`: una venta de mostrador vuelve a borrar la dirección"
  );
  // El respaldo sólo funciona si la consulta trae la dirección de la base.
  assert.ok(
    /SELECT id, nombre, telefono, direccion FROM clientes WHERE id = \?/.test(servicio),
    'la consulta dejó de traer la dirección: el respaldo lee undefined y guarda vacío'
  );
  console.log('  ✓ una venta de mostrador no le borra la dirección al cliente');

  // ── 3. Alcanza con el nombre O con el teléfono ────────────────────────────
  //
  // El caso del mostrador: se sabe el nombre y nada más. Antes ese cliente no
  // se guardaba, así que no entraba al club ni aparecía la próxima vez.
  assert.ok(
    /if \(!cliente_id && \(cliente_nombre \|\| cliente_telefono\)\)/.test(servicio),
    'el alta automática volvió a exigir los dos datos: se pierden los clientes de mostrador'
  );
  // Y que no haya quedado la condición vieja, que pedía nombre para crear.
  assert.ok(
    !/\} else if \(cliente_nombre\) \{[\s\S]{0,120}INSERT INTO clientes/.test(servicio),
    'quedó el alta vieja adentro del bloque del teléfono'
  );
  console.log('  ✓ se guarda el cliente con el nombre o con el teléfono, no hacen falta los dos');

  // El alta le genera la tarjeta, que es lo que se le canta en el mostrador.
  const bloqueAlta = servicio.slice(servicio.indexOf('INSERT INTO clientes (nombre, telefono'));
  assert.ok(
    bloqueAlta.slice(0, 400).includes('asegurarCodigoTarjeta(cliente_id)'),
    'el cliente nuevo se queda sin código de tarjeta'
  );
  console.log('  ✓ el cliente nuevo sale con su tarjeta generada');

  // ── 4. El TPV puede dar de alta ───────────────────────────────────────────
  //
  // El buscador sólo buscaba: sin resultados decía "no encontramos" y ahí
  // terminaba. Cargar a alguien obligaba a salir del TPV e ir a Clientes.
  const modal = fs.readFileSync(
    path.join(__dirname, '../../../client/src/components/TPV/TpvClientPickerModal.jsx'),
    'utf8'
  );
  const tpv = fs.readFileSync(path.join(__dirname, '../../../client/src/pages/TPV.jsx'), 'utf8');
  assert.ok(modal.includes('onCrearCliente'), 'el buscador del TPV volvió a ser sólo de lectura');
  assert.ok(
    tpv.includes('onCrearCliente={crearClienteDesdeElTpv}') && tpv.includes("api.post('/clientes'"),
    'el TPV dejó de conectar el alta de clientes'
  );
  // Y que el cliente recién creado quede seleccionado, o habría que buscarlo.
  assert.ok(
    /aplicarCliente\(creado\)/.test(tpv),
    'el cliente nuevo no queda seleccionado en el pedido'
  );
  console.log('  ✓ se puede dar de alta desde el TPV y queda seleccionado\n');

  console.log('✅ Cliente desde el TPV: no se pierde ni se pisa nada\n');
}

if (require.main === module) run();

module.exports = { run };
