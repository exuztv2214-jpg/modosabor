const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const source = fs.readFileSync(path.join(root, 'server', 'routes', 'operacion.js'), 'utf8');
const pantalla = fs.readFileSync(
  path.join(root, 'client', 'src', 'pages', 'Operacion', 'index.jsx'),
  'utf8'
);

function run() {
  console.log('\nTests de Control diario');

  assert.ok(source.includes("hasPermission(req.user, 'dashboard.finanzas')"));
  assert.ok(source.includes("hasPermission(req.user, 'productos.edit')"));
  assert.ok(source.includes("hasPermission(req.user, 'delivery.view')"));
  assert.ok(source.includes('costoMercaderia'));
  assert.ok(source.includes('resultadoOperativo'));
  assert.ok(source.includes('coberturaCostos'));
  assert.ok(source.includes('validarLote'));
  assert.ok(pantalla.includes("hasPermission('dashboard.finanzas')"));
  assert.ok(pantalla.includes('Cobrado en efectivo'));
  assert.ok(pantalla.includes('No se pudo abrir Control diario'));

  if (process.env.NODE_ENV === 'test') {
    const db = require('../../db');
    const { buildDailyClose } = require('../../routes/operacion');
    const { hoyArgentina } = require('../../utils/fechaLocal');
    const numero = -9042026;
    let pedidoId = null;
    let movimientoEntrada = null;
    let movimientoSalida = null;
    try {
      pedidoId = db
        .prepare(
          `INSERT INTO pedidos
             (numero, items, subtotal, total, estado, tipo_entrega, metodo_pago, pago_estado, creado_en)
           VALUES (?, '[]', 100000, 100000, 'entregado', 'retiro', 'efectivo', 'pagado', CURRENT_TIMESTAMP)`
        )
        .run(numero).lastInsertRowid;
      db.prepare(
        `INSERT INTO pedido_items
           (pedido_id, nombre, cantidad, precio_unitario, costo_unitario, subtotal)
         VALUES (?, 'Producto control diario', 1, 100000, 40000, 100000)`
      ).run(pedidoId);
      movimientoEntrada = db
        .prepare(
          `INSERT INTO caja_movimientos (tipo, monto, motivo, creado_en)
           VALUES ('entrada', 20000, 'Prueba control diario', CURRENT_TIMESTAMP)`
        )
        .run().lastInsertRowid;
      movimientoSalida = db
        .prepare(
          `INSERT INTO caja_movimientos (tipo, monto, motivo, creado_en)
           VALUES ('salida', 10000, 'Prueba control diario', CURRENT_TIMESTAMP)`
        )
        .run().lastInsertRowid;

      const delivery = db
        .prepare(
          `SELECT COALESCE(SUM(p.monto_base), 0) AS total
             FROM personal p
            WHERE p.activo = 1
              AND lower(p.rol_operativo) = 'delivery'
              AND lower(p.frecuencia_pago) = 'diario'
              AND EXISTS (
                SELECT 1 FROM personal_asistencia a
                WHERE a.personal_id = p.id
                  AND a.fecha_operativa = ?
                  AND lower(a.estado) IN ('presente', 'tarde')
              )`
        )
        .get(hoyArgentina()).total;
      const cierre = buildDailyClose(hoyArgentina());
      const esperado =
        cierre.totalVentas +
        cierre.ingresosExtra -
        cierre.costoMercaderia -
        cierre.gastos -
        Number(delivery || 0);
      assert.strictEqual(cierre.resultadoOperativo, esperado);
      assert.ok(cierre.coberturaCostos >= 0 && cierre.coberturaCostos <= 100);
    } finally {
      if (movimientoEntrada) {
        db.prepare('DELETE FROM caja_movimientos WHERE id = ?').run(movimientoEntrada);
      }
      if (movimientoSalida) {
        db.prepare('DELETE FROM caja_movimientos WHERE id = ?').run(movimientoSalida);
      }
      if (pedidoId) {
        db.prepare('DELETE FROM pedido_items WHERE pedido_id = ?').run(pedidoId);
        db.prepare('DELETE FROM pedidos WHERE id = ?').run(pedidoId);
      }
    }
  }

  console.log('  OK permisos, resultado, cobertura, validación y recuperación');
}

if (require.main === module) run();
module.exports = { run };
