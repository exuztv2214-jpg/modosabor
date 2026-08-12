const http = require('http');
const path = require('path');
const bcrypt = require('bcryptjs');
const { io } = require(
  path.join(__dirname, '..', '..', 'client', 'node_modules', 'socket.io-client')
);

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../db');
const { ensureOperationalCaja } = require('../utils/operationalCaja');

const PORT = Number(process.env.PORT || 3001);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const EMAIL = 'system-check-whatsapp@modosabor.local';
const PASSWORD = 'SystemCheck123!';
const PHONE = '5493810000099';

function request(route, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : null;
    const req = http.request(
      `${BASE_URL}/api${route}`,
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
            resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
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

function ensureAdmin() {
  const hash = bcrypt.hashSync(PASSWORD, 10);
  const existing = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(EMAIL);
  if (existing) {
    db.prepare('UPDATE usuarios SET password_hash = ?, rol = ?, activo = 1 WHERE id = ?').run(
      hash,
      'admin',
      existing.id
    );
    return existing.id;
  }
  return db
    .prepare(
      'INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1)'
    )
    .run('System Check WhatsApp', EMAIL, hash, 'admin').lastInsertRowid;
}

function getProduct() {
  return db
    .prepare(
      `SELECT id, nombre FROM productos
       WHERE activo = 1 AND disponible_para_venta = 1 AND precio > 0
         AND stock_mode != 'recipe'
       ORDER BY id LIMIT 1`
    )
    .get();
}

function waitForSocket(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El socket autenticado no conectó')), 5000);
    socket.once('authenticated', (result) => {
      clearTimeout(timeout);
      if (!result?.success) return reject(new Error('El socket no quedó autenticado'));
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function waitForNewOrder(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('No llegó system_nuevo_pedido para disparar alarma/impresión')),
      5000
    );
    socket.once('system_nuevo_pedido', (pedido) => {
      clearTimeout(timeout);
      resolve(pedido);
    });
  });
}

async function run() {
  if (!process.env.AGENT_API_KEY) throw new Error('Falta AGENT_API_KEY para la prueba');

  const adminId = ensureAdmin();
  db.prepare(
    `INSERT INTO configuracion (clave, valor) VALUES ('turnos_negocio', ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  ).run(
    JSON.stringify([
      {
        id: 'system_check_whatsapp',
        nombre: 'Turno system check WhatsApp',
        desde: '00:00',
        hasta: '23:59',
        activo: true,
      },
    ])
  );
  ensureOperationalCaja(db, {
    actor_id: adminId,
    actor_nombre: 'System Check WhatsApp',
    notas: 'Caja temporal para verificar agente WhatsApp',
  });
  const product = getProduct();
  if (!product) throw new Error('No hay un producto simple activo para verificar WhatsApp');

  const login = await request('/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  const cookie = login.headers?.['set-cookie']?.[0]?.split(';')?.[0] || '';
  if (login.status !== 200 || !cookie) throw new Error(`Login de prueba falló (${login.status})`);

  const socket = io(BASE_URL, {
    transports: ['websocket'],
    extraHeaders: { Cookie: cookie },
  });

  try {
    await waitForSocket(socket);
    const idempotencyKey = `verify-wa-${Date.now()}`;
    const body = {
      cliente_nombre: 'Cliente Prueba WhatsApp',
      cliente_telefono: PHONE,
      cliente_direccion: 'Sargento Cabral 251, Monteros',
      tipo_entrega: 'delivery',
      metodo_pago: 'efectivo',
      idempotency_key: idempotencyKey,
      items: [{ producto_id: product.id, cantidad: 1, descripcion: product.nombre }],
    };
    const socketEvent = waitForNewOrder(socket);
    const first = await request('/agente/pedido', {
      method: 'POST',
      headers: { 'x-agent-key': process.env.AGENT_API_KEY },
      body,
    });
    if (first.status !== 200 || !first.body?.id) {
      socketEvent.catch(() => {});
      throw new Error(
        `El agente no creó el pedido (${first.status}): ${JSON.stringify(first.body)}`
      );
    }
    const emitted = await socketEvent;
    if (Number(emitted?.id) !== Number(first.body.id) || emitted?.origen !== 'whatsapp') {
      throw new Error('El socket recibió un pedido diferente o sin origen WhatsApp');
    }
    console.log('OK: pedido WhatsApp creó y emitió el evento de alarma');

    const duplicate = await request('/agente/pedido', {
      method: 'POST',
      headers: { 'x-agent-key': process.env.AGENT_API_KEY },
      body,
    });
    const count = db
      .prepare(
        "SELECT COUNT(*) AS total FROM pedidos WHERE origen = 'whatsapp' AND idempotency_key = ?"
      )
      .get(idempotencyKey).total;
    if (
      duplicate.status !== 200 ||
      Number(duplicate.body?.id) !== Number(first.body.id) ||
      count !== 1
    ) {
      throw new Error('El reintento de confirmación duplicó el pedido WhatsApp');
    }
    console.log('OK: confirmación repetida devolvió el mismo pedido sin duplicarlo');

    const print = await request(`/pedidos/${first.body.id}/imprimir`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: { tipo: 'tpv_pack' },
    });
    const html = String(print.body?.html || '');
    if (print.status !== 200 || !/comanda/i.test(html) || !/ticket/i.test(html)) {
      throw new Error(`No se generó el pack ticket + comanda (${print.status})`);
    }
    console.log('OK: pack automático contiene ticket y comanda');
  } finally {
    socket.close();
  }
}

run().catch((error) => {
  console.error(`ERROR: ${error.message || error}`);
  process.exitCode = 1;
});
