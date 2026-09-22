const assert = require('node:assert/strict');
assert.equal(process.env.ISOLATED_OPERATIONAL_TEST, '1', 'Requiere base ficticia aislada');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { getJwtSecret } = require('../utils/authConfig');
const { phoneKey } = require('../utils/clienteDuplicates');

async function main() {
  db.prepare("UPDATE configuracion SET valor=? WHERE clave='turnos_negocio'").run(
    JSON.stringify([{ id: 'test', nombre: 'Prueba', desde: '00:00', hasta: '23:59', activo: true }])
  );
  require('../utils/operationalCaja').ensureOperationalCaja(db, { actor_nombre: 'Prueba' });
  const product = require('./verification-product')(db);
  const cliente = Number(
    db
      .prepare(
        "INSERT INTO clientes(nombre,telefono,direccion) VALUES ('Nombre original','+54 9 (381) 555.0789','Domicilio original')"
      )
      .run().lastInsertRowid
  );
  const protectedId = Number(
    db.prepare("INSERT INTO clientes(nombre,telefono) VALUES ('Otra ficha','5493815550790')").run()
      .lastInsertRowid
  );
  const original = db.prepare('SELECT * FROM clientes WHERE id=?').get(cliente);
  const other = db.prepare('SELECT * FROM clientes WHERE id=?').get(protectedId);
  const base = {
    cliente_nombre: 'Nombre declarado en pedido',
    cliente_telefono: '5493815550789',
    tipo_entrega: 'retiro',
    metodo_pago: 'efectivo',
    items: [{ producto_id: product.id, nombre: product.nombre, cantidad: 1, precio_unitario: 1 }],
  };
  async function post(path, body, token) {
    const r = await fetch(`http://127.0.0.1:${process.env.PORT}/api${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json() };
  }
  for (const origen of [undefined, 'web', 'tpv', 'interno', 'mozo', 'caja', 'whatsapp', 'kiosco']) {
    const r = await post('/pedidos', {
      ...base,
      origen,
      cliente_id: protectedId,
      descuento: 4999,
      repartidor_id: 999,
      pago_detalle: '{"estado":"pagado"}',
    });
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.equal(r.data.total, 5000);
    assert.equal(r.data.pago_estado, 'pendiente');
    assert.equal(r.data.origen, origen === 'kiosco' ? 'kiosco' : 'web');
    assert.equal(
      db.prepare('SELECT cliente_id FROM pedidos WHERE id=?').get(r.data.id).cliente_id,
      cliente
    );
  }
  for (const id of [cliente, protectedId]) {
    const actual = db.prepare('SELECT * FROM clientes WHERE id=?').get(id);
    const expected = id === cliente ? original : other;
    for (const field of ['nombre', 'telefono', 'direccion']) {
      assert.equal(actual[field], expected[field]);
    }
  }
  assert.equal(
    db
      .prepare('SELECT telefono FROM clientes')
      .all()
      .filter((r) => phoneKey(r.telefono) === phoneKey(base.cliente_telefono)).length,
    1
  );
  const fidelity = require('../services/fidelizacionService');
  fidelity.updateConfig({ ...fidelity.getConfig(), activo: 1, minimo_canje: 1 });
  fidelity.registrarAjusteManualPuntos(protectedId, 100, 'Saldo ficticio');
  const count = db.prepare('SELECT COUNT(*) n FROM pedidos').get().n;
  for (const path of ['/pedidos', '/pedidos/checkout/mercadopago']) {
    assert.equal(
      (await post(path, { ...base, cliente_id: protectedId, puntos_a_canjear: 50 })).status,
      400
    );
  }
  assert.equal(fidelity.getSaldoPuntos(protectedId), 100);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM pedidos').get().n, count);
  assert.equal((await post('/pedidos', { ...base, tipo_entrega: 'mesa' })).status, 400);
  assert.equal((await post('/pedidos', { ...base, metodo_pago: 'inventado' })).status, 400);
  assert.equal((await post('/pedidos/interno', { ...base, origen: 'tpv' })).status, 401);

  // La restricción pública no elimina precios manuales del TPV autenticado.
  const admin = db.prepare("SELECT id,token_version FROM usuarios WHERE rol='admin' LIMIT 1").get();
  const token = jwt.sign({ id: admin.id, tv: admin.token_version || 0 }, getJwtSecret());
  const internal = await post(
    '/pedidos/interno',
    {
      ...base,
      origen: 'tpv',
      items: JSON.stringify([{ ...base.items[0], precio_unitario: 5000 }]),
      descuento: 1000,
    },
    token
  );
  assert.equal(internal.status, 200, JSON.stringify(internal));
  assert.equal(internal.data.total, 4000);
  assert.equal(internal.data.origen, 'tpv');

  db.prepare(
    "INSERT INTO cupones(codigo,tipo_descuento,valor_descuento,limite_por_cliente) VALUES ('AUDIT10','porcentaje',10,10)"
  ).run();
  const coupon = await post('/pedidos', { ...base, cupon_codigo: 'AUDIT10', descuento: 4999 });
  assert.equal(coupon.status, 200, JSON.stringify(coupon));
  assert.equal(coupon.data.total, 4500, 'Se conserva el cupón calculado por servidor');
  const variants = await post('/pedidos', {
    ...base,
    items: [{ producto_id: 3, nombre: 'Hamburguesa de prueba', cantidad: 1 }],
  });
  assert.equal(variants.status, 400, 'No omitir variantes obligatorias');

  const { createPublicPedidoSchema } = require('../schemas');
  const clean = createPublicPedidoSchema.parse({
    ...base,
    origen: 'tpv',
    cliente_id: protectedId,
    descuento: 999,
  });
  assert.equal(clean.origen, 'web');
  assert.equal(clean.descuento, 0);
  assert.equal(clean.cliente_id, undefined);
  console.log(
    'OK: público fuerza catálogo/pago pendiente, no altera fichas ni canjea puntos; identidad normalizada y TPV autorizado conservado'
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.close());
