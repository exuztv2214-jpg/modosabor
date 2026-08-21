const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../../db/migrations');
const { crearCarritoWhatsapp } = require('../../services/carritoWhatsapp');
const { quoteProduct } = require('../../utils/systemClient');

function crearBase() {
  const db = new Database(':memory:');
  const schema = fs.readFileSync(path.join(__dirname, '../../db/schema.sql'), 'utf8');
  const indexes = [];
  const tables = schema.replace(
    /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\b[\s\S]*?;\s*$/gim,
    (statement) => {
      indexes.push(statement);
      return '';
    }
  );
  db.exec(tables);
  runMigrations(db);
  db.exec(indexes.join('\n'));
  db.prepare(
    `INSERT INTO productos (nombre, precio, variantes, extras, activo, stock_directo)
     VALUES (?, ?, '[]', '[]', 1, 50), (?, ?, '[]', '[]', 1, 50)`
  ).run('Prueba carrito alfa', 500000, 'Prueba carrito beta', 700000);
  return db;
}

function productoSimple(db, excluirId = 0) {
  return db
    .prepare(
      `SELECT id, nombre, precio FROM productos
       WHERE activo = 1 AND precio > 0 AND id != ?
         AND COALESCE(variantes, '[]') = '[]'
         AND COALESCE(extras, '[]') = '[]'
       ORDER BY id LIMIT 1`
    )
    .get(excluirId);
}

function run() {
  const db = crearBase();
  try {
    const telefono = '5493815550199';
    const primero = productoSimple(db);
    const segundo = productoSimple(db, primero.id);
    assert.ok(primero && segundo, 'La semilla debe incluir dos productos simples cotizables');

    const precioPrimero = quoteProduct(db, primero.nombre).price_total;
    const precioSegundo = quoteProduct(db, segundo.nombre).price_total;
    assert.ok(precioPrimero >= 10000 && precioSegundo >= 10000, 'Los precios están en centavos');

    const carrito = crearCarritoWhatsapp(db);
    const agregadoUno = carrito.agregarItem(telefono, {
      producto_id: primero.id,
      cantidad: 1,
      precio_unitario: 1,
    });
    const agregadoDos = carrito.agregarItem(telefono, {
      producto_id: segundo.id,
      cantidad: 1,
      precio_unitario: 1,
    });

    assert.strictEqual(agregadoDos.carrito.items.length, 2);
    assert.strictEqual(agregadoDos.carrito.subtotal, precioPrimero + precioSegundo);
    assert.strictEqual(agregadoDos.carrito.total, precioPrimero + precioSegundo);
    assert.strictEqual(
      agregadoDos.carrito.items.find((item) => item.producto_id === primero.id).precio_unitario,
      precioPrimero,
      'El precio enviado por el modelo debe ignorarse'
    );

    const sinSegundo = carrito.quitarItem(telefono, agregadoDos.itemId);
    assert.strictEqual(sinSegundo.items.length, 1);
    assert.strictEqual(sinSegundo.total, precioPrimero);

    const modificado = carrito.modificarItem(telefono, agregadoUno.itemId, { cantidad: 3 });
    assert.strictEqual(modificado.items[0].cantidad, 3);
    assert.strictEqual(modificado.total, precioPrimero * 3);

    const distintaNota = carrito.agregarItem(telefono, {
      producto_id: primero.id,
      cantidad: 1,
      notas: 'sin sal',
    });
    assert.strictEqual(distintaNota.carrito.items.length, 2, 'Unidades diferentes van separadas');

    const datosActualizados = carrito.actualizarDatos(telefono, {
      cliente_nombre: 'Nombre declarado',
      cliente_direccion: 'Dirección 123',
      metodo_pago: 'transferencia',
      notas: 'timbre negro',
    });
    assert.strictEqual(datosActualizados.cliente_nombre, 'Nombre declarado');
    assert.strictEqual(datosActualizados.cliente_direccion, 'Dirección 123');
    assert.strictEqual(datosActualizados.metodo_pago, 'transferencia');

    db.pragma('foreign_keys = OFF');
    db.prepare(
      "UPDATE whatsapp_pedidos_borrador SET pedido_id = 999, estado = 'confirmado' WHERE telefono = ?"
    ).run(telefono);
    db.pragma('foreign_keys = ON');
    assert.throws(
      () => carrito.modificarItem(telefono, agregadoUno.itemId, { cantidad: 2 }),
      /carrito/
    );
    assert.throws(() => carrito.quitarItem(telefono, agregadoUno.itemId), /carrito/);

    console.log('carritoWhatsapp.test.js OK');
  } finally {
    db.close();
  }
}

if (require.main === module) run();

module.exports = { run };
