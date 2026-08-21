/**
 * Consolida el alta duplicada de Canelones sin reescribir el historial.
 *
 * El producto más antiguo queda como canónico. Los pedidos y menús históricos
 * conservan el id con el que fueron registrados; sólo se copian las listas de
 * opciones operativas y se desactivan las altas repetidas. El stock no se suma
 * porque ambas filas representan la misma preparación: se conserva el mayor.
 *
 *   node server/scripts/consolidarCanelonesDuplicados.js
 *   node server/scripts/consolidarCanelonesDuplicados.js --aplicar
 */

const path = require('path');
const db = require(path.join(__dirname, '..', 'db'));
const { createDatabaseBackup } = require(path.join(__dirname, '..', 'utils', 'backupManager'));

const APLICAR = process.argv.includes('--aplicar');

function buscar() {
  return db
    .prepare(
      `SELECT id, nombre, descripcion, categoria_id, precio, activo, stock_directo,
              stock_mode, menu_dia_base, menu_dia_disponible_hoy, menu_dia_tipo, creado_en
         FROM productos
        WHERE activo = 1
          AND lower(trim(nombre)) IN ('canelon', 'canelones', 'canelón', 'canelónes')
        ORDER BY categoria_id, datetime(creado_en), id`
    )
    .all();
}

function main() {
  const productos = buscar();
  const porCategoria = Map.groupBy(productos, (producto) => producto.categoria_id);
  const grupos = [...porCategoria.values()].filter((grupo) => grupo.length > 1);

  console.log('\nConsolidación de Canelones duplicados\n');
  if (!grupos.length) {
    console.log('  No hay Canelones activos duplicados en una misma categoría.\n');
    return;
  }

  for (const grupo of grupos) {
    const [canonico, ...duplicados] = grupo;
    const incompatibles = duplicados.filter(
      (item) =>
        Number(item.precio) !== Number(canonico.precio) ||
        String(item.stock_mode) !== String(canonico.stock_mode) ||
        String(item.menu_dia_tipo) !== String(canonico.menu_dia_tipo)
    );
    if (incompatibles.length) {
      throw new Error(
        `Los Canelones de la categoría ${canonico.categoria_id} no son equivalentes; no se tocó nada.`
      );
    }
    console.log(`  Canónico: #${canonico.id} ${canonico.nombre} · stock ${canonico.stock_directo}`);
    duplicados.forEach((item) =>
      console.log(`  Duplicado: #${item.id} ${item.nombre} · stock ${item.stock_directo}`)
    );
    console.log(
      `  Resultado: #${canonico.id} activo con stock ${Math.max(...grupo.map((p) => Number(p.stock_directo || 0)))}; ${duplicados.length} duplicado(s) inactivo(s).\n`
    );
  }

  if (!APLICAR) {
    console.log('  Esto fue sólo una vista previa. No se cambió nada.\n');
    return;
  }

  const backup = createDatabaseBackup(db, { reason: 'antes-consolidar-canelones' });
  console.log(`  Backup: ${backup.file}`);

  const resultado = db.transaction(() => {
    let desactivados = 0;
    let listasCopiadas = 0;
    for (const grupo of grupos) {
      const [canonico, ...duplicados] = grupo;
      const stock = Math.max(...grupo.map((producto) => Number(producto.stock_directo || 0)));
      const disponibleHoy = Math.max(
        ...grupo.map((producto) => Number(producto.menu_dia_disponible_hoy || 0))
      );
      const copiarLista = db.prepare(
        `INSERT OR IGNORE INTO producto_opcion_listas (producto_id, lista_id, orden)
         SELECT ?, lista_id, orden FROM producto_opcion_listas WHERE producto_id = ?`
      );
      for (const duplicado of duplicados) {
        listasCopiadas += copiarLista.run(canonico.id, duplicado.id).changes;
      }
      db.prepare(
        `UPDATE productos
            SET stock_directo = ?, menu_dia_disponible_hoy = ?, disponible_para_venta = 1
          WHERE id = ?`
      ).run(stock, disponibleHoy, canonico.id);
      for (const duplicado of duplicados) {
        desactivados += db
          .prepare(
            `UPDATE productos
                SET activo = 0, disponible_para_venta = 0,
                    menu_dia_disponible_hoy = 0, stock_directo = 0
              WHERE id = ? AND activo = 1`
          )
          .run(duplicado.id).changes;
      }
    }
    return { desactivados, listasCopiadas };
  })();

  console.log(
    `  Listo: ${resultado.desactivados} duplicado(s) desactivado(s), ${resultado.listasCopiadas} lista(s) copiada(s).\n`
  );
}

main();
