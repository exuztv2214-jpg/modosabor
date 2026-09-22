const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
assert.equal(process.env.ISOLATED_OPERATIONAL_TEST, '1');
const db = require('../db');
const { getJwtSecret } = require('../utils/authConfig');
const { createPedidoRecord } = require('../services/pedidoService');

async function main() {
  const admin = db.prepare("SELECT id,token_version FROM usuarios WHERE rol='admin' LIMIT 1").get();
  const token = jwt.sign({ id: admin.id, tv: admin.token_version || 0 }, getJwtSecret());
  const pedido = createPedidoRecord({
    items: [],
    subtotal: 0,
    total: 0,
    tipo_entrega: 'retiro',
    origen: 'web',
  });
  async function print(body = { tipo: 'tpv_pack', automatica: true }) {
    const r = await fetch(
      `http://127.0.0.1:${process.env.PORT}/api/pedidos/${pedido.id}/imprimir`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    return { status: r.status, data: await r.json() };
  }
  // Un fallo al registrar no debe consumir el reclamo automático.
  db.exec(
    `CREATE TRIGGER audit_fail_print BEFORE INSERT ON impresiones BEGIN SELECT RAISE(ABORT, 'Fallo ficticio impresión'); END`
  );
  try {
    assert.equal((await print()).status, 500);
    assert.equal(
      db.prepare('SELECT COUNT(*) n FROM impresiones_automaticas WHERE pedido_id=?').get(pedido.id)
        .n,
      0
    );
  } finally {
    db.exec('DROP TRIGGER audit_fail_print');
  }
  const responses = await Promise.all(Array.from({ length: 6 }, () => print()));
  assert(responses.every((r) => r.status === 200));
  assert.equal(responses.filter((r) => r.data.html).length, 1, 'Un solo destinatario recibe HTML');
  assert.equal(responses.filter((r) => r.data.omitida).length, 5);
  assert.equal(
    db.prepare('SELECT COUNT(*) n FROM impresiones WHERE pedido_id=?').get(pedido.id).n,
    1
  );
  assert.equal((await print()).data.omitida, true, 'El reclamo no vence por reintento');
  for (let i = 0; i < 2; i++) {
    assert((await print({ tipo: 'tpv_pack' })).data.html, 'Reimpresión manual disponible');
  }
  assert.equal(
    db.prepare('SELECT COUNT(*) n FROM impresiones WHERE pedido_id=?').get(pedido.id).n,
    3
  );
  assert.equal((await print({ tipo: 'ticket_cliente', automatica: true })).status, 400);
  console.log(
    'OK: seis despachos simultáneos producen un solo pack; fallo revierte reclamo; reintentos omitidos y reimpresión manual conservada'
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.close());
