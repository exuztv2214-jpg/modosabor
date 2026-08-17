const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', '..');
const api = fs.readFileSync(path.join(root, 'client', 'src', 'lib', 'api.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'client', 'public', 'sw-admin.js'), 'utf8');
const layout = fs.readFileSync(
  path.join(root, 'client', 'src', 'components', 'Layout.jsx'),
  'utf8'
);
const tpv = fs.readFileSync(path.join(root, 'client', 'src', 'pages', 'TPV.jsx'), 'utf8');
const queue = fs.readFileSync(
  path.join(root, 'client', 'src', 'lib', 'tpvOfflineQueue.js'),
  'utf8'
);
const pedidosRoute = fs.readFileSync(path.join(root, 'server', 'routes', 'pedidos.js'), 'utf8');

assert.match(api, /!navigator\.onLine/, 'la API debe rechazar escrituras sin conexión');
assert.match(
  api,
  /Sin conexión a internet/,
  'la interfaz debe recibir un error entendible sin conexión'
);
assert.match(
  worker,
  /CATALOGO_TPV_PATH/,
  'el service worker sólo puede conservar el catálogo seguro del TPV'
);
assert.match(
  worker,
  /esLecturaCatalogoSegura\(url\)/,
  'el service worker debe dejar fuera de caché el resto de la API'
);
assert.match(
  layout,
  /window\.addEventListener\('offline'/,
  'el panel debe detectar la desconexión'
);
assert.match(
  tpv,
  /encolarPedidoOffline/,
  'el TPV debe guardar localmente una venta en efectivo o transferencia'
);
assert.match(tpv, /sincronizarPedidosOffline/, 'el TPV debe reenviar la cola al volver internet');
assert.match(
  tpv,
  /pedido\$\{\s*pedidosOfflinePendientes === 1/,
  'el TPV debe mostrar cuántos pedidos siguen esperando para enviar'
);
assert.match(
  tpv,
  /pedidosOfflinePendientes === 0/,
  'el navegador debe advertir antes de cerrar si todavía hay pedidos sin subir'
);
assert.match(
  tpv,
  /tarjeta ni billetera digital/,
  'el TPV debe bloquear cobros que no se pueden validar offline'
);
assert.match(queue, /idempotency_key/, 'cada pedido offline debe conservar una clave idempotente');
assert.match(
  queue,
  /pendientes\.length >= MAX_PENDING_ORDERS/,
  'la cola no puede descartar ventas'
);
assert.match(
  pedidosRoute,
  /idempotencyKey[\s\S]{0,500}return res\.json\(hydratePedido\(existing\)\)/,
  'el reintento no debe volver a emitir la alarma de un pedido existente'
);

console.log('offlineAdmin.test.js OK');
