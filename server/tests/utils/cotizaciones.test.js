const assert = require('assert');

const db = require('../../db');
const {
  actualizarCotizacion,
  crearCotizacion,
  normalizarCotizacion,
} = require('../../services/cotizacionesService');

function payload(overrides = {}) {
  return {
    cliente_empresa: 'Empresa de prueba',
    fecha_emision: '2026-08-27',
    validez_dias: 7,
    estado: 'borrador',
    condiciones_pago: 'A coordinar',
    items: [
      {
        descripcion: 'Menu del dia completo',
        detalle: 'Menu, bebida y postre',
        cantidad: 30,
        precio_unitario: 800000,
      },
    ],
    ...overrides,
  };
}

function run() {
  const normalizada = normalizarCotizacion(payload());
  assert.strictEqual(normalizada.subtotal, 24000000);
  assert.strictEqual(normalizada.total, 24000000);
  assert.strictEqual(normalizada.items[0].subtotal, 24000000);

  assert.throws(() => normalizarCotizacion(payload({ cliente_empresa: '' })), /empresa o cliente/i);
  assert.throws(
    () =>
      normalizarCotizacion(
        payload({ items: [{ descripcion: 'Menu', cantidad: 0, precio_unitario: 1 }] })
      ),
    /mayor a cero/i
  );

  const creada = crearCotizacion(db, payload());
  assert.match(creada.numero, /^COT-2026-\d{5}$/);
  assert.strictEqual(creada.items.length, 1);
  assert.strictEqual(creada.total, 24000000);

  const actualizada = actualizarCotizacion(
    db,
    creada.id,
    payload({
      estado: 'enviada',
      descuento: 100000,
    })
  );
  assert.strictEqual(actualizada.estado, 'enviada');
  assert.strictEqual(actualizada.total, 23900000);
  assert.strictEqual(actualizada.items.length, 1);

  db.prepare('DELETE FROM cotizaciones WHERE id = ?').run(creada.id);
  console.log('  ✓ Cotizaciones: cálculo servidor, numeración, persistencia y edición');
}

if (require.main === module) run();

module.exports = { run };
