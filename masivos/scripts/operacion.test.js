const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { test } = require('node:test');

const sourcePath = path.join(__dirname, '..', 'server.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const realRequire = createRequire(sourcePath);

test('la prioridad usa cantidad de pedidos reales y luego la compra más reciente', (t) => {
  const p = panel(t);
  p.context.prioridades = [
    { numero: 'activo', scoreAuto: 100, segmentosAuto: ['activo'] },
    { numero: 'comprador-antiguo', metricas: { pedidosReales: 7, ultimoPedido: '2026-09-01' } },
    { numero: 'comprador-reciente', metricas: { pedidosReales: 7, ultimoPedido: '2026-10-01' } },
    { numero: 'mayor-comprador', metricas: { pedidosReales: 12, ultimoPedido: '2026-08-01' } },
  ];
  assert.deepEqual(Array.from(p.run('ordenarPorPrioridadCampana(prioridades).map(c=>c.numero)')), [
    'mayor-comprador',
    'comprador-reciente',
    'comprador-antiguo',
    'activo',
  ]);
});

test('crear listas reparte habilitados en 100, 100 y resto sin enviar ni cambiar límites', (t) => {
  const p = panel(t);
  const clientes = Array.from({ length: 207 }, (_, i) => ({
    numero: `549381${String(i).padStart(7, '0')}@c.us`,
    metricas: { pedidosReales: i },
  }));
  p.context.contactosPrueba = clientes;
  p.run('leerClientesEnriquecidos = () => contactosPrueba');
  p.write('excluidos.json', [clientes[206].numero]);
  p.write('pausados.json', { [clientes[205].numero]: { hasta: '2099-01-01' } });
  p.write('grupos-envio.json', [{ id: 'manual', nombre: 'Mi grupo', numeros: ['otro@lid'] }]);
  const configAntes = p.run('JSON.stringify(getConfig())');
  const resultado = p.request('/api/grupos-envio/automaticos', { nombre: 'Compradores' });
  assert.equal(resultado.status, 201);
  const grupos = resultado.body.grupos;
  assert.deepEqual(
    Array.from(grupos, (g) => g.numeros.length),
    [100, 100, 5]
  );
  const numeros = Array.from(grupos).flatMap((g) => Array.from(g.numeros));
  assert.equal(numeros[0], clientes[204].numero);
  assert.equal(numeros.at(-1), clientes[0].numero);
  assert.equal(new Set(numeros).size, 205);
  assert.equal(p.request('/api/grupos-envio', {}, 'GET').body.grupos.length, 4);
  assert.equal(p.run('JSON.stringify(getConfig())'), configAntes);
  p.context.grupoPrueba = grupos[0].id;
  assert.equal(
    p.run(
      'calcularObjetivoCampana({...getConfig(), MAX_POR_CORRIDA:100, MODO_TANDAS:true}).objetivo.length'
    ),
    205
  );
  assert.equal(
    p.run(
      "calcularObjetivoCampana({...getConfig(), MAX_POR_CORRIDA:100, MODO_TANDAS:true}, {segmento:'grupo:'+grupoPrueba}).objetivo.length"
    ),
    100
  );
  assert.deepEqual(p.sent, []);
});

test('las listas respetan selección, unifican alias y rechazan selección vacía', (t) => {
  const p = panel(t);
  p.write('clientes.json', [
    { numero: '123456789012345@lid', telefono: '5493811111111', nombre: 'Ana' },
    { numero: '5493811111111@c.us', nombre: 'Ana' },
    { numero: '5493812222222@c.us', nombre: 'Beto' },
  ]);
  const response = p.request('/api/grupos-envio/automaticos', {
    nombre: 'Elegidos',
    numeros: ['5493811111111@c.us', '123456789012345@lid'],
  });
  assert.equal(response.status, 201);
  assert.deepEqual(Array.from(response.body.grupos[0].numeros), ['123456789012345@lid']);
  for (const numeros of [[], 'todos', [null], ['desconocido@c.us']])
    assert.equal(
      p.request('/api/grupos-envio/automaticos', { nombre: 'Elegidos', numeros }).status,
      400
    );
});

test('crear listas no elimina grupos existentes al llegar al máximo', (t) => {
  const p = panel(t);
  p.write(
    'grupos-envio.json',
    Array.from({ length: 100 }, (_, i) => ({
      id: `grupo-${i}`,
      nombre: `Grupo ${i}`,
      numeros: ['5493811111111@c.us'],
    }))
  );
  assert.equal(p.request('/api/grupos-envio/automaticos', { nombre: 'Nuevos' }).status, 409);
  assert.equal(p.request('/api/grupos-envio', {}, 'GET').body.grupos[0].id, 'grupo-0');
});

function panel(t, env = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'masivos-operacion-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const routes = new Map();
  const intervals = [];
  const app = {
    use() {},
    get: (url, handler) => routes.set(`GET ${url}`, handler),
    post: (url, handler) => routes.set(`POST ${url}`, handler),
    delete: (url, handler) => routes.set(`DELETE ${url}`, handler),
    listen: () => ({ on() {} }),
  };
  const express = Object.assign(() => app, { json() {}, static() {} });
  const context = vm.createContext({
    require: (name) => {
      if (name === 'express') return express;
      if (name === 'qrcode') return {};
      if (name === 'whatsapp-web.js')
        return { MessageMedia: { fromFilePath: (file) => ({ file }) } };
      if (name === 'fs') return { ...fs };
      return realRequire(name);
    },
    __dirname: root,
    process: { env, pid: process.pid, platform: process.platform, on() {} },
    console,
    Buffer,
    URL,
    AbortSignal,
    setInterval: (callback, ms) => intervals.push({ callback, ms }),
    setTimeout: (callback, ms) => {
      if (callback.name !== 'actualizarPedidosReales')
        queueMicrotask(() => {
          context.onDelay?.(ms);
          callback();
        });
      return 0;
    },
    clearTimeout() {},
    clearInterval() {},
  });
  vm.runInContext(source, context, { filename: sourcePath });
  const run = (code) => vm.runInContext(code, context);
  const write = (name, data) => {
    const file = path.join(root, 'data', name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
  };
  write('config-override.json', {
    DELAY_MIN_MS: 0,
    DELAY_MAX_MS: 0,
    PAUSA_LARGA_CADA: 0,
    MAX_POR_HORA: 0,
    DIAS_NO_ENVIO: [],
    REINTENTOS: 1,
  });
  fs.writeFileSync(path.join(root, 'data', 'mensaje-general.txt'), 'Promo');
  write('clientes.json', [
    { numero: '5493811111111@c.us', nombre: 'Ana' },
    { numero: '5493812222222@c.us', nombre: 'Beto' },
  ]);
  run(
    "estadoWA = {estado: 'listo'}; esperarMotor = async (ms) => new Promise(resolve => setTimeout(resolve, ms));"
  );
  const sent = [];
  context.whatsapp = {
    sendMessage: async (numero) => {
      sent.push(numero);
      return {};
    },
  };
  run('client = whatsapp');
  function request(url, body = {}, method = 'POST', headers = {}) {
    let status = 200,
      result;
    const res = {
      status(value) {
        status = value;
        return this;
      },
      json(value) {
        result = value;
        return this;
      },
    };
    routes.get(`${method} ${url}`)({ body, query: {}, params: {}, headers }, res);
    return { status, body: result };
  }
  return { root, context, run, write, sent, request, intervals };
}

test('dos campañas no repiten en el turno, incluso si cambia el día o se reinicia el panel', async (t) => {
  const p = panel(t);
  p.run("turnoActual = () => '2026-10-08:noche'");
  await p.run('motor.corriendo = true; correrEnvio(false)');
  assert.equal(p.sent.length, 2);
  p.run('guardarEnviadosHoy(new Set()); motor.detener = false');
  await p.run('motor.corriendo = true; correrEnvio(false)');
  assert.equal(p.sent.length, 2);
  const restarted = panel(t);
  restarted.write(
    'envios-turno.json',
    JSON.parse(fs.readFileSync(path.join(p.root, 'data', 'envios-turno.json')))
  );
  restarted.run("turnoActual = () => '2026-10-08:noche'");
  await restarted.run('motor.corriendo = true; correrEnvio(false)');
  assert.equal(restarted.sent.length, 0);
  p.run("turnoActual = () => '2026-10-09:almuerzo'; motor.detener = false");
  await p.run('motor.corriendo = true; correrEnvio(false)');
  assert.equal(p.sent.length, 4);
});

test('el perfil se guarda por usuario y subir el logo conserva los otros ajustes', (t) => {
  const p = panel(t);
  const data =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=';
  p.run('proxyAutorizado = () => true');
  const ana = p.request('/api/perfil', { nombre: 'Ana', data }, 'POST', {
    'x-masivos-user-id': '1',
  });
  assert.equal(ana.status, 200);
  assert.match(ana.body.imagen, /^\/identidad\/[a-f0-9]+\.png$/);
  p.request('/api/perfil', { nombre: 'Beto' }, 'POST', { 'x-masivos-user-id': '2' });
  assert.equal(
    p.request('/api/perfil', {}, 'GET', { 'x-masivos-user-id': '1' }).body.nombre,
    'Ana'
  );
  assert.equal(p.request('/api/perfil', {}, 'GET', { 'x-masivos-user-id': '2' }).body.imagen, '');
  assert.equal(p.request('/api/perfil', {}, 'GET', { 'x-masivos-user-id': '../otro' }).status, 400);
  assert.equal(p.request('/api/logo', { data }).status, 200);
  assert.equal(p.run('getConfig().DELAY_MIN_MS'), 0);
  assert.equal(p.request('/api/logo', { data: 'data:image/svg+xml;base64,PHN2Zz4=' }).status, 400);
});

test('una BAJA o pausa durante la campaña impide enviar al siguiente contacto', async (t) => {
  for (const tipo of ['baja', 'pausa']) {
    const p = panel(t);
    p.context.whatsapp.sendMessage = async (numero) => {
      p.sent.push(numero);
      if (p.sent.length === 1) {
        if (tipo === 'baja') p.write('excluidos.json', ['5493812222222@c.us']);
        else p.run("pausarNumeros(['5493812222222@c.us'], 7, 'prueba')");
      }
      return {};
    };
    await p.run('motor.corriendo = true; correrEnvio(false)');
    assert.deepEqual(p.sent, ['5493811111111@c.us']);
  }
});

test('un mapeo descubierto durante la campaña no repite el envío al alias', async (t) => {
  const p = panel(t);
  p.write('clientes.json', [
    { numero: '123456789012345@lid', nombre: 'Ana' },
    { numero: '5493811111111@c.us', nombre: 'Beto' },
  ]);
  p.context.whatsapp.sendMessage = async (numero) => {
    p.sent.push(numero);
    if (p.sent.length === 1)
      p.write('clientes.json', [
        { numero: '123456789012345@lid', telefono: '5493811111111', nombre: 'Ana' },
      ]);
    return {};
  };
  await p.run('motor.corriendo = true; correrEnvio(false)');
  assert.deepEqual(p.sent, ['123456789012345@lid']);
});

test('una integración sin turnos sincronizados bloquea la preparación y conserva pedidos', async (t) => {
  const p = panel(t, { MODOSABOR_API_URL: 'http://backend', MASIVOS_PROXY_TOKEN: 'prueba' });
  assert.equal(p.request('/api/preparar-envio').status, 409);
  p.context.fetch = async (url) =>
    url.endsWith('/turnos')
      ? { ok: false, status: 503 }
      : { ok: true, json: async () => ({ clientes: [] }) };
  await p.run('actualizarPedidosReales()');
  assert.ok(fs.existsSync(path.join(p.root, 'data', 'pedidos-reales.json')));
  p.write('turnos-negocio.json', { turnos: [{ id: 'noche', desde: '20:00', hasta: '02:00' }] });
  assert.equal(p.request('/api/preparar-envio').status, 200);
});

test('Detener durante la espera de reintento no permite otro mensaje', async (t) => {
  const p = panel(t);
  let attempts = 0;
  p.context.whatsapp.sendMessage = async () => {
    attempts++;
    throw new Error('Falla transitoria');
  };
  p.context.onDelay = () => p.run('motor.detener = true');
  await p.run('motor.corriendo = true; correrEnvio(false)');
  assert.equal(attempts, 1);
});

test('Detener mientras espera un adjunto impide enviarlo', async (t) => {
  const p = panel(t);
  fs.writeFileSync(path.join(p.root, 'data', 'media', 'menu.pdf'), 'PDF');
  p.context.onDelay = () => p.run('motor.detener = true');
  await p.run('motor.corriendo = true; correrEnvio(false)');
  assert.deepEqual(p.sent, ['5493811111111@c.us']);
});

test('LID conserva exclusiones, grupos, pausas e historial del mismo teléfono', (t) => {
  const p = panel(t);
  p.write('clientes.json', [
    { numero: '123456789012345@lid', telefono: '5493811111111', nombre: 'Ana' },
  ]);
  p.write('excluidos.json', ['5493811111111@c.us']);
  p.write('grupos-envio.json', [
    { id: 'grupo-prueba', nombre: 'Prueba', numeros: ['5493811111111@c.us'] },
  ]);
  p.write('pausados.json', { '5493811111111@c.us': { hasta: '2099-01-01' } });
  p.write(`${p.run('`enviados-${hoy()}.json`')}`, ['5493811111111@c.us']);
  assert.equal(p.run("leerExcluidos().has('123456789012345@lid')"), true);
  assert.equal(p.run("grupoEnvioPorId('grupo-prueba').numeros[0]"), '123456789012345@lid');
  assert.ok(p.run("leerPausados()['123456789012345@lid']"));
  p.write('etiquetas.json', { '5493811111111@c.us': ['frecuente'] });
  assert.equal(
    p.request('/api/etiquetas', { numero: '5493811111111@c.us', tag: 'frecuente', activa: false })
      .status,
    200
  );
  assert.equal(Object.keys(p.run('leerEtiquetas()')).length, 0);
  assert.equal(p.run("cargarEnviadosHoy().has('123456789012345@lid')"), true);
  assert.equal(
    p.run("construirHistorialClientes().enviadosPorNumero.get('123456789012345@lid').length"),
    1
  );
  p.write('campanas/campana-prueba.json', {
    destinatarios: [{ numero: '5493811111111@c.us', estado: 'fallido' }],
  });
  assert.equal(p.run("numerosFallidosCampana('campana-prueba')[0]"), '123456789012345@lid');
  assert.equal(
    p.request('/api/reactivar-contactos', { numeros: ['123456789012345@lid'] }).status,
    200
  );
  assert.equal(p.run('leerExcluidos().size'), 0);
  assert.equal(Object.keys(p.run('leerPausados()')).length, 0);
});

test('la confirmación rechaza otra audiencia o cambios posteriores en el plan', (t) => {
  const p = panel(t);
  p.write('grupos-envio.json', [
    { id: 'grupo-prueba', nombre: 'Prueba', numeros: ['5493811111111@c.us'] },
  ]);
  const plan = p.request('/api/preparar-envio', { segmento: 'grupo:grupo-prueba' }).body;
  assert.equal(p.request('/api/enviar', { token: plan.token, segmento: 'todos' }).status, 409);
  assert.equal(
    p.run(`validarConfirmacion(${JSON.stringify(plan.token)}, false, 'grupo:grupo-prueba')`),
    true
  );
  fs.writeFileSync(path.join(p.root, 'data', 'mensaje-general.txt'), 'Otro mensaje');
  assert.equal(
    p.request('/api/enviar', { token: plan.token, segmento: 'grupo:grupo-prueba' }).status,
    409
  );
  fs.writeFileSync(path.join(p.root, 'data', 'mensaje-general.txt'), 'Promo');
  p.write('grupos-envio.json', [
    { id: 'grupo-prueba', nombre: 'Prueba', numeros: ['5493812222222@c.us'] },
  ]);
  assert.equal(
    p.request('/api/enviar', { token: plan.token, segmento: 'grupo:grupo-prueba' }).status,
    409
  );
  assert.deepEqual(p.sent, []);
});

test(
  'una confirmación vigente permite enviar solo al grupo revisado',
  { timeout: 2000 },
  async (t) => {
    const p = panel(t);
    p.write('grupos-envio.json', [
      { id: 'grupo-prueba', nombre: 'Prueba', numeros: ['5493811111111@c.us'] },
    ]);
    const plan = p.request('/api/preparar-envio', { segmento: 'grupo:grupo-prueba' }).body;
    assert.equal(
      p.request('/api/enviar', { token: plan.token, segmento: 'grupo:grupo-prueba' }).status,
      200
    );
    // El handler inicia el trabajo en segundo plano; esperar su evento de fin.
    while (p.run('motor.corriendo')) await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(p.sent, ['5493811111111@c.us']);
  }
);

test('importar el teléfono de un LID no duplica la audiencia ni repite el envío del día', async (t) => {
  const p = panel(t);
  p.write('clientes.json', [
    { numero: '123456789012345@lid', telefono: '5493811111111', nombre: 'Ana' },
  ]);
  p.run(
    "fusionarContactosEntrantes([{numero:'5493811111111@c.us', nombre:'Ana', origen:'crm'}], 'prueba')"
  );
  assert.equal(p.run('leerClientesEnriquecidos().length'), 1);
  assert.equal(p.run('calcularObjetivoCampana(getConfig()).objetivo.length'), 1);
  p.write(p.run('`enviados-${hoy()}.json`'), ['5493811111111@c.us']);
  p.write('envios-turno.json', { [p.run('turnoActual()')]: ['5493811111111@c.us'] });
  assert.equal(p.run('calcularObjetivoCampana(getConfig()).objetivo.length'), 0);
  await p.run('motor.corriendo = true; correrEnvio(false)');
  assert.deepEqual(p.sent, []);
});

test('cambiar configuración o medios invalida el plan preparado', (t) => {
  for (const cambio of ['configuracion', 'flyer']) {
    const p = panel(t);
    const plan = p.request('/api/preparar-envio', { segmento: 'todos' }).body;
    if (cambio === 'configuracion') p.write('config-override.json', { MAX_POR_CORRIDA: 1 });
    else fs.writeFileSync(path.join(p.root, 'data', 'media', 'promo.png'), 'flyer nuevo');
    assert.equal(p.request('/api/enviar', { token: plan.token, segmento: 'todos' }).status, 409);
    assert.deepEqual(p.sent, []);
  }
});

test('el programador no inicia una campaña general con salud roja', (t) => {
  const p = panel(t);
  p.run(`getConfig = () => ({PROGRAMACION_ACTIVA:true, PROGRAMACION_HORA: new Date().toTimeString().slice(0,5)});
    calcularSaludNumero = () => ({estado:'rojo'});
    correrEnvio = async () => { globalThis.started = true; };`);
  p.intervals.find((item) => item.ms === 30000).callback();
  assert.notEqual(p.context.started, true);
});

test('un fallo del reemplazo conserva el JSON original', (t) => {
  const p = panel(t);
  const original = fs.readFileSync(path.join(p.root, 'data', 'clientes.json'), 'utf8');
  p.run("fs.renameSync = () => { throw new Error('fallo de rename'); }");
  assert.throws(() => p.run('escribirJsonSeguro(ARCHIVO_CLIENTES, [])'), /fallo de rename/);
  assert.equal(fs.readFileSync(path.join(p.root, 'data', 'clientes.json'), 'utf8'), original);
});

test('el motor conserva los envíos de toda la ventana configurada', async (t) => {
  const p = panel(t);
  p.write('config-override.json', {
    DELAY_MIN_MS: 0,
    DELAY_MAX_MS: 0,
    PAUSA_LARGA_CADA: 0,
    MAX_POR_HORA: 10,
    VENTANA_CUPO_MINUTOS: 120,
    DIAS_NO_ENVIO: [],
  });
  p.write(p.run('`envios-hora-${hoy()}.json`'), [Date.now() - 90 * 60000]);
  await p.run('motor.corriendo = true; correrEnvio(false)');
  assert.equal(p.run('enviosUltimaVentana(120).length'), 3);
});

test('sincronizar conserva fichas anteriores que no aparecieron en WhatsApp', () => {
  const { mergeSyncedContacts } = realRequire('./contact-sync');
  const previo = {
    numero: '5493811111111@c.us',
    nombre: 'Ana',
    telefono: '5493811111111',
    origen: 'chat',
  };
  assert.deepEqual(mergeSyncedContacts([], [], [previo]), [previo]);
});

test('un alias importado no borra la última conversación conocida del contacto', () => {
  const { mergeSyncedContacts } = realRequire('./contact-sync');
  const lid = {
    numero: '123456789012345@lid',
    telefono: '5493811111111',
    nombre: 'Ana',
    ultimoMensaje: '2026-10-08',
  };
  for (const ultimoMensaje of [null, '2026-10-01']) {
    const merged = mergeSyncedContacts(
      [],
      [],
      [lid, { numero: '5493811111111@c.us', nombre: 'Ana', ultimoMensaje }]
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].ultimoMensaje, '2026-10-08');
  }
  const merged = mergeSyncedContacts(
    [{ id: lid.numero, timestamp: Date.parse('2026-10-01') / 1000 }],
    [],
    [lid]
  );
  assert.equal(merged[0].ultimoMensaje, '2026-10-08');
});
