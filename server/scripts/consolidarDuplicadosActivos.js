/**
 * Consolida cuatro duplicados comprobados en producción sin borrar historial.
 *
 * Los registros con ventas, recetas o la ficha más completa sobreviven. Los
 * duplicados se archivan: sus pedidos, movimientos y fotos siguen consultables.
 * En Pizza y Milanesa, la ficha histórica tenía la receta correcta pero sus
 * recargos estaban cien veces abajo; se copian las variantes sanas antes de
 * archivar la ficha nueva vacía.
 *
 *   node server/scripts/consolidarDuplicadosActivos.js
 *   node server/scripts/consolidarDuplicadosActivos.js --aplicar
 */

const path = require('path');
const db = require(path.join(__dirname, '..', 'db'));
const { createDatabaseBackup } = require(path.join(__dirname, '..', 'utils', 'backupManager'));

const APLICAR = process.argv.includes('--aplicar');
const MARCA = '(duplicado)';
const PLAN = [
  { nombre: 'Pizza Común', conservar: 29, archivar: 1, copiarVariantes: true },
  { nombre: 'Milanesa Clásica', conservar: 34, archivar: 18, copiarVariantes: true },
  { nombre: 'Arroz con Pollo', conservar: 104, archivar: 103, copiarDescripcion: true },
  { nombre: 'Tortilla de Papas', conservar: 105, archivar: 119 },
];

function fila(id) {
  return db
    .prepare(
      `SELECT p.id, p.nombre, p.activo, p.descripcion, p.variantes, p.categoria_id,
              c.nombre AS categoria
         FROM productos p
         JOIN categorias c ON c.id = p.categoria_id
        WHERE p.id = ?`
    )
    .get(id);
}

function dependencias(id) {
  const contar = (tabla) =>
    db.prepare(`SELECT COUNT(*) AS n FROM ${tabla} WHERE producto_id = ?`).get(id).n;
  return {
    ventas: contar('pedido_items'),
    recetas: contar('inventario_recetas'),
    historial: contar('menu_dia_historial'),
    movimientos: contar('inventario_movimientos'),
    listas: contar('producto_opcion_listas'),
  };
}

function main() {
  console.log('\n🧩 Consolidación de duplicados activos\n');
  const acciones = [];

  for (const item of PLAN) {
    const bueno = fila(item.conservar);
    const duplicado = fila(item.archivar);
    if (!bueno || !duplicado) {
      throw new Error(`${item.nombre}: faltan los IDs esperados; no se toca nada`);
    }
    if (bueno.categoria_id !== duplicado.categoria_id) {
      throw new Error(`${item.nombre}: los productos ya no pertenecen a la misma categoría`);
    }

    const yaArchivado =
      Number(duplicado.activo) === 0 && String(duplicado.nombre).startsWith(MARCA);
    console.log(`  ${item.nombre}`);
    console.log(
      `     conservar id${bueno.id} ${bueno.nombre} · ${JSON.stringify(dependencias(bueno.id))}`
    );
    console.log(
      `     ${yaArchivado ? 'archivado' : 'archivar '} id${duplicado.id} ${duplicado.nombre} · ${JSON.stringify(dependencias(duplicado.id))}`
    );
    if (!yaArchivado) acciones.push({ item, bueno, duplicado });
  }

  if (acciones.length === 0) {
    console.log('\n  No hay nada que cambiar.\n');
    return;
  }
  if (!APLICAR) {
    console.log('\n  Esto fue sólo una mirada: no se cambió nada.\n');
    return;
  }

  const backup = createDatabaseBackup(db, { reason: 'antes-de-consolidar-duplicados-activos' });
  console.log(`\n  📦 Backup hecho: ${backup.file}`);

  db.transaction(() => {
    for (const { item, bueno, duplicado } of acciones) {
      if (item.copiarVariantes) {
        db.prepare('UPDATE productos SET variantes = ? WHERE id = ?').run(
          duplicado.variantes,
          bueno.id
        );
      }
      if (item.copiarDescripcion && !String(bueno.descripcion || '').trim()) {
        db.prepare('UPDATE productos SET descripcion = ? WHERE id = ?').run(
          duplicado.descripcion,
          bueno.id
        );
      }
      db.prepare(
        `UPDATE productos
            SET nombre = ?, activo = 0, disponible_para_venta = 0,
                menu_dia_base = 0, menu_dia_disponible_hoy = 0
          WHERE id = ?`
      ).run(`${MARCA} ${duplicado.nombre} [id${duplicado.id}]`, duplicado.id);
    }
  })();

  console.log(`\n  ✅ ${acciones.length} duplicados archivados; no se borró historial.\n`);
}

try {
  main();
} catch (error) {
  console.error(`\n  ❌ ${error.message}\n`);
  process.exitCode = 1;
}
