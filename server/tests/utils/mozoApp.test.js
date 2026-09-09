const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getPermissionsForRole } = require('../../utils/permissions');

const serverRoot = path.join(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(serverRoot, ...parts), 'utf8');

function run() {
  console.log('\nTests de la base segura para Mozo');

  assert.deepStrictEqual(getPermissionsForRole('mozo'), ['mozo.use']);
  console.log('  OK Mozo no hereda permisos de Caja ni TPV');

  const service = read('services', 'pedidoService.js');
  assert.ok(service.includes("'mozo'].includes(payload.origen || 'web')"));
  assert.ok(service.includes('options.forceServerPrices === true'));
  console.log('  OK las comandas de Mozo exigen turno/caja y precio de servidor');

  const route = read('routes', 'mozo.js');
  assert.ok(route.includes("router.use(auth, requirePermission('mozo.use'))"));
  assert.ok(route.includes("origen: 'mozo'"));
  assert.ok(route.includes('Primero tomá esta mesa desde la app.'));
  assert.ok(route.includes('mesas_asignaciones'));
  console.log('  OK API limita la mesa al mozo asignado');

  const sockets = read('utils', 'socketRooms.js');
  assert.ok(sockets.includes('BACKOFFICE_ROLES'));
  assert.ok(sockets.includes('mozo_nuevo_pedido'));
  assert.ok(sockets.includes('mozo_pedido_actualizado'));
  assert.ok(!sockets.includes("io.to('authenticated').emit('nuevo_pedido'"));
  console.log('  OK Socket.IO no entrega el stream global al mozo');

  const migrations = read('db', 'migrations.js');
  assert.ok(migrations.includes("'mozo_usuario_id'"));
  assert.ok(migrations.includes('CREATE TABLE IF NOT EXISTS mesas_asignaciones'));
  console.log('  OK la migración guarda autor y asignación de mesa');

  /*
    La cola vive en la app, pero no puede cambiar su contrato con el servidor:
    reintenta el mismo idempotency_key y sólo borra lo local después de una
    respuesta correcta. Es una prueba de integración estática entre ambos
    paquetes, como las de socketRooms de arriba.
  */
  const mozoAppRoot = path.join(serverRoot, '..', 'mozo-app', 'src');
  const app = fs.readFileSync(path.join(mozoAppRoot, 'App.jsx'), 'utf8');
  const api = fs.readFileSync(path.join(mozoAppRoot, 'lib', 'api.js'), 'utf8');
  assert.ok(api.includes("PENDING_ORDERS_KEY = 'ms_mozo_pending_orders_v1'"));
  assert.ok(api.includes('queuePendingOrder'));
  assert.ok(api.includes('removePendingOrder'));
  assert.ok(app.includes('await queuePendingOrder(payload)'));
  assert.ok(app.includes('await removePendingOrder(payload.idempotency_key)'));
  assert.ok(app.includes('if (err.network)'));
  console.log('  OK la cola offline conserva la clave y no descarta un corte de red');

  console.log('✅ Base de Mozo verificada\n');
}

run();
