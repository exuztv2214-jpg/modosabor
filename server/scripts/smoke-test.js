const http = require('http');

const PORT = process.env.PORT || 3001;
const BASE_URL = `http://localhost:${PORT}/api`;

async function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const body = data ? JSON.parse(data) : null;
            resolve({ status: res.statusCode, body });
          } catch (_e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function runSmokeTests() {
  console.log('🚀 Iniciando Smoke Tests de Modo Sabor...\n');

  try {
    // Test 1: Health check / Config pública
    const configRes = await fetch(`${BASE_URL}/configuracion`);
    if (configRes.status === 200) {
      console.log('✅ [OK] API Configuracion: El servidor está vivo y conectó a la DB.');
    } else {
      console.error('❌ [FAIL] API Configuracion: Status', configRes.status);
    }

    // Test 2: Validación de Seguridad (Bypass de Pedidos corregido)
    // Intentamos pedir un pedido ID 1 sin token ni auth real
    const pedidoId = 1;
    const pedidoRes = await fetch(`${BASE_URL}/pedidos/${pedidoId}`);
    if (pedidoRes.status === 200) {
      const { body } = pedidoRes;
      if (body.cliente_telefono || body.entrega_pin) {
        console.error(
          '⚠️ [CRITICAL] Seguridad: Los datos sensibles siguen expuestos en tracking público.'
        );
      } else {
        console.log('✅ [OK] Seguridad: Los datos sensibles del pedido están protegidos.');
      }
    } else if (pedidoRes.status === 404) {
      console.log('✅ [OK] Seguridad: Ruta de pedidos protegida (404 por pedido inexistente).');
    }

    // Test 3: Validación de Máquina de Estados (Importación de utilidades)
    // Probamos cambiar estado sin auth (debe dar 401 o 403, no 500)
    const estadoRes = await fetch(`${BASE_URL}/pedidos/1/estado`, {
      method: 'PUT',
      body: { estado: 'confirmado' },
    });
    if (estadoRes.status === 500) {
      console.error('❌ [FAIL] Estabilidad: Error 500 detectado (¿ReferenceError en pedidos.js?)');
    } else if (estadoRes.status === 401 || estadoRes.status === 403) {
      console.log(
        '✅ [OK] Estabilidad: Las rutas de estado están protegidas y cargaron correctamente.'
      );
    }

    console.log('\n✨ Smoke Tests completados.');
  } catch (error) {
    console.error(
      '\n❌ [ERROR] No se pudo completar el test. ¿Está el servidor corriendo en el puerto',
      PORT,
      '?'
    );
    console.error(error.message);
  }
}

runSmokeTests();
