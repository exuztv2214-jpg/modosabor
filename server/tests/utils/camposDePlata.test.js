const assert = require('assert');

const { isMoneyKey } = require('../../utils/moneyConversion');

/**
 * Tests de qué nombres reconoce el conversor como plata.
 *
 * ── El problema de fondo ───────────────────────────────────────────────────
 *
 * La base guarda centavos y el middleware los divide por 100 antes de
 * mandarlos al panel, pero sólo en los campos cuyo NOMBRE reconoce. Un campo
 * de plata con un nombre nuevo viaja crudo y se muestra cien veces más
 * grande.
 *
 * Ya pasó cuatro veces: `facturado` en la app del rider, los recargos dentro
 * de `extras`, los renglones del ticket, y ahora `margenBrutoHoy` — el
 * tablero mostraba "Margen de hoy $5.700.000" arriba de "Ventas del día
 * $57.000", y encima disparaba el aviso de "margen casi 100%, revisá los
 * costos" porque comparaba centavos contra pesos.
 *
 * ── Por qué la lista es por igualdad exacta ────────────────────────────────
 *
 * Es tentador agregar patrones amplios como "venta" o "caja". No se puede:
 * `ventasPorHora` es un objeto, `margenPct` es un porcentaje, `ventana_dias`
 * son días, `ingreso_en` es una fecha, `cajaMovimientoId` es un id y
 * `ventas_pesos` ya viene convertido. Convertir cualquiera de esos rompe algo
 * distinto, y en silencio.
 *
 * Por eso los nombres van uno por uno, y este test es la lista viva.
 */

function testLosCamposDePlata() {
  const plata = [
    // Los de siempre, por patrón
    'total',
    'subtotal',
    'precio',
    'precio_unitario',
    'costo',
    'costo_envio',
    'descuento',
    'monto',
    // Los que hubo que agregar a mano, cada uno después de un error real
    'facturado',
    'margenBrutoHoy',
    'margenBrutoAyer',
    'margen',
    'ingreso_generado',
    'ventas_atribuidas',
    'sueldo_nuevo',
    'sueldo_anterior',
  ];

  plata.forEach((clave) => {
    assert.ok(isMoneyKey(clave), `"${clave}" es plata y va a mostrarse 100 veces más grande`);
  });

  console.log(`  OK los ${plata.length} campos de plata se reconocen`);
}

function testLoQueNoEsPlata() {
  /*
    Esta mitad es la que más importa. Convertir algo que no es plata no da un
    número raro y visible: da un número plausible y equivocado. Un porcentaje
    de 85 mostrado como 0,85, o una cantidad de 4 entregas mostrada como 0,04.
  */
  const noEsPlata = [
    // Porcentajes
    ['margenPct', 'un porcentaje: 85 pasaría a 0,85'],
    ['margenPctHoy', 'un porcentaje'],
    ['descuento_empleado_pct', 'un porcentaje'],
    // Tiempos
    ['ventanaMinutos', 'minutos'],
    ['ventana_dias', 'días'],
    ['ingreso_en', 'una fecha'],
    ['imported_at', 'una fecha'],
    // Contadores
    ['total_pedidos', 'una cantidad de pedidos'],
    ['total_clientes', 'una cantidad de clientes'],
    ['entregas', 'una cantidad de entregas'],
    ['puntos_disponibles', 'puntos de fidelidad, no pesos'],
    ['saldo_actual', 'saldo de PUNTOS, no de plata'],
    // Identificadores y banderas
    ['cajaMovimientoId', 'un id'],
    ['caja_registrada', 'un sí o no'],
    ['total_liquidaciones', 'cantidad de liquidaciones, no plata'],
    // Ya convertido en el origen
    ['ventas_pesos', 'ya viene en pesos: convertirlo lo dividiría dos veces'],
  ];

  noEsPlata.forEach(([clave, porque]) => {
    assert.ok(
      !isMoneyKey(clave),
      `"${clave}" NO es plata (${porque}) y se estaría dividiendo por 100`
    );
  });

  console.log(`  OK los ${noEsPlata.length} campos que no son plata quedan afuera`);
}

function testElTableroDelDia() {
  /*
    La respuesta del tablero, con los números reales del viernes: siete
    pedidos, $57.000 de venta, sin costos cargados —así que el margen es igual
    a la venta.
  */
  const { centsToPesos } = require('../../utils/moneyConversion');
  const delServidor = {
    ventasHoy: { total: 5700000, cantidad: 7 },
    ticketPromedio: 814286,
    margenBrutoHoy: 5700000,
    margenBrutoAyer: 1900000,
    margenPctHoy: 100,
    deliveryActivos: 0,
  };

  const alTablero = centsToPesos(delServidor);

  assert.strictEqual(alTablero.ventasHoy.total, 57000, 'ventas del día');
  assert.strictEqual(
    alTablero.margenBrutoHoy,
    57000,
    'el margen tiene que dar $57.000, no $5.700.000'
  );
  assert.strictEqual(alTablero.margenPctHoy, 100, 'el porcentaje no se toca');
  assert.strictEqual(alTablero.ventasHoy.cantidad, 7, 'la cantidad de pedidos no se toca');

  /*
    Y el aviso de "margen casi 100%" tiene que poder calcularse: antes la
    cuenta daba 10.000% porque dividía centavos por pesos.
  */
  const pct = Math.round((alTablero.margenBrutoHoy / alTablero.ventasHoy.total) * 100);
  assert.strictEqual(pct, 100, `el margen sobre ventas dio ${pct}%: se están mezclando unidades`);

  console.log('  OK el tablero muestra el margen en la misma unidad que las ventas');
}

function run() {
  console.log('\nTests de los campos de plata');
  testLosCamposDePlata();
  testLoQueNoEsPlata();
  testElTableroDelDia();
  console.log('Todos los tests de los campos de plata pasaron\n');
}

run();
