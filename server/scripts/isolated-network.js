// Preload exclusivo de pruebas: ninguna API externa puede recibir tráfico.
const permitidos = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const net = require('net');
function validar(destino) {
  const host =
    typeof destino === 'string' || destino instanceof URL
      ? new URL(destino).hostname
      : String(destino?.hostname || destino?.host || 'localhost');
  if (!permitidos.has(host)) throw new Error('Prueba aislada: conexión externa bloqueada');
}
// Cubre clientes que usan sockets directamente (por ejemplo WebSocket/HTTP2).
const conectar = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const normalizados = Array.isArray(args[0]) ? args[0] : args;
  const opciones = normalizados[0];
  if (opciones && typeof opciones === 'object') {
    if (opciones.path) throw new Error('Prueba aislada: socket externo bloqueado');
    validar(opciones);
  } else if (typeof opciones === 'number' || /^\d+$/.test(String(opciones))) {
    validar({ host: typeof normalizados[1] === 'string' ? normalizados[1] : 'localhost' });
  } else {
    throw new Error('Prueba aislada: socket externo bloqueado');
  }
  return conectar.apply(this, args);
};
for (const nombre of ['http', 'https']) {
  const modulo = require(nombre);
  for (const metodo of ['request', 'get']) {
    const original = modulo[metodo];
    modulo[metodo] = function (destino, ...args) {
      validar(destino);
      if (args[0]?.hostname || args[0]?.host) validar(args[0]);
      return original.call(this, destino, ...args);
    };
  }
}
const fetchOriginal = global.fetch;
global.fetch = (destino, ...args) => {
  validar(destino instanceof Request ? destino.url : destino);
  return fetchOriginal(destino, ...args);
};
