const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { isMoneyKey } = require('../../utils/moneyConversion');

/**
 * Tests de las estadísticas del rider.
 *
 * ── Qué se rompió ──────────────────────────────────────────────────────────
 *
 * La pantalla del rider mostraba "Cobrado hoy $1.900.000 · 3 entregas" cuando
 * en realidad eran $19.000, y la tira de la semana marcaba viernes un jueves a
 * las 22:41.
 *
 * Dos causas, las dos de la misma familia que ya habíamos corregido en otros
 * módulos:
 *
 *   1. El servidor corre en UTC. Después de las 21:00 hora argentina ya está
 *      en el día siguiente, así que "hoy" y el agrupado por fecha se corrían
 *      un día. Al rider le contaban sus entregas de la noche en el día
 *      equivocado, rompiéndole la racha y la meta diaria.
 *
 *   2. `facturado` no lo reconocía el conversor de plata, así que viajaba en
 *      centavos y la app lo mostraba tal cual: cien veces más.
 *
 * Estos tests son lo que hace que no vuelva a pasar sin que nadie se entere.
 */

function testFacturadoEsPlata() {
  /*
    `facturado` es la suma de `pedidos.total`: centavos. Si deja de estar
    reconocido, la app del rider vuelve a mostrar cifras cien veces mayores.

    Lo devuelven dos endpoints —estadísticas del rider y reportes de delivery—
    y en ninguno el cliente lo divide a mano.
  */
  assert.ok(
    isMoneyKey('facturado'),
    '"facturado" tiene que estar reconocido como plata: si no, viaja en centavos y se muestra 100 veces más grande.'
  );

  // Los contadores no son plata: si se convirtieran, 4 entregas serían 0,04.
  ['entregas', 'racha', 'variacionFacturado'].forEach((clave) => {
    assert.ok(!isMoneyKey(clave), `"${clave}" es un contador, no puede convertirse como plata.`);
  });

  console.log('  OK facturado se convierte a pesos y los contadores no');
}

function testSinFechasCrudas() {
  const fuente = fs.readFileSync(path.resolve(__dirname, '../../routes/repartidores.js'), 'utf8');

  /*
    SQLite guarda en UTC. Agrupar con `DATE(columna)` a secas mete las entregas
    de después de las 21:00 en el día siguiente.

    `fechaLocal()` aplica el desfase argentino dentro de la consulta, y es lo
    que usa el resto del sistema desde que se corrigieron los reportes.
  */
  assert.ok(
    !/DATE\(actualizado_en\)/.test(fuente),
    'volvió un DATE(actualizado_en) sin corregir la zona horaria: usá fechaLocal().'
  );

  /*
    `'localtime'` tampoco sirve: depende de la zona del proceso, y en Railway
    el servidor corre en UTC. Funcionaría en la máquina de desarrollo y fallaría
    en producción, que es la peor combinación posible.
  */
  assert.ok(
    !/'localtime'/.test(fuente),
    "volvió un 'localtime': depende de la zona del servidor, que en Railway es UTC."
  );

  console.log('  OK ninguna consulta agrupa por fecha sin corregir la zona');
}

function testElHoyDelServidorEsElDelLocal() {
  const fuente = fs.readFileSync(path.resolve(__dirname, '../../routes/repartidores.js'), 'utf8');

  /*
    `new Date()` en Railway devuelve UTC. A las 22:41 de Argentina eso ya es el
    día siguiente, y el gráfico de la semana marcaba el día equivocado.
  */
  assert.ok(
    /OFFSET_ARGENTINA_MS/.test(fuente),
    'el cálculo de "hoy" tiene que restar el desfase argentino, no usar la hora del servidor.'
  );
  assert.ok(
    !/const hoy = new Date\(\);/.test(fuente),
    'volvió `new Date()` sin desfase: en el servidor eso es UTC, no la hora del local.'
  );

  console.log('  OK "hoy" es el mismo día que ve el rider en su celular');
}

function run() {
  console.log('\nTests de las estadísticas del rider');
  testFacturadoEsPlata();
  testSinFechasCrudas();
  testElHoyDelServidorEsElDelLocal();
  console.log('Todos los tests de las estadísticas del rider pasaron\n');
}

run();
