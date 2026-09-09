const http = require('http');
const bcrypt = require('bcryptjs');
const db = require('../db');

const PORT = Number(process.env.PORT || 3001);
const BASE_URL = `http://127.0.0.1:${PORT}/api`;
const TEST_EMAIL = 'system-check@modosabor.local';
const TEST_PASSWORD = 'SystemCheck123!';
const TEST_PERSONAL_PHONE = '5493810000099';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${BASE_URL}${path}`,
      {
        method: options.method || 'GET',
        headers: options.headers || {},
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
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data,
            });
          }
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
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

  const created = db
    .prepare(
      'INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1)'
    )
    .run('System Check', TEST_EMAIL, hash, 'admin');
  return created.lastInsertRowid;
}

function cleanupSystemCheckUser(userId) {
  if (!userId) return;
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(userId);
}

function cleanupSystemCheckPersonal() {
  const rows = db.prepare('SELECT id FROM personal WHERE telefono = ?').all(TEST_PERSONAL_PHONE);
  rows.forEach((row) => {
    db.prepare('DELETE FROM personal_asistencia WHERE personal_id = ?').run(row.id);
    db.prepare('DELETE FROM personal_objetivos WHERE personal_id = ?').run(row.id);
    db.prepare('DELETE FROM personal_movimientos WHERE personal_id = ?').run(row.id);
    db.prepare(
      'DELETE FROM personal_liquidacion_items WHERE liquidacion_id IN (SELECT id FROM personal_liquidaciones WHERE personal_id = ?)'
    ).run(row.id);
    db.prepare('DELETE FROM personal_liquidaciones WHERE personal_id = ?').run(row.id);
    db.prepare('DELETE FROM personal_reconocimientos WHERE personal_id = ?').run(row.id);
    db.prepare('DELETE FROM personal_direcciones WHERE personal_id = ?').run(row.id);
    db.prepare('DELETE FROM personal_carrera_historial WHERE personal_id = ?').run(row.id);
    db.prepare('DELETE FROM personal WHERE id = ?').run(row.id);
  });
}

async function run() {
  console.log('Iniciando verificacion core...');
  const testUserId = ensureSystemCheckUser();

  try {
    const login = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });

    const cookie = login.headers?.['set-cookie']?.[0]?.split(';')?.[0] || '';

    if (login.status !== 200 || !login.body?.user || !cookie) {
      throw new Error(`Login admin de prueba fallo con status ${login.status}`);
    }

    const authHeaders = {
      Cookie: cookie,
      'Content-Type': 'application/json',
    };

    const checks = [
      ['auth/me', '/auth/me'],
      ['pedidos', '/pedidos?limit=5'],
      ['inventario', '/inventario/insumos'],
      ['repartidores', '/repartidores'],
      ['reportes dashboard', '/reportes/dashboard'],
      ['caja estado', '/caja/estado'],
      ['operacion resumen', '/operacion/resumen'],
      ['operacion menu dia', '/operacion/menu-dia'],
    ];

    for (const [label, path] of checks) {
      const response = await request(path, { headers: authHeaders });
      if (response.status !== 200) {
        throw new Error(`Chequeo ${label} fallo con status ${response.status}`);
      }
      console.log(`OK: ${label}`);
    }

    cleanupSystemCheckPersonal();
    const createPersonal = await request('/personal', {
      method: 'POST',
      headers: authHeaders,
      body: {
        nombre: 'System Check Personal',
        rol_operativo: 'cocina',
        telefono: TEST_PERSONAL_PHONE,
        turno_preferido: 'manana',
        frecuencia_pago: 'semanal',
        monto_base: 10000,
        medio_pago_preferido: 'efectivo',
        activo: 1,
      },
    });
    if (createPersonal.status !== 200 || !createPersonal.body?.id) {
      throw new Error(`Crear personal de prueba fallo con status ${createPersonal.status}`);
    }
    const personalId = createPersonal.body.id;
    const clockToken = createPersonal.body.clock_token;

    const publicBoard = await request('/personal/clock/board');
    if (
      publicBoard.status !== 200 ||
      !Array.isArray(publicBoard.body?.items) ||
      publicBoard.body.items.some(
        (item) => item.clock_token || item.clock_url || item.attendance !== null
      )
    ) {
      throw new Error('El reloj público expone credenciales o asistencia del equipo');
    }
    const personalBoard = await request(
      `/personal/clock/board?token=${encodeURIComponent(clockToken)}`
    );
    if (
      personalBoard.status !== 200 ||
      personalBoard.body?.items?.length !== 1 ||
      Number(personalBoard.body.items[0]?.id) !== Number(personalId) ||
      personalBoard.body.items[0]?.clock_token
    ) {
      throw new Error('El QR de personal no quedó aislado a su titular');
    }
    console.log('OK: reloj público sin credenciales ni datos de terceros');

    const manualAttendance = await request(`/personal/${personalId}/asistencia/manual`, {
      method: 'PUT',
      headers: authHeaders,
      body: {
        fecha_operativa: '2026-06-24',
        turno_id: 'manana',
        estado: 'presente',
        ingreso_en: '2026-06-24T10:05',
        salida_en: '2026-06-24T14:20',
        notas: 'Verificacion automatica',
      },
    });
    if (manualAttendance.status !== 200 || manualAttendance.body?.estado !== 'presente') {
      throw new Error(`Asistencia manual de prueba fallo con status ${manualAttendance.status}`);
    }

    const detail = await request(`/personal/${personalId}/detalle`, { headers: authHeaders });
    if (
      detail.status !== 200 ||
      !Array.isArray(detail.body?.asistencia) ||
      !detail.body.asistencia.some((item) => item.fecha_operativa === '2026-06-24')
    ) {
      throw new Error('La asistencia manual no aparece en la ficha del personal');
    }
    console.log('OK: personal / asistencia manual');

    const firstSettlement = await request(`/personal/${personalId}/liquidaciones`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        unidades: 1,
        monto_base: 10000,
        periodo_desde: '2026-06-24',
        periodo_hasta: '2026-06-24',
        metodo_pago: 'transferencia',
        impacta_caja: 0,
      },
    });
    if (firstSettlement.status !== 200) {
      throw new Error(`Liquidación de prueba falló con status ${firstSettlement.status}`);
    }
    const duplicatedSettlement = await request(`/personal/${personalId}/liquidaciones`, {
      method: 'POST',
      headers: authHeaders,
      body: {
        unidades: 1,
        monto_base: 10000,
        periodo_desde: '2026-06-24',
        periodo_hasta: '2026-06-24',
        metodo_pago: 'transferencia',
        impacta_caja: 0,
      },
    });
    if (duplicatedSettlement.status !== 400) {
      throw new Error('Una liquidación duplicada no fue bloqueada');
    }
    console.log('OK: liquidación duplicada bloqueada');

    const archivePersonal = await request(`/personal/${personalId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    const archivedDetail = await request(`/personal/${personalId}/detalle`, {
      headers: authHeaders,
    });
    if (
      archivePersonal.status !== 200 ||
      !archivePersonal.body?.archivado ||
      archivedDetail.status !== 200 ||
      Number(archivedDetail.body?.item?.activo) !== 0
    ) {
      throw new Error('La baja de personal no preservó el historial como inactivo');
    }
    console.log('OK: baja lógica conserva el historial de personal');

    // Una contraseña nueva tiene que cerrar las sesiones emitidas antes del
    // cambio, incluso si pertenecen al mismo usuario en otro dispositivo. La
    // respuesta del cambio, en cambio, entrega una cookie renovada para que la
    // persona que lo hizo no se desconecte de su propia sesión.
    const secondLogin = await request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const secondCookie = secondLogin.headers?.['set-cookie']?.[0]?.split(';')?.[0] || '';
    if (secondLogin.status !== 200 || !secondCookie) {
      throw new Error('No se pudo crear una segunda sesión para verificar revocación');
    }

    const newPassword = 'SystemCheck456!';
    const passwordChanged = await request('/auth/password', {
      method: 'PUT',
      headers: authHeaders,
      body: { password_actual: TEST_PASSWORD, password_nuevo: newPassword },
    });
    const refreshedCookie = passwordChanged.headers?.['set-cookie']?.[0]?.split(';')?.[0] || '';
    if (passwordChanged.status !== 200 || !refreshedCookie) {
      throw new Error(`Cambio de contraseña de prueba falló: ${passwordChanged.status}`);
    }

    const revokedSession = await request('/auth/me', { headers: { Cookie: secondCookie } });
    const refreshedSession = await request('/auth/me', { headers: { Cookie: refreshedCookie } });
    if (revokedSession.status !== 401 || refreshedSession.status !== 200) {
      throw new Error('El cambio de contraseña no revocó sesiones previas correctamente');
    }
    console.log('OK: contraseña nueva revoca sesiones anteriores y conserva la sesión renovada');

    console.log('Verificacion core completada.');
  } finally {
    cleanupSystemCheckPersonal();
    cleanupSystemCheckUser(testUserId);
  }
}

run().catch((error) => {
  console.error('ERROR:', error.message || error);
  process.exitCode = 1;
});
