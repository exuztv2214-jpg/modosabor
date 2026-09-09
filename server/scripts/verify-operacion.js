const http = require('http');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { restoreInventoryForPedido } = require('../utils/inventory');
const { getCurrentShiftInfo } = require('../utils/shifts');
const { ensureOperationalCaja, getActiveCaja, getConfigMap } = require('../utils/operationalCaja');

const PORT = Number(process.env.PORT || 3001);
const BASE_URL = `http://127.0.0.1:${PORT}/api`;
const TEST_EMAIL = 'system-check-operacion@modosabor.local';
const TEST_PASSWORD = 'SystemCheck123!';
const TEST_PHONE = '5493810000000';
const TEST_PHONE_TPV = `${TEST_PHONE}1`;
const TEST_SHIFT_CONFIG = JSON.stringify([
  {
    id: 'system_check',
    nombre: 'Turno system check',
    desde: '00:00',
    hasta: '23:59',
    activo: true,
  },
]);

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : null;
    const req = http.request(
      `${BASE_URL}${path}`,
      {
        method: options.method || 'GET',
        headers: {
          ...(options.headers || {}),
          ...(body
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
            : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data ? JSON.parse(data) : null,
            });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function ensureSystemCheckUser() {
  const existing = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(TEST_EMAIL);
  const hash = bcrypt.hashSync(TEST_PASSWORD, 10);

  if (existing) {
    db.prepare(
      'UPDATE usuarios SET nombre = ?, password_hash = ?, rol = ?, activo = 1 WHERE id = ?'
    ).run('System Check', hash, 'admin', existing.id);
    return existing.id;
  }

  return db
    .prepare(
      'INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1)'
    )
    .run('System Check', TEST_EMAIL, hash, 'admin').lastInsertRowid;
}

function cleanupSystemCheckUser(userId) {
  if (userId) db.prepare('DELETE FROM usuarios WHERE id = ?').run(userId);
}

function cleanupPedido(pedidoId) {
  if (!pedidoId) return;
  db.exec('BEGIN');
  try {
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
    if (pedido) {
      restoreInventoryForPedido(db, pedido, { motivo: 'Limpieza system-check' });
    }
    db.prepare('DELETE FROM cupones_usados WHERE pedido_id = ?').run(pedidoId);
    db.prepare('DELETE FROM puntos_transacciones WHERE pedido_id = ?').run(pedidoId);
    db.prepare('DELETE FROM mercadopago_eventos WHERE pedido_id = ?').run(pedidoId);
    db.prepare('DELETE FROM inventario_movimientos WHERE pedido_id = ?').run(pedidoId);
    db.prepare('DELETE FROM impresiones WHERE pedido_id = ?').run(pedidoId);
    db.prepare('DELETE FROM pedido_items WHERE pedido_id = ?').run(pedidoId);
    db.prepare("DELETE FROM auditoria_eventos WHERE entidad = 'pedido' AND entidad_id = ?").run(
      String(pedidoId)
    );
    db.prepare('DELETE FROM pedidos WHERE id = ?').run(pedidoId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function cleanupClientePrueba() {
  db.prepare(
    'DELETE FROM cliente_direcciones WHERE cliente_id IN (SELECT id FROM clientes WHERE telefono IN (?, ?))'
  ).run(TEST_PHONE, TEST_PHONE_TPV);
  db.prepare('DELETE FROM clientes WHERE telefono IN (?, ?)').run(TEST_PHONE, TEST_PHONE_TPV);
}

function closeCajaForSystemCheck(cajaId, actorId) {
  if (!cajaId) return;
  db.prepare(
    `
    UPDATE cierres_caja
    SET estado = 'cerrada',
        cerrada_en = CURRENT_TIMESTAMP,
        cerrada_por_id = ?,
        cerrada_por_nombre = ?,
        monto_final_declarado = COALESCE(monto_final_declarado, monto_inicial, 0),
        efectivo_esperado = COALESCE(efectivo_esperado, monto_inicial, 0),
        diferencia = COALESCE(diferencia, 0),
        notas_cierre = CASE
          WHEN TRIM(COALESCE(notas_cierre, '')) = '' THEN 'Cierre automatico de verificacion operativa'
          ELSE notas_cierre
        END
    WHERE id = ?
  `
  ).run(actorId || null, 'System Check', cajaId);
}

function ensureOperationalTestContext(actorId) {
  const originalTurnos =
    db.prepare("SELECT valor FROM configuracion WHERE clave = 'turnos_negocio'").get()?.valor ||
    '[]';
  const originalCaja = getActiveCaja(db);
  let replacedShiftConfig = false;
  let openedCajaId = null;

  const config = getConfigMap(db);
  if (!getCurrentShiftInfo(config).abierto_ahora) {
    db.prepare("UPDATE configuracion SET valor = ? WHERE clave = 'turnos_negocio'").run(
      TEST_SHIFT_CONFIG
    );
    replacedShiftConfig = true;
  }

  const operational = ensureOperationalCaja(db, {
    actor_id: actorId || null,
    actor_nombre: 'System Check',
    notas: 'Apertura automatica de verificacion operativa',
  });

  openedCajaId = operational.activeCaja?.id || null;

  return () => {
    if (replacedShiftConfig) {
      db.prepare("UPDATE configuracion SET valor = ? WHERE clave = 'turnos_negocio'").run(
        originalTurnos
      );
    }

    if (!originalCaja && openedCajaId) {
      closeCajaForSystemCheck(openedCajaId, actorId);
    }
  };
}

function getTestProduct() {
  return db
    .prepare(
      `
    SELECT id, nombre, precio, categoria_id
    FROM productos
    WHERE activo = 1
      AND disponible_para_venta = 1
      AND precio > 0
      AND stock_mode != 'recipe'
    ORDER BY id ASC
    LIMIT 1
  `
    )
    .get();
}

function assertMoneyRoundTrip(label, pedido, expectedTotal) {
  const total = Number(pedido?.total || 0);
  const subtotal = Number(pedido?.subtotal || 0);
  const firstItem = Array.isArray(pedido?.items) ? pedido.items[0] : null;
  const itemPrice = Number(firstItem?.precio_unitario || 0);
  const itemSubtotal = Number(firstItem?.subtotal || 0);

  if (
    total !== expectedTotal ||
    subtotal !== expectedTotal ||
    itemPrice !== expectedTotal ||
    itemSubtotal !== expectedTotal
  ) {
    throw new Error(
      `${label} devolvio importes inconsistentes: ${JSON.stringify({
        total,
        subtotal,
        itemPrice,
        itemSubtotal,
        expectedTotal,
      })}`
    );
  }
}

async function run() {
  console.log('Iniciando verificacion operativa...');
  const testUserId = ensureSystemCheckUser();
  let pedidoId = null;
  let pedidoInternoId = null;
  let restoreOperationalContext = null;

  try {
    const login = await request('/auth/login', {
      method: 'POST',
      body: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });

    const cookie = login.headers?.['set-cookie']?.[0]?.split(';')?.[0] || '';

    if (login.status !== 200 || !login.body?.user || !cookie) {
      throw new Error(`Login admin de prueba fallo con status ${login.status}`);
    }

    const authHeaders = { Cookie: cookie };
    const product = getTestProduct();
    if (!product) throw new Error('No hay productos activos y vendibles para probar pedidos');
    const productPrice = Number(product.precio || 0) / 100;
    restoreOperationalContext = ensureOperationalTestContext(testUserId);
    console.log('OK: turno/caja operativa lista para verificacion');

    const created = await request('/pedidos', {
      method: 'POST',
      body: {
        origen: 'sistema_check',
        tipo_entrega: 'delivery',
        cliente_nombre: 'Prueba Sistema',
        cliente_telefono: TEST_PHONE,
        cliente_direccion: 'Sargento Cabral 251, Monteros',
        metodo_pago: 'efectivo',
        items: JSON.stringify([
          {
            producto_id: product.id,
            nombre: product.nombre,
            cantidad: 1,
            precio_unitario: productPrice,
            subtotal: productPrice,
          },
        ]),
        subtotal: productPrice,
        costo_envio: 0,
        descuento: 0,
        total: productPrice,
      },
    });

    if (created.status !== 200 || !created.body?.id) {
      throw new Error(
        `Crear pedido fallo con status ${created.status}: ${JSON.stringify(created.body)}`
      );
    }
    pedidoId = created.body.id;
    assertMoneyRoundTrip('Pedido publico', created.body, productPrice);
    console.log(`OK: pedido creado por API publica (#${created.body.numero})`);

    const listed = await request(`/pedidos?limit=20`, { headers: authHeaders });
    if (
      listed.status !== 200 ||
      !Array.isArray(listed.body) ||
      !listed.body.some((item) => Number(item.id) === Number(pedidoId))
    ) {
      throw new Error('El pedido creado no aparece en el panel de pedidos');
    }
    console.log('OK: pedido visible para administracion');

    const updated = await request(`/pedidos/${pedidoId}/estado`, {
      method: 'PUT',
      headers: authHeaders,
      body: { estado: 'confirmado' },
    });
    if (updated.status !== 200 || updated.body?.estado !== 'confirmado') {
      throw new Error(
        `Cambio de estado fallo con status ${updated.status}: ${JSON.stringify(updated.body)}`
      );
    }
    console.log('OK: cambio de estado validado');

    const cancellationWithoutReason = await request(`/pedidos/${pedidoId}/estado`, {
      method: 'PUT',
      headers: authHeaders,
      body: { estado: 'cancelado' },
    });
    if (
      cancellationWithoutReason.status !== 400 ||
      cancellationWithoutReason.body?.error !== 'Indicá el motivo de la cancelación'
    ) {
      throw new Error(
        `La cancelacion sin motivo no fue rechazada: ${JSON.stringify(cancellationWithoutReason.body)}`
      );
    }
    console.log('OK: cancelacion sin motivo rechazada');

    const cancellationReason = 'Cancelacion de prueba operativa';
    const cancelled = await request(`/pedidos/${pedidoId}/estado`, {
      method: 'PUT',
      headers: authHeaders,
      body: { estado: 'cancelado', motivo_cancelacion: cancellationReason },
    });
    if (
      cancelled.status !== 200 ||
      cancelled.body?.estado !== 'cancelado' ||
      cancelled.body?.motivo_cancelacion !== cancellationReason
    ) {
      throw new Error(`Cancelacion con motivo fallo: ${JSON.stringify(cancelled.body)}`);
    }
    console.log('OK: cancelacion con motivo persistida');

    const print = await request(`/pedidos/${pedidoId}/imprimir`, {
      method: 'POST',
      headers: authHeaders,
      body: { tipo: 'ticket_cliente' },
    });
    if (print.status !== 200 || !print.body?.html) {
      throw new Error(`Impresion virtual fallo con status ${print.status}`);
    }
    console.log('OK: ticket de impresion generado');

    const internalCreated = await request('/pedidos/interno', {
      method: 'POST',
      headers: authHeaders,
      body: {
        origen: 'tpv',
        tipo_entrega: 'delivery',
        cliente_nombre: 'Prueba TPV',
        cliente_telefono: TEST_PHONE_TPV,
        cliente_direccion: 'Sargento Cabral 251, Monteros',
        metodo_pago: 'efectivo',
        items: JSON.stringify([
          {
            producto_id: product.id,
            categoria_id: product.categoria_id || null,
            nombre: product.nombre,
            cantidad: 1,
            precio_unitario: productPrice,
            subtotal: productPrice,
          },
        ]),
        subtotal: productPrice,
        costo_envio: 0,
        descuento: 0,
        total: productPrice,
      },
    });
    if (internalCreated.status !== 200 || !internalCreated.body?.id) {
      throw new Error(
        `Crear pedido interno fallo con status ${internalCreated.status}: ${JSON.stringify(internalCreated.body)}`
      );
    }
    pedidoInternoId = internalCreated.body.id;
    assertMoneyRoundTrip('Pedido interno TPV', internalCreated.body, productPrice);
    console.log('OK: pedido interno TPV creado');

    console.log('Verificacion operativa completada.');
  } finally {
    cleanupPedido(pedidoId);
    cleanupPedido(pedidoInternoId);
    if (typeof restoreOperationalContext === 'function') {
      restoreOperationalContext();
    }
    cleanupClientePrueba();
    cleanupSystemCheckUser(testUserId);
  }
}

run().catch((error) => {
  console.error('ERROR:', error.message || error);
  process.exitCode = 1;
});
