const assert = require('assert');
const fs = require('fs');
const path = require('path');

const viteConfig = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'client', 'vite.config.js'),
  'utf8'
);
const pedidosPage = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'client', 'src', 'pages', 'Pedidos', 'index.jsx'),
  'utf8'
);

assert.match(
  viteConfig,
  /['"]\/socket\.io['"]\s*:\s*\{[\s\S]*?target:\s*['"]http:\/\/localhost:3001['"][\s\S]*?ws:\s*true/,
  'Vite debe reenviar Socket.IO al servidor local para que los pedidos lleguen sin recargar'
);

assert.match(
  pedidosPage,
  /reconciliarPedidosActivos[\s\S]*?\/pedidos\/activos/,
  'Pedidos debe reconciliar silenciosamente los activos si se pierde un evento durante un corte'
);

assert.match(
  pedidosPage,
  /socketConnected[\s\S]*?ultimaSincronizacion/,
  'Pedidos debe mostrar si Socket.IO está conectado y cuándo se sincronizó por última vez'
);

console.log('tiempoRealDev.test.js OK');
