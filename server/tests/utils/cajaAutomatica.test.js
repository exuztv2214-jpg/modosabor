const assert = require('assert');
const Database = require('better-sqlite3');

const { ensureOperationalCaja } = require('../../utils/operationalCaja');

function run() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE cierres_caja (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      estado TEXT,
      abierta_en TEXT,
      abierta_por_id INTEGER,
      abierta_por_nombre TEXT,
      monto_inicial INTEGER DEFAULT 0,
      notas_apertura TEXT,
      turno_id TEXT,
      turno_nombre TEXT,
      fecha_operativa TEXT,
      auto_abierta INTEGER DEFAULT 0,
      cerrada_en TEXT,
      cerrada_por_id INTEGER,
      cerrada_por_nombre TEXT,
      monto_final_declarado INTEGER,
      efectivo_esperado INTEGER,
      diferencia INTEGER,
      resumen_json TEXT,
      notas_cierre TEXT,
      auto_cierre_motivo TEXT
    );
  `);
  db.prepare(
    `INSERT INTO cierres_caja (
      estado, abierta_en, monto_inicial, turno_id, turno_nombre, fecha_operativa
    ) VALUES ('abierta', '2026-09-09 13:00:00', 5000, 'manana', 'Turno manana', '2026-09-09')`
  ).run();

  const config = {
    turnos_negocio: JSON.stringify([
      { id: 'manana', nombre: 'Turno manana', desde: '10:00', hasta: '15:00', activo: true },
    ]),
  };
  const detailedReport = {
    pedidos: 7,
    totalVentas: 45000,
    efectivoNeto: 18000,
    digitales: 27000,
    totalPendienteCobro: 1200,
    porMetodo: [{ metodo_pago: 'efectivo', total: 18000 }],
  };

  // 18:01 UTC son las 15:01 en Argentina: ya terminó el turno mañana.
  const result = ensureOperationalCaja(db, {
    config,
    date: new Date('2026-09-09T18:01:00.000Z'),
    autoOpen: false,
    buildCajaResumen: () => detailedReport,
    actor_nombre: 'Sistema',
  });
  const cierre = db.prepare('SELECT * FROM cierres_caja WHERE id = 1').get();
  const reporteGuardado = JSON.parse(cierre.resumen_json);

  assert.strictEqual(result.activeCaja, null);
  assert.strictEqual(result.events.length, 1);
  assert.strictEqual(result.events[0].type, 'closed');
  assert.strictEqual(cierre.estado, 'cerrada');
  assert.strictEqual(cierre.auto_cierre_motivo, 'Cierre automatico fuera de turno');
  assert.deepStrictEqual(reporteGuardado, detailedReport);
  assert.strictEqual(cierre.efectivo_esperado, 23000);
  assert.strictEqual(cierre.monto_final_declarado, 23000);

  db.close();
  console.log('cajaAutomatica.test.js OK');
}

if (require.main === module) run();

module.exports = { run };
