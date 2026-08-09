/**
 * Pasa a centavos la plata que el módulo de Personal guardó en pesos.
 *
 * ── Qué pasó ───────────────────────────────────────────────────────────────
 *
 * Todo el sistema guarda la plata en centavos. Personal no: sus formularios
 * mandan texto ("150.000") y el conversor de la API sólo convierte números, así
 * que el texto pasaba de largo y se guardaba en pesos, en columnas que el resto
 * del sistema lee como centavos.
 *
 * La ficha mostraba "$100" donde se habían cargado $10.000. Y al liquidar, ese
 * número se insertaba en `caja_movimientos.monto`, que sí está en centavos: la
 * caja registraba los pagos al personal cien veces más chicos.
 *
 * El código ya está arreglado. Este script corrige lo que quedó escrito antes.
 *
 * ── Por qué obliga a simular primero ───────────────────────────────────────
 *
 * Porque multiplicar plata por cien sin mirar es la peor forma de romper algo.
 * Este mes ya pasó una vez: se escribió una migración para pasar los `extras` a
 * centavos razonando desde el código, y los datos decían que ya estaban en
 * centavos. Se habría multiplicado por cien plata que estaba bien.
 *
 * Así que primero se mira, y recién después se escribe.
 *
 * ── Cómo se usa ────────────────────────────────────────────────────────────
 *
 *   node server/scripts/migrarPlataPersonalACentavos.js              (simula)
 *   node server/scripts/migrarPlataPersonalACentavos.js --aplicar    (escribe)
 *
 * Sin `--aplicar` no toca una sola fila: imprime qué haría y sale.
 */

const db = require('../db');

const APLICAR = process.argv.includes('--aplicar');

/**
 * Las columnas que quedaron en pesos.
 *
 * Salen de recorrer las cinco entradas de plata del módulo: el sueldo, los
 * movimientos, las liquidaciones con su desglose, y el premio de un objetivo.
 *
 * `personal_categorias.sueldo_base_minimo` NO está: el conversor tampoco lo
 * reconoce como plata al leerlo, así que entra y sale en pesos y es coherente
 * consigo mismo. Tocarlo sin tocar también el conversor lo rompería.
 */
const COLUMNAS = [
  ['personal', ['monto_base']],
  ['personal_movimientos', ['monto', 'saldo_pendiente']],
  [
    'personal_liquidaciones',
    [
      'monto_base',
      'monto_bruto',
      'total_adelantos',
      'total_descuentos',
      'total_consumos',
      'monto_neto',
    ],
  ],
  ['personal_liquidacion_items', ['monto_original', 'monto_aplicado', 'saldo_restante']],
  ['personal_objetivos', ['premio_monto']],
];

const pesos = (centavos) => `$${(Number(centavos || 0) / 100).toLocaleString('es-AR')}`;

function existeTabla(tabla) {
  return Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tabla)
  );
}

/**
 * Comprobación de que estamos en la base del negocio y no en una vacía.
 *
 * `railway run` corre en la máquina de uno, no en el servidor, y abre una base
 * nueva. Ya engañó a un diagnóstico: informó ceros con total tranquilidad
 * mientras la pantalla mostraba una empleada con sueldo cargado.
 */
function esLaBaseReal() {
  let pedidos = 0;
  try {
    pedidos = db.prepare('SELECT COUNT(*) AS n FROM pedidos').get().n;
  } catch {
    pedidos = 0;
  }
  if (pedidos > 0) return true;

  const { dbFile } = require('../utils/storagePaths');
  console.log('\n⛔  ESTA NO ES LA BASE DEL NEGOCIO\n');
  console.log(`   Archivo abierto: ${dbFile}`);
  console.log('   Pedidos que tiene: 0\n');
  console.log('   Un local en marcha tiene pedidos. Cero significa que se abrió una base');
  console.log('   vacía, probablemente creada por este mismo comando.\n');
  console.log('   Pasa con `railway run`: corre en tu máquina, no en el servidor. Hay que');
  console.log('   entrar al contenedor (`railway ssh`) o usar la terminal de railway.app.\n');
  return false;
}

function main() {
  console.log('');
  console.log('═'.repeat(72));
  console.log(`  Plata de Personal → centavos     ${APLICAR ? '[APLICANDO]' : '[SIMULACIÓN]'}`);
  console.log('═'.repeat(72));

  if (!esLaBaseReal()) {
    process.exitCode = 1;
    return;
  }

  let filasTotales = 0;
  const plan = [];

  for (const [tabla, columnas] of COLUMNAS) {
    if (!existeTabla(tabla)) {
      console.log(`\n${tabla}: la tabla no existe, se saltea`);
      continue;
    }

    const condicion = columnas.map((c) => `COALESCE(${c},0) <> 0`).join(' OR ');
    const filas = db.prepare(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ${condicion}`).get().n;

    console.log(`\n${tabla}  (${filas} ${filas === 1 ? 'fila' : 'filas'} con plata cargada)`);

    if (filas === 0) {
      console.log('   nada que convertir');
      continue;
    }

    // Se muestran ejemplos reales para que la decisión no sea a ciegas: si el
    // "antes" ya parece un importe de verdad, es que estaban en centavos y esta
    // migración no va.
    const muestra = db
      .prepare(`SELECT ${columnas.join(', ')} FROM ${tabla} WHERE ${condicion} LIMIT 3`)
      .all();
    for (const fila of muestra) {
      for (const c of columnas) {
        const v = Number(fila[c] || 0);
        if (!v) continue;
        console.log(
          `   ${c.padEnd(18)} ${String(v).padStart(12)}` +
            `   hoy se ve ${pesos(v).padEnd(14)}` +
            `   va a verse ${pesos(v * 100)}`
        );
      }
    }

    filasTotales += filas;
    plan.push([tabla, columnas, condicion, filas]);
  }

  console.log('');
  console.log('─'.repeat(72));

  if (filasTotales === 0) {
    console.log('  No hay nada que convertir. El módulo está vacío de plata.');
    console.log('─'.repeat(72));
    console.log('');
    return;
  }

  if (!APLICAR) {
    console.log(`  ${filasTotales} filas se multiplicarían por 100.`);
    console.log('');
    console.log('  MIRÁ LA COLUMNA "va a verse". Si esos importes son los sueldos y');
    console.log('  adelantos de verdad, la migración es correcta.');
    console.log('  Si los de "hoy se ve" ya eran los correctos, NO la corras: los datos');
    console.log('  estaban bien y esto los rompería.');
    console.log('');
    console.log('  Para aplicar:');
    console.log('      node server/scripts/migrarPlataPersonalACentavos.js --aplicar');
    console.log('─'.repeat(72));
    console.log('');
    return;
  }

  /*
    Respaldo antes de tocar plata. Si algo sale mal, hay de dónde volver — y no
    depende de acordarse de hacerlo a mano en el momento equivocado.
  */
  try {
    const { createDatabaseBackup } = require('../utils/backupManager');
    const respaldo = createDatabaseBackup(db, { reason: 'pre-personal-centavos', maxFiles: 10 });
    console.log(`  Respaldo hecho: ${respaldo?.file || respaldo || 'ok'}`);
  } catch (error) {
    console.log(`  ⚠ No se pudo respaldar (${error.message}). Se aborta por las dudas.`);
    process.exitCode = 1;
    return;
  }

  db.exec('BEGIN');
  try {
    for (const [tabla, columnas, condicion] of plan) {
      const sets = columnas.map((c) => `${c} = ROUND(COALESCE(${c},0) * 100)`).join(', ');
      const r = db.prepare(`UPDATE ${tabla} SET ${sets} WHERE ${condicion}`).run();
      console.log(`  ${tabla}: ${r.changes} filas convertidas`);
    }
    db.exec('COMMIT');
    console.log('');
    console.log('  Listo. Revisá una ficha en el panel: el sueldo tiene que verse como');
    console.log('  lo cargaste, no cien veces más chico.');
  } catch (error) {
    db.exec('ROLLBACK');
    console.log(`  ⛔ Falló: ${error.message}. No se cambió nada.`);
    process.exitCode = 1;
  }

  console.log('─'.repeat(72));
  console.log('');
}

main();
