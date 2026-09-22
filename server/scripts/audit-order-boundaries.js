// Diagnóstico: nunca ejecutar sobre una base operativa.
const assert = require('assert');
assert.strictEqual(process.env.ISOLATED_OPERATIONAL_TEST, '1');
const db = require('../db');
const { getProducts, quoteProduct } = require('../utils/systemClient');
const { filtrarCatalogo } = require('../utils/catalogVisibility');
const { buildPedidoPayload } = require('../services/pedidoService');

async function main() {
  db.prepare("UPDATE configuracion SET valor=? WHERE clave='turnos_negocio'").run(
    JSON.stringify([
      { id: 'audit-dia', nombre: 'Día ficticio', desde: '00:00', hasta: '23:59', activo: true },
    ])
  );
  const product = require('./verification-product')(db);
  const base = {
    cliente_nombre: 'Cliente ficticio auditoría',
    cliente_telefono: '5493815550107',
    tipo_entrega: 'retiro',
    metodo_pago: 'efectivo',
    origen: 'web',
    items: [
      { producto_id: product.id, nombre: product.nombre, cantidad: 1, precio_unitario: 5000 },
    ],
  };
  async function order(body) {
    const r = await fetch(`http://127.0.0.1:${process.env.PORT}/api/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    return {
      status: r.status,
      id: data.id,
      total: data.total,
      origen: data.origen,
      pago_estado: data.pago_estado,
      error: data.error,
    };
  }
  db.prepare('INSERT INTO clientes(nombre,telefono) VALUES (?,?)').run(
    base.cliente_nombre,
    '+54 9 381 555 0107'
  );
  const normal = await order(base);
  assert.strictEqual(normal.status, 200, JSON.stringify(normal));
  const equivalent = db
    .prepare('SELECT telefono FROM clientes')
    .all()
    .filter((r) => String(r.telefono).replace(/\D/g, '') === base.cliente_telefono);
  console.log(
    JSON.stringify({
      case: 'identidad-publica',
      status: normal.status,
      fichasEquivalentes: equivalent.length,
    })
  );
  const cheapItems = [{ ...base.items[0], precio_unitario: 1 }];
  console.log(
    JSON.stringify({ case: 'precio-web-control', ...(await order({ ...base, items: cheapItems })) })
  );
  require('../utils/operationalCaja').ensureOperationalCaja(db, {
    actor_nombre: 'Auditoría aislada',
  });
  console.log(
    JSON.stringify({
      case: 'origen-interno-sin-login',
      ...(await order({ ...base, origen: 'tpv', items: cheapItems })),
    })
  );
  const omitted = { ...base, items: cheapItems };
  delete omitted.origen;
  console.log(JSON.stringify({ case: 'origen-omitido-sin-login', ...(await order(omitted)) }));
  console.log(
    JSON.stringify({
      case: 'descuento-web-sin-cupon',
      ...(await order({ ...base, descuento: 4999 })),
    })
  );
  const target = db
    .prepare(
      "INSERT INTO clientes(nombre,telefono) VALUES ('Ficha ficticia protegida','5493815550998')"
    )
    .run().lastInsertRowid;
  const identity = await order({
    ...base,
    cliente_id: Number(target),
    cliente_nombre: 'Nombre alterado de prueba',
  });
  const after = db.prepare('SELECT nombre,telefono FROM clientes WHERE id=?').get(target);
  console.log(
    JSON.stringify({
      case: 'identidad-explicita-sin-login',
      status: identity.status,
      fichaAlterada: after.nombre === 'Nombre alterado de prueba',
      telefonoAlterado: after.telefono === base.cliente_telefono,
    })
  );

  const fidelity = require('../services/fidelizacionService');
  fidelity.updateConfig({
    ...fidelity.getConfig(),
    activo: 1,
    minimo_canje: 1,
    valor_punto_real: 500,
  });
  fidelity.registrarAjusteManualPuntos(Number(target), 100, 'Saldo ficticio auditoría');
  const beforePoints = fidelity.getSaldoPuntos(Number(target));
  const redemption = await order({ ...base, cliente_id: Number(target), puntos_a_canjear: 50 });
  console.log(
    JSON.stringify({
      case: 'puntos-sin-identidad-verificada',
      status: redemption.status,
      puntosAntes: beforePoints,
      puntosDespues: fidelity.getSaldoPuntos(Number(target)),
    })
  );

  // Handler real con proveedor simulado: no se contacta Mercado Pago.
  db.prepare(
    "INSERT INTO configuracion(clave,valor) VALUES ('mercadopago_token','audit-fake-token') ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor"
  ).run();
  const router = require('../routes/pedidos');
  const checkout = router.stack
    .find((layer) => layer.route?.path === '/checkout/mercadopago')
    .route.stack.at(-1).handle;
  const originalFetch = global.fetch;
  let preferenceBody;
  global.fetch = async (url, options) => {
    assert.strictEqual(String(url), 'https://api.mercadopago.com/checkout/preferences');
    preferenceBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        id: 'audit-fake-preference',
        init_point: 'https://example.invalid/audit',
      }),
    };
  };
  try {
    let result,
      status = 200;
    const req = {
      body: { ...base, descuento: 100000 },
      headers: { origin: 'http://127.0.0.1' },
      protocol: 'http',
      get: () => '127.0.0.1',
      app: { get: () => null },
    };
    const res = {
      status(code) {
        status = code;
        return this;
      },
      json(value) {
        result = value;
      },
    };
    await checkout(req, res);
    assert.strictEqual(status, 200, JSON.stringify(result));
    const amount = preferenceBody.items.reduce((n, i) => n + i.quantity * i.unit_price, 0);
    console.log(
      JSON.stringify({
        case: 'checkout-unidades-y-descuento-proveedor-simulado',
        totalPedidoPesos: result.pedido.total / 100,
        importeEnviadoProveedor: amount,
        unitPrice: preferenceBody.items[0].unit_price,
      })
    );
  } finally {
    global.fetch = originalFetch;
  }

  const cat = db
    .prepare(
      "INSERT INTO categorias(nombre,activo,turno_id) VALUES ('Turno no vigente audit',1,'audit-noche')"
    )
    .run().lastInsertRowid;
  db.prepare("UPDATE productos SET nombre='Plato Auditoría Turno',categoria_id=? WHERE id=?").run(
    cat,
    product.id
  );
  const agent = getProducts(db).some((p) => p.id === product.id);
  const publicVisible =
    filtrarCatalogo(db, [db.prepare('SELECT * FROM productos WHERE id=?').get(product.id)]).length >
    0;
  const quote = quoteProduct(db, 'Plato Auditoría Turno');
  let blocked = false;
  try {
    await buildPedidoPayload(base);
  } catch {
    blocked = true;
  }
  console.log(
    JSON.stringify({
      case: 'catalogo-por-turno',
      visibleAgente: agent,
      visiblePublico: publicVisible,
      cotizacion: quote.status,
      pedidoRechazado: blocked,
    })
  );

  // Dos contextos JS independientes reproducen el alcance por documento del bloqueo.
  const fs = require('fs'),
    path = require('path'),
    vm = require('vm');
  const source = fs.readFileSync(
    path.join(__dirname, '../../client/src/lib/orderAlerts.js'),
    'utf8'
  );
  const functionSource = source
    .slice(
      source.indexOf('export function claimAlertKey'),
      source.indexOf('\nfunction cleanupAnnouncementText')
    )
    .replace('export function', 'function');
  const program = `const recentAlertClaims=new Map();const PERSISTENT_ALERTS_KEY='audit';const DELIVERED_ALERT_TTL_MS=86400000;${functionSource};claimAlertKey`;
  const first = vm.runInNewContext(program),
    second = vm.runInNewContext(program);
  const claims = [
    first('print:pedido-ficticio'),
    second('print:pedido-ficticio'),
    first('print:pedido-ficticio'),
  ];
  assert.deepStrictEqual(claims, [true, true, false]);
  console.log(
    JSON.stringify({
      case: 'exclusion-impresion-contextos-independientes',
      primero: claims[0],
      segundo: claims[1],
      repetidoEnPrimero: claims[2],
    })
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.close());
