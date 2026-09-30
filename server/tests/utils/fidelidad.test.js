const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { recalculateClienteStats } = require('../../utils/loyalty');

/**
 * Tests del circuito de fidelidad.
 *
 * ── Qué se está cuidando acá ───────────────────────────────────────────────
 *
 * Había dos sistemas de fidelidad escribiendo las mismas columnas:
 *
 *   · `utils/loyalty.js`, viejo, con las cuentas escritas a mano.
 *   · `services/fidelizacionService.js`, el bueno: libro de transacciones de
 *     puntos, `pesos_por_punto` configurable y niveles en tabla.
 *
 * El viejo corría en cada cambio de estado de un pedido y pisaba el saldo del
 * libro de puntos con su propia cuenta. Coincidían de casualidad, sólo mientras
 * nadie tocara la configuración.
 *
 * Estos tests existen para que esa separación no se deshaga sin que nadie se
 * entere: el día que alguien vuelva a meter `puntos` en ese UPDATE, falla acá y
 * no en la cuenta de un cliente.
 */

/*
  Una base falsa que anota el SQL que recibe.

  Sirve para preguntarle a la función qué escribió, sin depender de un SQLite
  real: los tests corren igual en cualquier máquina y no hace falta preparar
  datos para tres tablas.
*/
function baseFalsa({ pedidos = [] } = {}) {
  const sentencias = [];
  return {
    sentencias,
    prepare(sql) {
      sentencias.push(sql);
      return {
        get: () => ({ id: 1 }),
        all: () => pedidos,
        run: () => ({ changes: 1 }),
      };
    },
  };
}

function testNoTocaPuntosNiNivel() {
  const db = baseFalsa({
    pedidos: [
      { total: 1000000, creado_en: '2026-08-01 20:00:00' },
      { total: 1500000, creado_en: '2026-08-04 20:00:00' },
    ],
  });

  recalculateClienteStats(db, 1);

  const updates = db.sentencias.filter((sql) => /UPDATE\s+clientes/i.test(sql));
  assert.ok(updates.length > 0, 'tiene que actualizar el cliente');

  updates.forEach((sql) => {
    /*
      El corazón del arreglo. Si esto vuelve a escribir `puntos` o `nivel`, el
      saldo del libro de puntos se pierde en cada cambio de estado de un pedido
      y el nivel deja de salir de la tabla configurable.
    */
    assert.ok(
      !/\bpuntos\s*=/i.test(sql),
      'utils/loyalty no puede escribir clientes.puntos: eso lo maneja fidelizacionService.'
    );
    assert.ok(
      !/\bnivel\s*=/i.test(sql),
      'utils/loyalty no puede escribir clientes.nivel: eso sale de la tabla fidelizacion_niveles.'
    );
  });

  // Y sí tiene que seguir escribiendo lo suyo, que no calcula nadie más.
  const todo = updates.join(' ');
  ['total_pedidos', 'total_gastado', 'frecuencia_dias'].forEach((columna) => {
    assert.ok(new RegExp(`${columna}\\s*=`).test(todo), `debería seguir calculando ${columna}`);
  });

  console.log('  OK utils/loyalty ya no pisa los puntos ni el nivel');
}

function testNoQuedaCalculoDePuntosAMano() {
  const fuente = fs.readFileSync(path.resolve(__dirname, '../../utils/loyalty.js'), 'utf8');

  /*
    El cálculo viejo era `totalGastado / 100`, con el 100 escrito en el código.
    Coincidía con el sistema nuevo sólo porque `pesos_por_punto` vale 100 por
    defecto; al cambiarlo en Configuración, los dos daban distinto.
  */
  assert.ok(
    !/puntos\s*=\s*Math\.floor\(\s*totalGastado/.test(fuente),
    'volvió el cálculo de puntos a mano en utils/loyalty.js'
  );
  assert.ok(
    !/levelFromPoints/.test(fuente),
    'volvieron los umbrales de nivel escritos a mano en utils/loyalty.js'
  );

  console.log('  OK no quedaron cuentas de fidelidad escritas a mano');
}

function testUmbralesEnCentavos() {
  const seed = fs.readFileSync(path.resolve(__dirname, '../../db/seed.js'), 'utf8');

  /*
    `recalcularNivelCliente` compara `gasto_minimo_anual` contra la suma de
    `pedidos.total`, que está en centavos. Con los valores viejos —50000,
    150000, 300000— alcanzaba Platino quien gastara $3.000 en el año, y se
    llevaba el multiplicador x3 de puntos y el envío gratis.
  */
  /*
    El patrón lleva una coma al final a propósito. Sin ella, "50000" también
    coincidiría dentro de "5000000", que es justamente el valor corregido, y el
    test fallaría siempre.
  */
  const viejos = [
    [/'Plata',\s*2,\s*50000,/, 'Plata'],
    [/'Oro',\s*3,\s*150000,/, 'Oro'],
    [/'Platino',\s*4,\s*300000,/, 'Platino'],
  ];
  viejos.forEach(([patron, nombre]) => {
    assert.ok(
      !patron.test(seed),
      `El umbral de ${nombre} volvió a estar en pesos. Va en centavos, como el resto de la plata.`
    );
  });

  ["'Plata', 2, 5000000", "'Oro', 3, 15000000", "'Platino', 4, 30000000"].forEach((esperado) => {
    assert.ok(seed.includes(esperado), `Falta el umbral corregido: ${esperado}`);
  });

  console.log('  OK los umbrales de nivel están en centavos');
}

function testElNivelSeRecalculaAlEntregar() {
  const fuente = fs.readFileSync(
    path.resolve(__dirname, '../../services/fidelizacionService.js'),
    'utf8'
  );

  const cuerpo = fuente.slice(
    fuente.indexOf('function procesarFidelidadPedido'),
    fuente.indexOf('function acumularSellos')
  );

  /*
    Antes el nivel sólo se recalculaba apretando un botón en el panel, así que
    en la práctica nadie subía nunca de categoría.
  */
  assert.ok(
    cuerpo.includes('recalcularNivelCliente'),
    'procesarFidelidadPedido tiene que recalcular el nivel: si no, sólo cambia apretando un botón.'
  );

  // El multiplicador que se aplica es el del nivel que el cliente ya tenía, no
  // el que gana con esta misma compra.
  assert.ok(
    cuerpo.indexOf('acumularPuntos') < cuerpo.indexOf('recalcularNivelCliente'),
    'los puntos se acumulan antes de recalcular el nivel, para no aplicar el multiplicador nuevo a la compra que lo generó.'
  );

  console.log('  OK el nivel se recalcula al entregar un pedido');
}

function testLaUnidadDeLosPuntos() {
  const fuente = fs.readFileSync(
    path.resolve(__dirname, '../../services/fidelizacionService.js'),
    'utf8'
  );
  const cuerpo = fuente.slice(
    fuente.indexOf('function calcularPuntos'),
    fuente.indexOf('function calcularValorPuntos')
  );

  /*
    El total del pedido viene en centavos y `pesos_por_punto` se configura en
    pesos. Sin convertir, `total / pesos_por_punto` daba cien veces más puntos
    de los que corresponde: una compra de $10.000 generaba 10.000 puntos, que
    al canjearse valían $100.000.

    Nadie lo notó porque los puntos sólo se canjeaban a mano.
  */
  assert.ok(
    !/Math\.floor\(\s*total\s*\/\s*config\.pesos_por_punto\s*\)/.test(cuerpo),
    'volvió la división de centavos por pesos: los puntos quedan 100 veces inflados.'
  );
  assert.ok(
    /CENTAVOS_POR_PESO/.test(cuerpo),
    'calcularPuntos tiene que convertir pesos_por_punto a centavos antes de dividir.'
  );

  console.log('  OK los puntos se calculan con la unidad correcta');
}

function testLaMigracionConservaYReconciliaElLibro() {
  const fuente = fs.readFileSync(path.resolve(__dirname, '../../db/migrations.js'), 'utf8');

  assert.match(
    fuente,
    /migracion_libro_puntos_historico_v1/,
    'la reconciliación histórica necesita una marca idempotente'
  );
  assert.match(
    fuente,
    /UPDATE puntos_transacciones SET puntos_disponibles = puntos/,
    'la migración debe corregir los disponibles inflados'
  );
  assert.match(
    fuente,
    /Saldo histórico preservado durante la reconciliación del Club/,
    'la diferencia histórica debe quedar auditada como bonus'
  );
  assert.match(
    fuente,
    /migracion_libro_puntos_historico_v2/,
    'la corrección de la primera reconciliación debe ser idempotente'
  );
  assert.match(
    fuente,
    /Corrección de doble descuento de la reconciliación histórica del Club/,
    'la corrección debe quedar registrada como movimiento compensatorio'
  );

  console.log('  OK la migración de puntos conserva y reconcilia saldos históricos');
}

function testElCanjeLoDecideElServidor() {
  const fuente = fs.readFileSync(
    path.resolve(__dirname, '../../services/pedidoService.js'),
    'utf8'
  );

  /*
    Misma regla que con los precios de los productos: el navegador dice cuántos
    puntos usar, el servidor calcula cuánta plata son. Si el importe viniera del
    navegador, alcanzaría con editarlo en las herramientas del desarrollador
    para llevarse el pedido gratis.
  */
  assert.ok(
    /function validarCanjeDePuntos/.test(fuente),
    'el servidor tiene que validar y calcular el canje de puntos.'
  );
  assert.ok(
    !/body\.descuento_puntos|body\.valor_puntos/.test(fuente),
    'el importe del canje no puede venir del navegador: lo calcula el servidor.'
  );

  /*
    El canje va dentro de la transacción que crea el pedido. Si se hiciera
    antes y el pedido fallara, el cliente perdería los puntos sin recibir nada;
    si se hiciera después de confirmar, un error dejaría el descuento aplicado
    con los puntos intactos.
  */
  const creacion = fuente.slice(
    fuente.indexOf('function createPedidoWithInventory'),
    fuente.indexOf('function getActiveCaja')
  );
  assert.ok(
    creacion.includes('canjearPuntos'),
    'el canje tiene que ejecutarse dentro de createPedidoWithInventory, en la misma transacción que el pedido.'
  );

  console.log('  OK el canje de puntos lo calcula y aplica el servidor');
}

function run() {
  console.log('\nTests de fidelidad');
  testNoTocaPuntosNiNivel();
  testNoQuedaCalculoDePuntosAMano();
  testUmbralesEnCentavos();
  testElNivelSeRecalculaAlEntregar();
  testLaUnidadDeLosPuntos();
  testLaMigracionConservaYReconciliaElLibro();
  testElCanjeLoDecideElServidor();
  console.log('Todos los tests de fidelidad pasaron\n');
}

run();
