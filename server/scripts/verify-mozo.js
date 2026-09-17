/*
 * Prueba HTTP del circuito exclusivo de Mozo.
 * Se ejecuta siempre con verify-isolated.js: crea datos operativos sólo en una
 * copia temporal de la base, nunca en la base del local.
 */
const http = require('http');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { ensureOperationalCaja, getActiveCaja, getConfigMap } = require('../utils/operationalCaja');

const PORT = Number(process.env.PORT || 3001);
const BASE_URL = `http://127.0.0.1:${PORT}/api`;
const TEST_EMAIL = 'mozo-system-check@modosabor.local';
const TEST_PASSWORD = 'MozoSystemCheck123!';
const TEST_MESA = 'MOZO_TEST';
const TEST_SHIFT_CONFIG = JSON.stringify([
  {
    id: 'mozo_system_check',
    nombre: 'Turno Mozo Check',
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
            resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function setConfig(key, value) {
  db.prepare(
    `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  ).run(key, value);
}

function getConfigValue(key) {
  return db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(key)?.valor ?? null;
}

function ensureMozoUser() {
  const hash = bcrypt.hashSync(TEST_PASSWORD, 10);
  const existing = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(TEST_EMAIL);
  if (existing) {
    db.prepare(
      'UPDATE usuarios SET nombre = ?, password_hash = ?, rol = ?, activo = 1 WHERE id = ?'
    ).run('Mozo System Check', hash, 'mozo', existing.id);
    return existing.id;
  }
  return db
    .prepare(
      'INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1)'
    )
    .run('Mozo System Check', TEST_EMAIL, hash, 'mozo').lastInsertRowid;
}

function prepareOperationalContext(userId) {
  const originalTurnos = getConfigValue('turnos_negocio');
  const originalMesas = getConfigValue('mesas_nombres');
  const originalCantidad = getConfigValue('mesas_cantidad');
  const originalCaja = getActiveCaja(db);
  setConfig('turnos_negocio', TEST_SHIFT_CONFIG);
  setConfig('mesas_nombres', TEST_MESA);
  setConfig('mesas_cantidad', '1');
  const operational = ensureOperationalCaja(db, {
    actor_id: userId,
    actor_nombre: 'Mozo System Check',
    config: getConfigMap(db),
    notas: 'Apertura temporal para verificar Mozo',
  });

  if (!operational.activeCaja) throw new Error('No se pudo abrir la caja temporal para Mozo');

  return () => {
    setConfig('turnos_negocio', originalTurnos ?? '[]');
    setConfig('mesas_nombres', originalMesas ?? '');
    setConfig('mesas_cantidad', originalCantidad ?? '12');
    if (!originalCaja) {
      db.prepare(
        `UPDATE cierres_caja SET estado = 'cerrada', cerrada_en = CURRENT_TIMESTAMP,
         cerrada_por_id = ?, cerrada_por_nombre = ?, monto_final_declarado = monto_inicial,
         efectivo_esperado = monto_inicial, diferencia = 0 WHERE id = ? AND estado = 'abierta'`
      ).run(userId, 'Mozo System Check', operational.activeCaja.id);
    }
  };
}

async function run() {
  console.log('Iniciando verificacion aislada de Mozo...');
  const userId = ensureMozoUser();
  let restoreContext = null;

  try {
    restoreContext = prepareOperationalContext(userId);
    const login = await request('/auth/native-login', {
      method: 'POST',
      body: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    if (login.status !== 200 || !login.body?.token || login.body?.user?.rol !== 'mozo') {
      throw new Error(`El acceso nativo de Mozo fallo (${login.status})`);
    }
    const headers = { Authorization: `Bearer ${login.body.token}` };

    const estado = await request('/mozo/estado', { headers });
    if (
      estado.status !== 200 ||
      !estado.body?.operacion?.abierto ||
      estado.body?.mesas?.[0]?.mesa !== TEST_MESA
    ) {
      throw new Error('El estado de Mozo no expuso la mesa ni la operación temporal');
    }

    const propio = require('./verification-product')(db);
    const catalogo = await request('/mozo/catalogo', { headers });
    const product = catalogo.body?.productos?.find((item) => Number(item.id) === Number(propio.id));
    if (catalogo.status !== 200 || !product) {
      throw new Error('No hay un producto activo disponible para verificar la comanda');
    }

    const tomar = await request(`/mozo/mesas/${TEST_MESA}/tomar`, { method: 'POST', headers });
    if (tomar.status !== 201 || !tomar.body?.asignada_a_mi) {
      throw new Error(`No se pudo tomar la mesa de prueba (${tomar.status})`);
    }

    const idempotencyKey = `mozo-check-${crypto.randomUUID()}`;
    const crear = await request('/mozo/pedidos', {
      method: 'POST',
      headers,
      body: {
        mesa: TEST_MESA,
        idempotency_key: idempotencyKey,
        notas: 'Prueba aislada de comanda',
        items: [{ producto_id: product.id, cantidad: 1, precio_unitario: 1 }],
      },
    });
    if (
      crear.status !== 201 ||
      !crear.body?.id ||
      Number(crear.body?.total || 0) !== Number(product.precio)
    ) {
      throw new Error(`La comanda no aplicó el precio de servidor (${crear.status})`);
    }

    const duplicate = await request('/mozo/pedidos', {
      method: 'POST',
      headers,
      body: {
        mesa: TEST_MESA,
        idempotency_key: idempotencyKey,
        items: [{ producto_id: product.id, cantidad: 1, precio_unitario: 999999 }],
      },
    });
    if (
      duplicate.status !== 200 ||
      !duplicate.body?.duplicate ||
      Number(duplicate.body?.id) !== Number(crear.body.id)
    ) {
      throw new Error('El reintento de comanda creó un pedido duplicado');
    }

    const mesa = await request(`/mozo/mesas/${TEST_MESA}`, { headers });
    if (
      mesa.status !== 200 ||
      !mesa.body?.pedidos?.some((pedido) => Number(pedido.id) === Number(crear.body.id))
    ) {
      throw new Error('La mesa no devolvió la comanda propia abierta');
    }

    console.log('OK: login nativo, mesa propia, precio de servidor e idempotencia de Mozo');
  } finally {
    if (restoreContext) restoreContext();
    db.prepare('DELETE FROM mesas_asignaciones WHERE mesa = ?').run(TEST_MESA);
    db.prepare('DELETE FROM usuarios WHERE id = ?').run(userId);
  }
}

run().catch((error) => {
  console.error('ERROR:', error.message || error);
  process.exitCode = 1;
});
