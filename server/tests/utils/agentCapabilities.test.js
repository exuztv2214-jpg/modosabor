const assert = require('assert');
const db = require('../../db');
const { getCurrentOrderSnapshot } = require('../../utils/systemClient');

function run() {
  console.log('\nTests de capacidades posventa del agente');

  assert.deepStrictEqual(getCurrentOrderSnapshot(db, '000000000000000'), {
    encontrado: false,
    mensaje: 'No encontré pedidos activos o recientes para este teléfono.',
  });

  const phone = '5493819998811';
  const savepoint = 'test_agent_capabilities';
  db.exec(`SAVEPOINT ${savepoint}`);
  try {
    const result = db
      .prepare(
        `INSERT INTO pedidos
          (numero, cliente_nombre, cliente_telefono, cliente_direccion, tipo_entrega,
           estado, subtotal, total, origen, metodo_pago, items)
         VALUES (?, 'Cliente Prueba', ?, 'Dirección Prueba', 'delivery',
                 'preparando', 100000, 100000, 'whatsapp', 'efectivo', '[]')`
      )
      .run(`TEST-${Date.now()}`, phone);
    const snapshot = getCurrentOrderSnapshot(db, phone);
    assert.strictEqual(snapshot.encontrado, true);
    assert.strictEqual(snapshot.pedido.id, Number(result.lastInsertRowid));
    assert.strictEqual(snapshot.pedido.estado_texto, 'en preparación');
    console.log('  ✓ consulta el estado real del último pedido');
  } finally {
    db.exec(`ROLLBACK TO ${savepoint}`);
    db.exec(`RELEASE ${savepoint}`);
  }
  console.log('✅ Capacidades posventa verificadas\n');
}

module.exports = { run };
