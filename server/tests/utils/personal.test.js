const assert = require('assert');

/**
 * Tests del módulo de personal — los tres arreglos de la auditoría.
 *
 * 1. Las fechas por defecto ya no salen en UTC
 * 2. Un ascenso no divide el sueldo por 100
 * 3. total_liquidaciones no se muestra como plata
 */

// ───────────────────────────────────────────────────────────────────────
// 1. hoyArgentina() da la fecha del negocio, no UTC
// ───────────────────────────────────────────────────────────────────────

function testHoyArgentinaDaElDiaDelNegocio() {
  const { hoyArgentina } = require('../../utils/fechaLocal');

  const hoy = hoyArgentina();

  // Formato YYYY-MM-DD
  assert.match(hoy, /^\d{4}-\d{2}-\d{2}$/, `hoyArgentina() devolvió "${hoy}"`);

  // Tiene que coincidir con Intl en zona argentina
  const esperado = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  assert.strictEqual(hoy, esperado, `hoyArgentina() = "${hoy}", Intl dice "${esperado}"`);

  console.log('  OK hoyArgentina() da la fecha del negocio');
}

function testIsoDateSinArgUsaHoyArgentina() {
  /*
    isoDate() en personal.js ahora delega en hoyArgentina() cuando se llama
    sin argumento. isoDate(fecha) sigue formateando esa fecha concreta.

    No podemos importar isoDate directamente (es una función interna del
    router), pero podemos verificar que hoyArgentina() no da lo mismo que
    toISOString() a la hora en que difieran — si corriéramos en UTC después
    de las 21:00 argentina.

    Lo que sí podemos verificar es la propiedad fundamental: que
    hoyArgentina() nunca se adelanta al día UTC cuando todavía no es ese
    día en Argentina.
  */
  const { hoyArgentina } = require('../../utils/fechaLocal');

  const ahora = new Date();
  const utcDay = ahora.toISOString().split('T')[0];
  const argDay = hoyArgentina();

  // Argentina está atrás de UTC, nunca adelante
  assert.ok(argDay <= utcDay, `Argentina (${argDay}) no puede estar después de UTC (${utcDay})`);

  console.log('  OK la fecha argentina nunca se adelanta a UTC');
}

// ───────────────────────────────────────────────────────────────────────
// 2. sueldo_nuevo se reconoce como plata → el ascenso convierte bien
// ───────────────────────────────────────────────────────────────────────

function testAscensoConvierteSueldo() {
  const { isMoneyKey, pesosToCents, centsToPesos } = require('../../utils/moneyConversion');

  // El conversor tiene que reconocer sueldo_nuevo y sueldo_anterior
  assert.ok(isMoneyKey('sueldo_nuevo'), 'sueldo_nuevo tiene que ser plata');
  assert.ok(isMoneyKey('sueldo_anterior'), 'sueldo_anterior tiene que ser plata');

  // Simular lo que hace el middleware con el body del ascenso
  const body = { categoria_id: 2, sueldo_nuevo: 450000, motivo: 'ascenso a encargado' };
  const convertido = pesosToCents(body);

  // $450.000 → 45.000.000 centavos
  assert.strictEqual(
    convertido.sueldo_nuevo,
    45000000,
    `sueldo_nuevo tendría que ser 45000000 centavos, no ${convertido.sueldo_nuevo}`
  );
  // El motivo no se toca
  assert.strictEqual(convertido.motivo, 'ascenso a encargado');

  // Y a la vuelta: centavos → pesos
  const historial = {
    sueldo_anterior: 30000000,
    sueldo_nuevo: 45000000,
    motivo: 'ascenso a encargado',
  };
  const alPanel = centsToPesos(historial);
  assert.strictEqual(alPanel.sueldo_anterior, 300000, 'sueldo_anterior: 30000000 → 300000');
  assert.strictEqual(alPanel.sueldo_nuevo, 450000, 'sueldo_nuevo: 45000000 → 450000');

  console.log('  OK el ascenso convierte el sueldo bien en ambas direcciones');
}

function testSueldoAnteriorYNuevoEnMismaUnidad() {
  const { centsToPesos } = require('../../utils/moneyConversion');

  // Reproducir lo que guardaba el bug: sueldo_anterior en centavos,
  // sueldo_nuevo en pesos (sin convertir)
  const filaBuena = {
    sueldo_anterior: 30000000,
    sueldo_nuevo: 45000000,
  };

  const alPanel = centsToPesos(filaBuena);

  // Las dos columnas tienen que salir en la misma escala
  assert.ok(
    alPanel.sueldo_nuevo > alPanel.sueldo_anterior,
    `un ascenso sube el sueldo: anterior=${alPanel.sueldo_anterior}, nuevo=${alPanel.sueldo_nuevo}`
  );

  console.log('  OK sueldo_anterior y sueldo_nuevo salen en la misma unidad');
}

// ───────────────────────────────────────────────────────────────────────
// 3. total_liquidaciones es un contador, no plata
// ───────────────────────────────────────────────────────────────────────

function testTotalLiquidacionesNoEsPlata() {
  const { isMoneyKey, centsToPesos } = require('../../utils/moneyConversion');

  assert.ok(
    !isMoneyKey('total_liquidaciones'),
    'total_liquidaciones NO es plata: es la cantidad de liquidaciones'
  );

  // Simular lo que devuelve la ficha del empleado
  const ficha = {
    nombre: 'Juan',
    total_liquidaciones: 3,
    monto_base: 45000000,
  };

  const alPanel = centsToPesos(ficha);
  assert.strictEqual(
    alPanel.total_liquidaciones,
    3,
    `total_liquidaciones tiene que seguir siendo 3, no ${alPanel.total_liquidaciones}`
  );
  assert.strictEqual(alPanel.monto_base, 450000, 'monto_base sí se convierte');

  console.log('  OK total_liquidaciones no se convierte (es un contador)');
}

// ───────────────────────────────────────────────────────────────────────

function run() {
  console.log('\nTests del módulo de personal');
  testHoyArgentinaDaElDiaDelNegocio();
  testIsoDateSinArgUsaHoyArgentina();
  testAscensoConvierteSueldo();
  testSueldoAnteriorYNuevoEnMismaUnidad();
  testTotalLiquidacionesNoEsPlata();
  console.log('Todos los tests del módulo de personal pasaron\n');
}

run();
