const http = require('http');
const bcrypt = require('bcryptjs');
const db = require('../db');

const PORT = Number(process.env.PORT || 3001);
const BASE_URL = `http://127.0.0.1:${PORT}/api`;
const TEST_EMAIL = 'system-check-operacion@modosabor.local';
const TEST_PASSWORD = 'SystemCheck123!';
const TEST_PHONE = '5493810000000';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : null;
    const req = http.request(`${BASE_URL}${path}`, {
      method: options.method || 'GET',
      headers: {
        ...(options.headers || {}),
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    }, (res) => {
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
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function ensureSystemCheckUser() {
  const existing = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(TEST_EMAIL);
  const hash = bcrypt.hashSync(TEST_PASSWORD, 10);

  if (existing) {
    db.prepare('UPDATE usuarios SET nombre = ?, password_hash = ?, rol = ?, activo = 1 WHERE id = ?')
      .run('System Check', hash, 'admin', existing.id);
    return existing.id;
  }

  return db.prepare(
    'INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1)'
  ).run('System Check', TEST_EMAIL, hash, 'admin').lastInsertRowid;
}

function cleanupSystemCheckUser(userId) {
  if (userId) db.prepare('DELETE FROM usuarios WHERE id = ?').run(userId);
}

function cleanupPedido(pedidoId) {
  if (!pedidoId) return;
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM inventario_movimientos WHERE pedido_id = ?').run(pedidoId);
    db.prepare('DELETE FROM impresiones WHERE pedido_id = ?').run(pedidoId);
    db.prepare('DELETE FROM pedido_items WHERE pedido_id = ?').run(pedidoId);
    db.prepare("DELETE FROM auditoria_eventos WHERE entidad = 'pedido' AND entidad_id = ?").run(String(pedidoId));
    db.prepare('DELETE FROM pedidos WHERE id = ?').run(pedidoId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function cleanupClientePrueba() {
  const cliente = db.prepare('SELECT id FROM clientes WHERE telefono = ?').get(TEST_PHONE);
  if (!cliente) return;
  db.prepare('DELETE FROM clientes WHERE id = ?').run(cliente.id);
}

function getTestProduct() {
  return db.prepare(`
    SELECT id, nombre, precio, categoria_id
    FROM productos
    WHERE activo = 1
      AND precio > 0
    ORDER BY id ASC
    LIMIT 1
  `).get();
}

async function run() {
  console.log('Iniciando verificacion operativa...');
  const testUserId = ensureSystemCheckUser();
  let pedidoId = null;
  let pedidoInternoId = null;

  try {
    const login = await request('/auth/login', {
      method: 'POST',
      body: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });

    if (login.status !== 200 || !login.body?.token) {
      throw new Error(`Login admin de prueba fallo con status ${login.status}`);
    }

    const token = login.body.token;
    const authHeaders = { Authorization: `Bearer ${token}` };
    const product = getTestProduct();
    if (!product) throw new Error('No hay productos activos y vendibles para probar pedidos');

    const created = await request('/pedidos', {
      method: 'POST',
      body: {
        origen: 'sistema_check',
        tipo_entrega: 'delivery',
        cliente_nombre: 'Prueba Sistema',
        cliente_telefono: TEST_PHONE,
        cliente_direccion: 'Sargento Cabral 251, Monteros',
        metodo_pago: 'efectivo',
        items: [{
          producto_id: product.id,
          nombre: product.nombre,
          cantidad: 1,
          precio_unitario: Number(product.precio),
          subtotal: Number(product.precio),
        }],
      },
    });

    if (created.status !== 200 || !created.body?.id) {
      throw new Error(`Crear pedido fallo con status ${created.status}: ${JSON.stringify(created.body)}`);
    }
    pedidoId = created.body.id;
    console.log(`OK: pedido creado por API publica (#${created.body.numero})`);

    const listed = await request(`/pedidos?limit=20`, { headers: authHeaders });
    if (listed.status !== 200 || !Array.isArray(listed.body) || !listed.body.some((item) => Number(item.id) === Number(pedidoId))) {
      throw new Error('El pedido creado no aparece en el panel de pedidos');
    }
    console.log('OK: pedido visible para administracion');

    const updated = await request(`/pedidos/${pedidoId}/estado`, {
      method: 'PUT',
      headers: authHeaders,
      body: { estado: 'confirmado' },
    });
    if (updated.status !== 200 || updated.body?.estado !== 'confirmado') {
      throw new Error(`Cambio de estado fallo con status ${updated.status}: ${JSON.stringify(updated.body)}`);
    }
    console.log('OK: cambio de estado validado');

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
        cliente_telefono: `${TEST_PHONE}1`,
        cliente_direccion: 'Sargento Cabral 251, Monteros',
        metodo_pago: 'efectivo',
        items: [{
          producto_id: product.id,
          categoria_id: product.categoria_id || null,
          nombre: product.nombre,
          cantidad: 1,
          precio_unitario: Number(product.precio),
          subtotal: Number(product.precio),
        }],
      },
    });
    if (internalCreated.status !== 200 || !internalCreated.body?.id) {
      throw new Error(`Crear pedido interno fallo con status ${internalCreated.status}: ${JSON.stringify(internalCreated.body)}`);
    }
    pedidoInternoId = internalCreated.body.id;
    console.log('OK: pedido interno TPV creado');

    console.log('Verificacion operativa completada.');
  } finally {
    cleanupPedido(pedidoId);
    cleanupPedido(pedidoInternoId);
    cleanupClientePrueba();
    cleanupSystemCheckUser(testUserId);
  }
}

run().catch((error) => {
  console.error('ERROR:', error.message || error);
  process.exitCode = 1;
});
