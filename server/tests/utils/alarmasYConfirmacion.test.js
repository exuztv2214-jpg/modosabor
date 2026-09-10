/**
 * Dos formas de quedarse callado sin que nadie se entere.
 *
 * ── 1. El aviso de pedido nuevo dejaba de sonar ────────────────────────────
 *
 * El panel avisa los pedidos y las entregas por socket. Si la conexión se caía
 * y no volvía, la pantalla se veía perfecta y **no sonaba nunca más**: sin
 * error, sin cartel, simplemente dejaban de llegar pedidos.
 *
 * El socket se rendía a los cinco intentos, uno por segundo. Cinco segundos de
 * red mala —una siesta de la notebook, un parpadeo del wifi, un deploy— y la
 * pestaña quedaba muda hasta recargarla. Encima, al quinto error llamaba a
 * `disconnect()`, que apagaba también el reintento propio de socket.io.
 *
 * La única pantalla que se recuperaba era Pedidos, porque repasa por su cuenta
 * cada quince segundos. Por eso había que entrar ahí para que volviera a sonar,
 * que es exactamente el síntoma que se reportó.
 *
 * ── 2. La IA confirmaba pedidos que no existían ────────────────────────────
 *
 * El control que verifica que el pedido exista antes de confirmárselo al
 * cliente tenía una salida de emergencia:
 *
 *     (!externalCatalog || !includesOrderNumber(output))
 *
 * Con el catálogo externo configurado —que es el caso— eso apagaba el control
 * **cada vez que el modelo escribía un número**. Le alcanzaba con decir "es el
 * #243" para pasar de largo: el número inventado por el modelo se usaba como
 * prueba de que el pedido existía.
 *
 * Los dos fallos comparten la forma: nada se rompe, nada avisa, y alguien
 * espera. Por eso se prueban juntos.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const leerCliente = (rel) =>
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'client', 'src', rel), 'utf8');

/** Saca comentarios: un chequeo que se engancha con un comentario pasa siempre. */
const sinComentarios = (fuente) =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function run() {
  console.log('\n🔔 Alarmas que suenan y pedidos que existen\n');

  // ── 1. El socket no se rinde ──────────────────────────────────────────────
  const socket = sinComentarios(leerCliente('lib/socket.js'));

  assert.ok(
    /reconnectionAttempts:\s*Infinity/.test(socket),
    'el socket volvió a tener un tope de reintentos: al agotarlo la pestaña queda muda'
  );
  assert.ok(
    /reconnectionDelayMax:\s*\d+/.test(socket),
    'sin tope de espera, los reintentos golpean el servidor sin descanso'
  );
  console.log('  ✓ el socket reintenta siempre, con espera creciente');

  // Lo que apagaba el reintento propio de socket.io.
  const bloqueError = socket.slice(socket.indexOf("on('connect_error'"));
  assert.ok(
    !/disconnect\(\)/.test(bloqueError.slice(0, 300)),
    'volvió el disconnect() ante errores de conexión: eso apaga el reintento de socket.io'
  );
  console.log('  ✓ un error de conexión ya no apaga el reintento');

  // ── 2. Algo lo despierta cuando la máquina vuelve ─────────────────────────
  //
  // Hay caídas que no disparan ningún evento: el navegador cree que sigue
  // conectado y el servidor ya lo soltó. Por eso van los tres disparadores más
  // el repaso de fondo.
  for (const [disparador, patron] of [
    ['al volver a la pestaña', /visibilitychange/],
    ['al volver la red', /'online'/],
    ['al volver el foco', /'focus'/],
    ['un repaso de fondo', /setInterval\(revivir/],
  ]) {
    assert.ok(patron.test(socket), `falta reconectar ${disparador}`);
  }
  console.log('  ✓ reconecta al volver la pestaña, la red, el foco, y por las dudas cada tanto');

  // Y que no reviva una conexión que nadie quiere: si el panel está cerrado,
  // reconectar cada veinte segundos para siempre es tirar batería y datos.
  assert.ok(
    /if \(this\.persistentConnections <= 0\) return;/.test(socket),
    'está reconectando aunque ninguna pantalla necesite la conexión'
  );
  console.log('  ✓ no revive la conexión si ninguna pantalla la está usando');

  // ── 3. El aviso es global, no sólo en Pedidos ─────────────────────────────
  //
  // Es la otra mitad del síntoma: si el aviso viviera sólo en una pantalla,
  // arreglar el socket no alcanzaría.
  const layout = sinComentarios(leerCliente('components/Layout.jsx'));
  assert.strictEqual(
    (layout.match(/<GlobalOrderAlerts \/>/g) || []).length,
    2,
    'el aviso global dejó de estar en alguna de las dos formas del panel (el TPV usa la suya)'
  );
  console.log('  ✓ el aviso está montado en todo el panel, también en el TPV');

  // El login web usa una cookie httpOnly: por diseño React no recibe el JWT.
  // Exigir `token` acá deja sin listeners a todo el panel aunque la sesión sea
  // válida. El socket debe retener la sesión por cookie y aceptar token sólo
  // como compatibilidad con clientes nativos.
  const alertasGlobales = sinComentarios(leerCliente('components/GlobalOrderAlerts.jsx'));
  const hookSocket = sinComentarios(leerCliente('hooks/useAuthenticatedSocket.js'));
  assert.ok(!/!isAuth\s*\|\|\s*!token/.test(alertasGlobales));
  assert.ok(!/!isAuth\s*\|\|\s*!token/.test(hookSocket));
  assert.ok(/retainSession\(token\)/.test(alertasGlobales));
  assert.ok(/retainSession\(token\)/.test(hookSocket));
  console.log('  ✓ la cookie del panel activa alarmas, Caja y Delivery sin exponer el JWT');

  const socketServidor = sinComentarios(
    fs.readFileSync(path.join(__dirname, '..', '..', 'utils', 'socketRooms.js'), 'utf8')
  );
  assert.ok(
    /function usuarioActivoDesdeToken/.test(socketServidor) &&
      (socketServidor.match(/usuarioActivoDesdeToken\(/g) || []).length >= 3,
    'el socket dejó de revalidar contra la base a usuarios y roles'
  );
  assert.ok(
    /datetime\('now', '-7 days'\)/.test(socketServidor),
    'el token persistido de seguimiento dejó de vencer a los siete días'
  );
  console.log('  ✓ usuarios desactivados y enlaces vencidos no conservan acceso al socket');

  // ── 4. La IA no confirma pedidos que no existen ───────────────────────────
  const gateway = sinComentarios(
    fs.readFileSync(path.join(__dirname, '..', '..', 'services', 'whatsappGateway.js'), 'utf8')
  );

  assert.ok(
    !/includesOrderNumber/.test(gateway),
    'volvió a usarse el número que escribió el modelo como prueba de que el pedido existe'
  );
  console.log('  ✓ el número que escribe la IA no vale como prueba');

  // La prueba válida es una sola: haberlo encontrado en la base local o en la
  // remota. Si ninguna lo encuentra, no se confirma.
  assert.ok(
    /claimsOrderWasCreated\(output\)\s*&&\s*!createdOrder\s*&&\s*!createdExternalOrder\s*&&\s*!pedidoConsultado/.test(
      gateway
    ),
    'cambió la condición que bloquea la confirmación: revisá que siga exigiendo el pedido real'
  );
  console.log('  ✓ sólo se confirma si el pedido apareció de verdad');

  // Y que al bloquear se le pase el chat a una persona, o el cliente queda
  // esperando una respuesta que no llega.
  const bloque = gateway.slice(gateway.search(/if\s*\(\s*claimsOrderWasCreated\(output\)/));
  assert.ok(
    /escalado_humano = 1/.test(bloque.slice(0, 900)),
    'se bloquea la confirmación pero no se avisa a nadie del local'
  );
  console.log('  ✓ cuando se bloquea, el chat pasa a una persona\n');

  // Si todos los proveedores fallan, una persona recibe la conversación:
  // nunca obligar al cliente a repetir mensajes contra una cuota agotada.
  const bloqueErrorAgente = gateway.slice(
    gateway.indexOf("logger.error('WhatsApp Gateway: fallo la atencion IA'")
  );
  assert.ok(
    /createdWhatsappOrderAfter\(telefono, previousOrder\?\.id\)/.test(bloqueErrorAgente),
    'un error del agente no comprueba si alcanzó a crear un pedido'
  );
  assert.ok(
    bloqueErrorAgente.includes('escalado_humano = 1') &&
      /pedirUnaPersona\(\s*conversation,\s*telefono/.test(bloqueErrorAgente),
    'un error del proveedor no deriva a una persona'
  );
  assert.ok(
    !bloqueErrorAgente.includes('Mandame el mensaje otra vez'),
    'un error vuelve a dejar al cliente en un bucle de reintentos'
  );
  console.log('  ✓ los errores de proveedor avisan a una persona sin pedir reintentos\n');

  console.log('✅ Alarmas y confirmaciones: nadie se queda esperando en silencio\n');
}

if (require.main === module) run();

module.exports = { run };
