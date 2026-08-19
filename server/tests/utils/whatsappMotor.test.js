const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const Database = require('better-sqlite3');

/**
 * Tests del bucle de envío, contra un SQLite real.
 *
 * ── Por qué contra una base y no con dobles ────────────────────────────────
 *
 * Lo que se prueba acá es exactamente lo que no se puede probar leyendo: que
 * nadie reciba dos veces, que el cupo se mida contra lo que pasó de verdad y
 * que el corte funcione en el medio de una corrida. Las tres dependen de
 * cómo queda la base después, no de qué devuelve una función.
 *
 * ── El escenario que importa ───────────────────────────────────────────────
 *
 * El proceso se cae en el medio del envío. Cuando vuelve, ¿le escribe otra
 * vez a los que ya recibieron? Si la respuesta es sí, el cliente recibe la
 * misma promo dos o tres veces y te reporta. Eso es lo que dispara el
 * bloqueo del número, no el volumen.
 */

// ── Base de prueba, con la forma real ─────────────────────────────────────

function crearBase() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE configuracion (clave TEXT PRIMARY KEY, valor TEXT);
    CREATE TABLE clientes (
      id INTEGER PRIMARY KEY, nombre TEXT, telefono TEXT, total_pedidos INTEGER DEFAULT 0
    );
    CREATE TABLE pedidos (
      id INTEGER PRIMARY KEY, cliente_id INTEGER, creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Las tablas wa_* salen del mismo SQL que corre en producción, para que el
  // test no se quede probando un esquema paralelo que fue divergiendo.
  const fuente = fs.readFileSync(path.resolve(__dirname, '../../db/migrations.js'), 'utf8');
  const desde = fuente.indexOf('function crearTablasWhatsapp');
  const abre = fuente.indexOf('`', desde);
  db.exec(fuente.slice(abre + 1, fuente.indexOf('`', abre + 1)));
  return db;
}

/**
 * Carga el motor con una base de mentira y sin WhatsApp de verdad.
 *
 * Se limpia la caché de módulos a mano: `motor.js` guarda la referencia a la
 * base al cargarse, así que sin esto el segundo test correría contra la base
 * del primero.
 */
function cargarMotor(db, { fallaEn = [] } = {}) {
  const S = path.resolve(__dirname, '../..');
  const rutas = [
    `${S}/db/index.js`,
    `${S}/services/whatsappMasivo/motor.js`,
    `${S}/services/whatsappMasivo/conexion.js`,
  ];
  rutas.forEach((r) => {
    try {
      delete require.cache[require.resolve(r)];
    } catch {
      /* puede no estar cargado todavía */
    }
  });

  const original = Module._resolveFilename;
  const enviados = [];
  Module._resolveFilename = function (pedido, ...resto) {
    if (pedido === '../../db' || pedido === '../db') return 'db-falsa';
    if (pedido === './conexion') return 'conexion-falsa';
    return original.call(this, pedido, ...resto);
  };
  require.cache['db-falsa'] = { id: 'db-falsa', filename: 'db-falsa', loaded: true, exports: db };
  require.cache['conexion-falsa'] = {
    id: 'conexion-falsa',
    filename: 'conexion-falsa',
    loaded: true,
    exports: {
      conexion: {
        listo: true,
        async enviarTexto(jid, texto) {
          const tel = String(jid).split('@')[0];
          if (fallaEn.includes(tel)) throw new Error('numero inexistente');
          enviados.push({ tel, texto });
        },
      },
    },
  };

  const motorMod = require(`${S}/services/whatsappMasivo/motor.js`);
  Module._resolveFilename = original;
  return { ...motorMod, enviados };
}

function sembrarClientes(db, cantidad) {
  const ins = db.prepare(
    "INSERT INTO wa_contactos (id, jid, nombre, telefono, origen) VALUES (?, ?, ?, ?, 'test')"
  );
  for (let i = 1; i <= cantidad; i += 1) {
    const telefono = `54938155${String(50000 + i).slice(-5)}`;
    ins.run(i, `${telefono}@s.whatsapp.net`, `Cliente ${i}`, telefono);
  }
}

/** Sin espera entre mensajes, para que el test corra en milisegundos. */
function configRapida(db) {
  const set = db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)');
  set.run('wa_demoraMinMs', '0');
  set.run('wa_demoraMaxMs', '0');
  set.run('wa_pausaLargaCada', '0');
  set.run('wa_maxPorCorrida', '100');
  set.run('wa_diasSinEnvio', '[]');
}

// ── Tests ─────────────────────────────────────────────────────────────────

async function testNadieRecibeDosVeces() {
  const db = crearBase();
  sembrarClientes(db, 5);
  configRapida(db);
  const { motor, enviados } = cargarMotor(db);

  const previa = motor.preparar({ mensaje: 'Hoy hay milanesa a la napolitana' });
  assert.strictEqual(previa.total, 5);

  await motor.arrancar(previa.campanaId);
  await new Promise((r) => setTimeout(r, 400));

  assert.strictEqual(enviados.length, 5, 'tenían que salir los cinco');
  const unicos = new Set(enviados.map((e) => e.tel));
  assert.strictEqual(unicos.size, 5, 'un mismo número recibió dos veces');

  /*
    Y ahora lo que de verdad importa: preparar otra campaña el mismo día no
    puede volver a incluir a los que ya recibieron.
  */
  assert.throws(
    () => motor.preparar({ mensaje: 'Segunda vuelta' }),
    /contactos/i,
    'la segunda campaña del día volvió a agarrar a los mismos'
  );

  console.log('  OK nadie recibe dos veces dentro del mismo turno');
}

function testUnEnvioPorTurno() {
  const db = crearBase();
  sembrarClientes(db, 3);
  configRapida(db);
  const { motor, claveTurno } = cargarMotor(db);
  const claveManana = '2026-08-19:manana';
  const claveNoche = '2026-08-19:noche';

  db.prepare(
    "INSERT INTO wa_campanas (id, mensaje, estado) VALUES (1, 'Prueba', 'terminada')"
  ).run();
  db.prepare(
    "INSERT INTO wa_envios (campana_id, cliente_id, telefono, nombre, estado, turno_clave) VALUES (1, 1, ?, 'Cliente 1', 'enviado', ?)"
  ).run('5493815550001', claveManana);

  assert.strictEqual(
    motor.destinatarios({ turnoClave: claveManana }).length,
    2,
    'un contacto que ya recibió durante la mañana no debe repetir en la mañana'
  );
  assert.strictEqual(
    motor.destinatarios({ turnoClave: claveNoche }).length,
    3,
    'el contacto debe volver a quedar disponible en el turno noche'
  );

  const turnos = {
    turnos_negocio: JSON.stringify([
      { id: 'manana', desde: '10:00', hasta: '14:30', activo: true },
      { id: 'noche', desde: '20:30', hasta: '02:00', activo: true },
    ]),
  };
  assert.strictEqual(claveTurno(turnos, new Date('2026-08-20T02:30:00Z')), '2026-08-19:noche');
  assert.strictEqual(claveTurno(turnos, new Date('2026-08-20T03:30:00Z')), '2026-08-19:noche');

  console.log('  OK se limita por turno y la noche que cruza medianoche no se parte en dos');
}

async function testLosFallidosSeAnotan() {
  const db = crearBase();
  sembrarClientes(db, 4);
  configRapida(db);
  // El segundo número no existe en WhatsApp.
  const { motor, enviados } = cargarMotor(db, { fallaEn: ['5493815550002'] });

  const previa = motor.preparar({ mensaje: 'Promo del día de hoy' });
  await motor.arrancar(previa.campanaId);
  await new Promise((r) => setTimeout(r, 400));

  assert.strictEqual(enviados.length, 3, 'tenían que salir tres');
  const fallidos = db
    .prepare("SELECT telefono, error FROM wa_envios WHERE estado = 'fallido'")
    .all();
  assert.strictEqual(fallidos.length, 1, 'el que falló tiene que quedar anotado');
  assert.ok(fallidos[0].error, 'sin el motivo no se puede saber qué pasó');

  const campana = db.prepare('SELECT * FROM wa_campanas WHERE id = ?').get(previa.campanaId);
  assert.strictEqual(campana.enviados, 3);
  assert.strictEqual(campana.fallidos, 1);
  assert.strictEqual(campana.estado, 'terminada');

  console.log('  OK los fallidos quedan anotados con el motivo');
}

async function testSePuedeDetener() {
  const db = crearBase();
  sembrarClientes(db, 40);
  const set = db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)');
  set.run('wa_demoraMinMs', '60');
  set.run('wa_demoraMaxMs', '60');
  set.run('wa_pausaLargaCada', '0');
  set.run('wa_maxPorCorrida', '100');
  set.run('wa_diasSinEnvio', '[]');
  const { motor, enviados } = cargarMotor(db);

  const previa = motor.preparar({ mensaje: 'Una promo larga para poder cortarla' });
  await motor.arrancar(previa.campanaId);
  await new Promise((r) => setTimeout(r, 250));

  const alCortar = enviados.length;
  motor.detener();
  await new Promise((r) => setTimeout(r, 400));

  assert.ok(alCortar > 0 && alCortar < 40, `se cortó en ${alCortar}: tenía que ser en el medio`);
  assert.ok(
    enviados.length <= alCortar + 1,
    `siguió mandando después de detener: ${alCortar} -> ${enviados.length}`
  );
  assert.strictEqual(motor.resumen().corriendo, false, 'el motor tiene que quedar parado');
  assert.strictEqual(
    db.prepare('SELECT estado FROM wa_campanas WHERE id = ?').get(previa.campanaId).estado,
    'cancelada'
  );

  /*
    Los que no llegaron a salir quedan pendientes, no perdidos: sin eso, un
    corte a mitad de camino se lleva puesta media lista sin dejar rastro.
  */
  const pendientes = db
    .prepare("SELECT COUNT(*) AS c FROM wa_envios WHERE campana_id = ? AND estado = 'pendiente'")
    .get(previa.campanaId).c;
  assert.ok(pendientes > 0, 'los que no salieron tienen que quedar pendientes');

  console.log(
    `  OK se detiene en el medio (cortó en ${alCortar} de 40) y no pierde a los que faltan`
  );
}

async function testElCupoFrena() {
  const db = crearBase();
  sembrarClientes(db, 10);
  const set = db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)');
  set.run('wa_demoraMinMs', '0');
  set.run('wa_demoraMaxMs', '0');
  set.run('wa_pausaLargaCada', '0');
  set.run('wa_maxPorCorrida', '100');
  set.run('wa_diasSinEnvio', '[]');
  set.run('wa_maxPorVentana', '3');
  set.run('wa_ventanaMinutos', '60');
  const { motor, enviados } = cargarMotor(db);

  const previa = motor.preparar({ mensaje: 'Promo con cupo bajo para probar el freno' });
  await motor.arrancar(previa.campanaId);
  await new Promise((r) => setTimeout(r, 500));

  /*
    Con cupo 3 por hora tiene que frenar en 3 y quedarse esperando, no seguir
    de largo. Un cupo que no frena es peor que no tener cupo: da confianza
    falsa.
  */
  assert.strictEqual(enviados.length, 3, `salieron ${enviados.length} con un cupo de 3`);
  assert.strictEqual(motor.resumen().corriendo, true, 'tiene que quedar esperando, no terminar');

  motor.detener();
  await new Promise((r) => setTimeout(r, 300));

  console.log('  OK el cupo por ventana frena y espera en vez de seguir de largo');
}

function testLaBajaExcluye() {
  const db = crearBase();
  sembrarClientes(db, 3);
  configRapida(db);
  const { motor, registrarRespuesta } = cargarMotor(db);

  assert.strictEqual(motor.destinatarios().length, 3);

  registrarRespuesta({ telefono: '3815550002', texto: 'BAJA' });
  assert.strictEqual(motor.destinatarios().length, 2, 'el que pidió la baja sigue en la lista');

  // Y un reclamo NO puede sacar a nadie.
  registrarRespuesta({ telefono: '3815550003', texto: 'no me llegó el pedido' });
  assert.strictEqual(
    motor.destinatarios().length,
    2,
    'se dio de baja a alguien que estaba reclamando'
  );

  const guardadas = db.prepare('SELECT texto, es_baja FROM wa_respuestas ORDER BY id').all();
  assert.strictEqual(guardadas.length, 2, 'las dos respuestas se guardan igual');
  assert.strictEqual(guardadas[0].es_baja, 1);
  assert.strictEqual(guardadas[1].es_baja, 0);

  console.log('  OK la baja excluye y el reclamo no');
}

function testSinTelefonoUsableNoEntra() {
  const db = crearBase();
  const ins = db.prepare('INSERT INTO wa_contactos (jid, nombre, telefono) VALUES (?, ?, ?)');
  ins.run('5493815554433@s.whatsapp.net', 'Con teléfono bueno', '0381 15 555-4433');
  ins.run('sin-telefono@s.whatsapp.net', 'Sin teléfono', '');
  ins.run('ilegible@s.whatsapp.net', 'Teléfono ilegible', 'llamar al local');
  ins.run('corto@s.whatsapp.net', 'Muy corto', '12345');
  configRapida(db);
  const { motor } = cargarMotor(db);

  const lista = motor.destinatarios();
  assert.strictEqual(lista.length, 1, `entraron ${lista.length}: sólo uno tiene teléfono usable`);
  assert.strictEqual(lista[0].tel, '5493815554433', 'y tiene que quedar normalizado');

  console.log('  OK los clientes sin teléfono usable no entran a la lista');
}

async function run() {
  console.log('\nTests del motor de envío de WhatsApp');
  testSinTelefonoUsableNoEntra();
  testLaBajaExcluye();
  testUnEnvioPorTurno();
  await testNadieRecibeDosVeces();
  await testLosFallidosSeAnotan();
  await testSePuedeDetener();
  await testElCupoFrena();
  console.log('Todos los tests del motor de envío pasaron\n');
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { run };
