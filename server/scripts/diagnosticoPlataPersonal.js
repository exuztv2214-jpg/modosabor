/**
 * ¿En qué unidad guarda la plata el módulo de Personal?
 *
 * SÓLO LEE. No escribe una sola fila. Se puede correr en producción en
 * cualquier momento, incluso en pleno servicio.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * Todo el sistema guarda la plata en centavos. Personal parece no hacerlo: el
 * formulario manda el sueldo como texto ("150.000") y la ruta lo interpreta
 * con `roundLocalizedNumber`, que devuelve 150000 —pesos— y lo guarda tal cual
 * en una columna que el resto del sistema lee como centavos.
 *
 * Si es así, pasan dos cosas. La pantalla muestra $1.500 donde cargaste
 * $150.000, que es molesto pero inofensivo. Y la liquidación inserta ese
 * número en `caja_movimientos.monto`, que sí está en centavos: la caja
 * registra la salida cien veces más chica de lo que pagaste.
 *
 * ── Por qué un script y no una migración ───────────────────────────────────
 *
 * Porque este mes ya me equivoqué una vez razonando desde el código en vez de
 * mirar los datos: escribí una migración para pasar los `extras` a centavos y
 * los datos reales decían que ya estaban en centavos. Habría multiplicado por
 * cien plata que estaba bien.
 *
 * Así que primero se mira. Esto imprime lo que hay y saca una conclusión, pero
 * la conclusión es una lectura, no una orden: si algo no cierra, se decide a
 * mano.
 *
 * ── Uso ────────────────────────────────────────────────────────────────────
 *
 *   railway run node server/scripts/diagnosticoPlataPersonal.js
 */

const db = require('../db');

const pesos = (centavos) =>
  `$${Number(centavos || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`;

function contar(tabla) {
  try {
    return db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get().n;
  } catch {
    return null;
  }
}

function linea(char = '─') {
  console.log(char.repeat(72));
}

/**
 * ¿Estoy mirando la base de verdad?
 *
 * `railway run` no corre el comando en el servidor: lo corre en la máquina de
 * uno, prestándole nada más las variables de entorno. Como la carpeta de datos
 * del servidor no existe en Windows, better-sqlite3 hace lo peor que puede
 * hacer —crear una base nueva y vacía, aplicarle el esquema— y el diagnóstico
 * informa ceros con total tranquilidad.
 *
 * Pasó. El script dijo "no hay personal cargado" mientras la pantalla mostraba
 * a una empleada con sueldo. Sobre esa lectura se estuvo a punto de decidir una
 * migración de los sueldos.
 *
 * Un local en marcha tiene pedidos. Si no hay ni uno, esta no es la base del
 * negocio y no hay conclusión que sacar.
 */
function verificarQueEsLaBaseReal() {
  let pedidos = 0;
  try {
    pedidos = db.prepare('SELECT COUNT(*) AS n FROM pedidos').get().n;
  } catch {
    pedidos = 0;
  }

  if (pedidos > 0) return true;

  const { dbFile } = require('../utils/storagePaths');
  console.log('');
  linea('═');
  console.log('  ⛔  ESTA NO ES LA BASE DEL NEGOCIO');
  linea('═');
  console.log('');
  console.log(`  Archivo abierto:  ${dbFile}`);
  console.log('  Pedidos que tiene: 0');
  console.log('');
  console.log('  Un local en marcha tiene pedidos. Cero significa que se abrió una');
  console.log('  base vacía —probablemente recién creada por este mismo comando—.');
  console.log('');
  console.log('  Pasa con `railway run`: ese comando NO corre en el servidor, corre');
  console.log('  en tu máquina con las variables del servidor. La carpeta de datos');
  console.log('  del contenedor no existe acá, así que se crea una base nueva.');
  console.log('');
  console.log('  Para mirar la base de verdad hay que entrar al contenedor:');
  console.log('');
  console.log('      railway ssh');
  console.log('      node server/scripts/diagnosticoPlataPersonal.js');
  console.log('');
  console.log('  No se saca ninguna conclusión de esta corrida.');
  linea('═');
  console.log('');
  return false;
}

function main() {
  console.log('');
  linea('═');
  console.log('  ¿En qué unidad guarda la plata el módulo de Personal?');
  linea('═');

  if (!verificarQueEsLaBaseReal()) {
    process.exitCode = 1;
    return;
  }

  // ── 1. Los sueldos cargados ───────────────────────────────────────────────
  //
  // Es la señal más clara. Un sueldo de restaurante en Argentina hoy está
  // arriba de los cien mil pesos. Si el número crudo tiene 5 o 6 dígitos, son
  // pesos. Si tiene 7 u 8, son centavos.
  console.log('\n1. SUELDOS CARGADOS (valor crudo en la base)\n');
  const gente = db
    .prepare(
      `SELECT id, nombre, monto_base, frecuencia_pago
       FROM personal WHERE activo = 1 ORDER BY monto_base DESC LIMIT 8`
    )
    .all();

  if (gente.length === 0) {
    console.log('   (no hay nadie activo cargado)');
  } else {
    for (const p of gente) {
      const crudo = Number(p.monto_base || 0);
      console.log(
        `   ${String(p.nombre).padEnd(26)} ${String(crudo).padStart(10)}` +
          `   si son centavos: ${pesos(crudo / 100).padEnd(12)}` +
          `   si son pesos: ${pesos(crudo)}`
      );
    }
  }

  // ── 2. Comparación contra algo que sabemos que está en centavos ───────────
  //
  // `caja_movimientos.monto` sí está en centavos: lo escribe el TPV con cada
  // venta. Comparar los dos órdenes de magnitud desempata sin depender de lo
  // que uno crea que "debería" valer un sueldo.
  console.log('\n2. COMPARACIÓN CON LA CAJA (que sí está en centavos)\n');
  const venta = db
    .prepare(`SELECT AVG(total) AS prom FROM pedidos WHERE total > 0 AND estado = 'entregado'`)
    .get();
  const promedioPedido = Number(venta?.prom || 0);
  console.log(
    `   Ticket promedio (centavos):  ${Math.round(promedioPedido)}  =  ${pesos(promedioPedido / 100)}`
  );

  const sueldoMax = Math.max(0, ...gente.map((p) => Number(p.monto_base || 0)));
  if (sueldoMax > 0 && promedioPedido > 0) {
    const veces = sueldoMax / promedioPedido;
    console.log(`   Sueldo más alto (crudo):     ${sueldoMax}`);
    console.log(`   El sueldo es ${veces.toFixed(1)} veces el ticket promedio.`);
    console.log(
      veces < 5
        ? '   → Un sueldo mensual no puede valer menos que cinco pedidos: son PESOS.'
        : '   → El orden de magnitud es el correcto: parecen CENTAVOS.'
    );
  }

  // ── 3. Lo que ya se pagó por caja ─────────────────────────────────────────
  //
  // Si hay liquidaciones que impactaron caja, se puede comparar el neto de la
  // liquidación contra el movimiento de caja que generó. Tienen que ser el
  // mismo número; si lo son y las unidades no coinciden, el error ya se
  // materializó en el arqueo.
  console.log('\n3. LIQUIDACIONES QUE TOCARON LA CAJA\n');
  let cruces = [];
  try {
    cruces = db
      .prepare(
        `SELECT l.id, l.monto_neto, c.monto AS monto_caja, p.nombre
         FROM personal_liquidaciones l
         JOIN caja_movimientos c ON c.id = l.caja_movimiento_id
         JOIN personal p ON p.id = l.personal_id
         ORDER BY l.id DESC LIMIT 5`
      )
      .all();
  } catch (e) {
    console.log('   (no se pudo cruzar:', e.message, ')');
  }

  if (cruces.length === 0) {
    console.log('   Ninguna liquidación impactó la caja todavía.');
    console.log('   → El error todavía NO llegó al arqueo. Se está a tiempo.');
  } else {
    for (const c of cruces) {
      console.log(
        `   Liquidación #${c.id} de ${c.nombre}: neto ${c.monto_neto}, en caja ${c.monto_caja}`
      );
    }
    console.log('   → Si esos números son iguales y son pesos, la caja los leyó como');
    console.log('     centavos y registró la salida cien veces más chica.');
  }

  // ── 4. Cuánto habría que migrar ───────────────────────────────────────────
  //
  // El tamaño del problema decide el cómo. Con pocas filas se puede corregir a
  // mano desde el panel; con muchas hace falta una migración.
  console.log('\n4. TAMAÑO DEL PROBLEMA (filas a corregir si son pesos)\n');
  const tablas = [
    ['personal', 'monto_base'],
    ['personal_movimientos', 'monto y saldo_pendiente'],
    ['personal_liquidaciones', 'monto_base, bruto, neto y totales'],
    ['personal_liquidacion_items', 'monto_original, aplicado y saldo'],
    ['personal_objetivos', 'premio_monto'],
    ['personal_carrera_historial', 'sueldo_anterior y sueldo_nuevo'],
    ['personal_categorias', 'sueldo_base_minimo'],
  ];
  for (const [tabla, campos] of tablas) {
    const n = contar(tabla);
    console.log(
      `   ${tabla.padEnd(30)} ${n === null ? 'no existe' : String(n).padStart(5)}   (${campos})`
    );
  }

  // ── 5. Lo que bloquea la otra tanda ───────────────────────────────────────
  //
  // La tanda de la auditoría de Empleados agrega `sueldo_nuevo` y
  // `sueldo_anterior` a los campos de plata. Si el historial de carrera está
  // vacío, ese cambio no tiene ningún riesgo y puede salir ya.
  console.log('\n5. ¿SE PUEDE DEPLOYAR LA TANDA DE EMPLEADOS?\n');
  const carrera = contar('personal_carrera_historial');
  if (carrera === 0 || carrera === null) {
    console.log('   El historial de carrera está vacío.');
    console.log('   → Sí. Marcar sueldo_nuevo/sueldo_anterior como plata no puede');
    console.log('     romper nada, porque no hay filas que reinterpretar.');
  } else {
    console.log(`   Hay ${carrera} ascensos registrados.`);
    console.log('   → Ojo: al pasar a ser campos de plata se van a mostrar divididos');
    console.log('     por 100. Hay que migrarlos junto con el resto o dejarlos afuera.');
  }

  console.log('');
  linea('═');
  console.log('  Nada de esto se modificó. El script sólo leyó.');
  linea('═');
  console.log('');
}

main();
