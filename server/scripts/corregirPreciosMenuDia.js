/**
 * Corrige los platos del menú del día guardados en pesos.
 *
 * ── Qué pasó ───────────────────────────────────────────────────────────────
 *
 * Toda la plata del sistema se guarda en centavos. Siete platos del menú del
 * día quedaron con el número en pesos adentro de esa columna:
 *
 *     1/4 de pollo al horno    7000  →  se lee $70      (debería ser $7.000)
 *     Canelones                5000  →  se lee $50      (debería ser $5.000)
 *
 * Vienen de cuando el seed sembraba `menu_dia_precio_economico = '5000'`
 * creyendo que eran pesos. Eso ya se corrigió, pero los platos creados con
 * aquel valor quedaron mal.
 *
 * Hoy están todos en `disponible = 0`, así que no se venden. **El día que se
 * habilite uno, se vende a cincuenta pesos.**
 *
 * ── Cómo se corre ──────────────────────────────────────────────────────────
 *
 *     node server/scripts/corregirPreciosMenuDia.js           ← sólo muestra
 *     node server/scripts/corregirPreciosMenuDia.js --aplicar ← corrige
 *
 * Sin `--aplicar` no toca nada: lista lo que encontró y termina. Es a
 * propósito. Una corrección de plata que se ejecuta sola por haber tipeado mal
 * el nombre del script es peor que el problema.
 *
 * ── Qué considera "mal" ────────────────────────────────────────────────────
 *
 * Sólo los platos de la categoría del menú del día cuyo precio es menor a
 * $1.000 —o sea, menos de 100000 en centavos—. Ningún plato del menú del día
 * vale eso. Un umbral así de bajo evita tocar algo que esté bien: multiplicar
 * por cien un precio correcto es el mismo error al revés, y nadie avisa.
 */

const path = require('path');
const db = require(path.join(__dirname, '..', 'db'));
const { createDatabaseBackup } = require(path.join(__dirname, '..', 'utils', 'backupManager'));

const APLICAR = process.argv.includes('--aplicar');

// Menos de $1.000 en un plato del menú del día no existe. El económico vale
// $5.000 y el ejecutivo $7.000.
const PISO_RAZONABLE = 100000;

function plataLegible(centavos) {
  return `$${(Number(centavos || 0) / 100).toLocaleString('es-AR')}`;
}

function main() {
  const categoria = db
    .prepare("SELECT id, nombre FROM categorias WHERE lower(nombre) LIKE '%menu%dia%' LIMIT 1")
    .get();

  if (!categoria) {
    console.log('\nNo existe la categoría del menú del día. No hay nada que corregir.\n');
    return;
  }

  const sospechosos = db
    .prepare(
      `SELECT id, nombre, precio, activo, menu_dia_tipo
         FROM productos
        WHERE categoria_id = ?
          AND precio > 0
          AND precio < ?
        ORDER BY nombre`
    )
    .all(categoria.id, PISO_RAZONABLE);

  console.log('\n🍽️  Precios del menú del día guardados en pesos\n');

  if (sospechosos.length === 0) {
    console.log('  No hay ninguno. Todo en centavos, como corresponde.\n');
    return;
  }

  console.log(`  ${sospechosos.length} platos con el precio cien veces abajo:\n`);
  for (const plato of sospechosos) {
    const corregido = plato.precio * 100;
    console.log(
      `   ${plato.nombre.padEnd(34)} ${plataLegible(plato.precio).padStart(9)}  →  ${plataLegible(corregido)}`
    );
  }

  // Y el historial del menú del día guarda su propia copia del precio por
  // fecha. Si sólo se corrigiera el producto, al reponer un día viejo volvería
  // a entrar el precio malo.
  const enHistorial = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM menu_dia_historial h
         JOIN productos p ON p.id = h.producto_id
        WHERE p.categoria_id = ? AND h.precio > 0 AND h.precio < ?`
    )
    .get(categoria.id, PISO_RAZONABLE).n;

  console.log(`\n  Y ${enHistorial} renglones del historial por fecha con el mismo problema.`);

  if (!APLICAR) {
    console.log('\n  Esto fue sólo una mirada: no se cambió nada.');
    console.log('  Para corregirlo de verdad:\n');
    console.log('      node server/scripts/corregirPreciosMenuDia.js --aplicar\n');
    return;
  }

  /*
    Backup antes de tocar nada, sin preguntar.

    Es plata en la base de un local que está vendiendo. Depender de que quien
    corre el script se acuerde de hacerlo es depender de la memoria de alguien
    apurado. Si el backup falla, no se corrige: mejor quedarse con el problema
    conocido que crear uno nuevo sin red.
  */
  try {
    const backup = createDatabaseBackup(db, { reason: 'antes-de-corregir-precios' });
    console.log(`\n  📦 Backup hecho: ${backup.file}`);
  } catch (error) {
    console.error(`\n  ❌ No se pudo hacer el backup: ${error.message}`);
    console.error('  No se corrigió nada. Sin backup no se toca la plata.\n');
    process.exitCode = 1;
    return;
  }

  const corregir = db.transaction(() => {
    const platos = db
      .prepare(
        `UPDATE productos SET precio = precio * 100
          WHERE categoria_id = ? AND precio > 0 AND precio < ?`
      )
      .run(categoria.id, PISO_RAZONABLE).changes;

    const historial = db
      .prepare(
        `UPDATE menu_dia_historial
            SET precio = precio * 100
          WHERE precio > 0 AND precio < ?
            AND producto_id IN (SELECT id FROM productos WHERE categoria_id = ?)`
      )
      .run(PISO_RAZONABLE, categoria.id).changes;

    return { platos, historial };
  });

  const { platos, historial } = corregir();
  console.log(`\n  ✅ Corregidos ${platos} platos y ${historial} renglones del historial.\n`);
}

main();
