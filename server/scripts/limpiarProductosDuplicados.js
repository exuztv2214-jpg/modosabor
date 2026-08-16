/**
 * Saca de la carta lo que está de más.
 *
 * Son dos cosas distintas y se tratan distinto.
 *
 * ── 1. Los productos de prueba ─────────────────────────────────────────────
 *
 * Quedaron cuatro, de una prueba del asistente:
 *
 *     ASISTENTE_TEST_1786513424524_DIRECTO   $1.000   activo, a la venta, stock 8
 *     ASISTENTE_TEST_1786513424524_RECETA    $1.000   activo
 *     ASISTENTE_TEST_1786513432899_DIRECTO   $1.000   activo, a la venta, stock 8
 *     ASISTENTE_TEST_1786513432899_RECETA    $1.000   activo
 *
 * Están en Pizzas, activos y visibles: salen en la carta pública y la IA los
 * puede ofrecer y vender a $1.000. Nunca se vendieron, no tienen receta ni
 * listas ni historial de menú del día colgando.
 *
 * Estos se BORRAN. No son de nadie y no hay nada que preservar.
 *
 * ── 2. Los duplicados viejos ───────────────────────────────────────────────
 *
 *     id86  Wok de verduras con pollo   (contra id68 "Wok de verduras y pollo")
 *     id87  Canelones                   (contra id66 "Canelones")
 *     id88  Suprema napolitana          (contra id67 "Suprema a la napolitana")
 *
 * Son el mismo plato cargado dos veces con el nombre escrito distinto. Ya están
 * desactivados, así que no se venden: molestan en la lista de Productos y nada
 * más.
 *
 * Estos NO se borran, se ARCHIVAN: se les pone "(duplicado)" adelante para que
 * queden juntos al final de la lista y se vea de dónde salen. Borrarlos sería
 * perder el historial de pedidos que los tenga apuntados.
 *
 * ── Lo que NO toca, a propósito ────────────────────────────────────────────
 *
 * Hay pares de nombres iguales que NO son duplicados:
 *
 *     "Napolitana"  está en Pizzas ($5.000) y en Milanesas ($10.500)
 *     "4 Quesos"    idem            "Roquefort"  idem
 *     "Clásica"     está en Milanesas y en Hamburguesas
 *     "Pepsi 2 lt"  y  "Pepsi 3 lt"  son dos tamaños
 *
 * Son platos distintos que se llaman igual, que es lo normal en una carta.
 * Tocarlos sería romper la carta creyendo que se la limpia.
 *
 *     node server/scripts/limpiarProductosDuplicados.js            ← qué haría
 *     node server/scripts/limpiarProductosDuplicados.js --aplicar  ← lo hace
 */

const path = require('path');
const db = require(path.join(__dirname, '..', 'db'));
const { createDatabaseBackup } = require(path.join(__dirname, '..', 'utils', 'backupManager'));

const APLICAR = process.argv.includes('--aplicar');
const PREFIJO_PRUEBA = 'ASISTENTE_TEST';
const MARCA = '(duplicado) ';

// Se identifican por nombre y no por id: los ids de producción no son los
// mismos que los de la base local, y este script corre en las dos.
const DUPLICADOS = [
  { duplicado: 'Wok de verduras con pollo', bueno: 'Wok de verduras y pollo' },
  { duplicado: 'Suprema napolitana', bueno: 'Suprema a la napolitana' },
];

const pesos = (centavos) => `$${(centavos / 100).toLocaleString('es-AR')}`;

function main() {
  console.log('\n🧹 Limpieza de la carta\n');

  const pruebas = db
    .prepare('SELECT id, nombre, precio, activo FROM productos WHERE nombre LIKE ?')
    .all(`${PREFIJO_PRUEBA}%`);

  /*
    Antes de borrar nada se comprueba que no cuelgue de ellos ninguna venta.
    Un producto de prueba que igual se vendió alguna vez deja de ser
    descartable: borrarlo dejaría un pedido apuntando a la nada.
  */
  const conVentas = new Set(
    db
      .prepare(
        `SELECT DISTINCT producto_id FROM pedido_items
          WHERE producto_id IN (SELECT id FROM productos WHERE nombre LIKE ?)`
      )
      .all(`${PREFIJO_PRUEBA}%`)
      .map((fila) => fila.producto_id)
  );

  const borrables = pruebas.filter((p) => !conVentas.has(p.id));
  const intocables = pruebas.filter((p) => conVentas.has(p.id));

  console.log('  Productos de prueba:');
  if (pruebas.length === 0) {
    console.log('     ninguno ✓');
  } else {
    for (const p of borrables) {
      console.log(
        `     borrar   id${p.id}  ${p.nombre}  ${pesos(p.precio)}  ${
          Number(p.activo) === 1 ? '⚠ ACTIVO, hoy se puede vender' : 'inactivo'
        }`
      );
    }
    for (const p of intocables) {
      console.log(`     dejar    id${p.id}  ${p.nombre} — tiene ventas, no se borra`);
    }
  }

  console.log('\n  Duplicados viejos:');
  const aMarcar = [];
  for (const par of DUPLICADOS) {
    const fila = db
      .prepare('SELECT id, nombre, activo FROM productos WHERE nombre = ?')
      .get(par.duplicado);
    if (!fila) {
      console.log(`     "${par.duplicado}" no está — nada que hacer`);
      continue;
    }
    if (fila.nombre.startsWith(MARCA)) {
      console.log(`     "${fila.nombre}" ya está marcado`);
      continue;
    }
    if (Number(fila.activo) === 1) {
      console.log(
        `     ⚠ "${fila.nombre}" (id ${fila.id}) está ACTIVO — no lo toco.` +
          ` Si es el duplicado, desactivalo desde Productos y volvé a correr esto.`
      );
      continue;
    }
    aMarcar.push(fila);
    console.log(`     marcar   id${fila.id}  ${fila.nombre}  →  ${MARCA}${fila.nombre}`);
    console.log(`                se queda "${par.bueno}"`);
  }

  console.log(
    `\n  Sin tocar: "Napolitana", "4 Quesos", "Roquefort" y "Clásica" están en dos\n` +
      `  categorías distintas, y las bebidas de 2 y 3 litros son dos tamaños.\n` +
      `  No son duplicados.`
  );

  if (borrables.length === 0 && aMarcar.length === 0) {
    console.log('\n  No hay nada que cambiar.\n');
    return;
  }

  if (!APLICAR) {
    console.log('\n  Esto fue sólo una mirada: no se cambió nada.');
    console.log('  Para hacerlo de verdad:\n');
    console.log('      node server/scripts/limpiarProductosDuplicados.js --aplicar\n');
    return;
  }

  try {
    const backup = createDatabaseBackup(db, { reason: 'antes-de-limpiar-duplicados' });
    console.log(`\n  📦 Backup hecho: ${backup.file}`);
  } catch (error) {
    console.error(`\n  ❌ No se pudo hacer el backup: ${error.message}`);
    console.error('  No se cambió nada.\n');
    process.exitCode = 1;
    return;
  }

  const limpiar = db.transaction(() => {
    const borrar = db.prepare('DELETE FROM productos WHERE id = ?');
    const marcar = db.prepare('UPDATE productos SET nombre = ? WHERE id = ?');
    borrables.forEach((p) => borrar.run(p.id));
    aMarcar.forEach((p) => marcar.run(`${MARCA}${p.nombre}`, p.id));
  });
  limpiar();

  console.log(
    `\n  ✅ ${borrables.length} de prueba borrados · ${aMarcar.length} duplicados marcados.\n`
  );
}

main();
