/**
 * Consolida el alta duplicada de Canelones sin reescribir el historial.
 *
 * El producto con más pedidos y menús históricos queda como canónico. Los
 * pedidos y menús conservan el id con el que fueron registrados; sólo se copian las listas de
 * opciones operativas y se desactivan las altas repetidas. Si una fila vive en
 * Menú del Día y otra en Pastas, la histórica queda como canónica pero adopta
 * la categoría Pastas: `menu_dia_base` ya permite que el mismo producto siga
 * apareciendo también en el menú diario. El stock no se suma porque ambas
 * filas representan la misma preparación: se conserva el mayor.
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
      `SELECT id, nombre, descripcion, categoria_id, precio, activo, stock_directo, variantes,
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
  const grupos = productos.length > 1 ? [productos] : [];

  console.log('\nConsolidación de Canelones duplicados\n');
  if (!grupos.length) {
    console.log('  No hay Canelones activos duplicados.\n');
    return;
  }

  for (const grupo of grupos) {
    const conUso = grupo.map((item) => ({
      ...item,
      usos:
        db.prepare('SELECT COUNT(*) AS n FROM pedido_items WHERE producto_id = ?').get(item.id).n +
        db
          .prepare('SELECT COUNT(*) AS n FROM menu_dia_historial WHERE producto_id = ?')
          .get(item.id).n,
    }));
    const canonico = conUso.sort((a, b) => b.usos - a.usos || a.id - b.id)[0];
    const duplicados = grupo.filter((item) => item.id !== canonico.id);
    const incompatibles = duplicados.filter(
      (item) =>
        Number(item.precio) !== Number(canonico.precio) ||
        String(item.stock_mode) !== String(canonico.stock_mode) ||
        String(item.menu_dia_tipo) !== String(canonico.menu_dia_tipo)
    );
    if (incompatibles.length) {
      throw new Error(
        'Los Canelones activos no son equivalentes en precio, stock o tipo de menú; no se tocó nada.'
      );
    }
    const categoriaPastas = grupo.find((item) =>
      /pastas/i.test(
        String(
          db.prepare('SELECT nombre FROM categorias WHERE id = ?').get(item.categoria_id)?.nombre ||
            ''
        )
      )
    )?.categoria_id;
    if (!categoriaPastas) {
      throw new Error('No se encontró la categoría Pastas entre los Canelones; no se tocó nada.');
    }
    console.log(`  Canónico: #${canonico.id} ${canonico.nombre} · stock ${canonico.stock_directo}`);
    duplicados.forEach((item) =>
      console.log(`  Duplicado: #${item.id} ${item.nombre} · stock ${item.stock_directo}`)
    );
    console.log(
      `  Resultado: #${canonico.id} Canelones en Pastas y Menú del Día, stock ${Math.max(...grupo.map((p) => Number(p.stock_directo || 0)))}; ${duplicados.length} duplicado(s) inactivo(s).\n`
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
      const conUso = grupo.map((item) => ({
        ...item,
        usos:
          db.prepare('SELECT COUNT(*) AS n FROM pedido_items WHERE producto_id = ?').get(item.id)
            .n +
          db
            .prepare('SELECT COUNT(*) AS n FROM menu_dia_historial WHERE producto_id = ?')
            .get(item.id).n,
      }));
      const canonico = conUso.sort((a, b) => b.usos - a.usos || a.id - b.id)[0];
      const duplicados = grupo.filter((item) => item.id !== canonico.id);
      const categoriaPastas = grupo.find((item) =>
        /pastas/i.test(
          String(
            db.prepare('SELECT nombre FROM categorias WHERE id = ?').get(item.categoria_id)
              ?.nombre || ''
          )
        )
      ).categoria_id;
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
      /*
        El grupo escrito a mano y la lista compartida representan las mismas
        tres salsas. Sólo se quita cuando coincide exactamente; cualquier otra
        variante se conserva para revisión manual.
      */
      const variantes = JSON.parse(canonico.variantes || '[]');
      const salsas = new Set(['salsa roja', 'salsa blanca', 'salsa mixta']);
      const variantesLimpias = variantes.filter((grupoVariantes) => {
        const opciones = Array.isArray(grupoVariantes?.opciones)
          ? grupoVariantes.opciones.map((opcion) =>
              String(opcion?.nombre || '')
                .trim()
                .toLowerCase()
            )
          : [];
        return !(opciones.length === 3 && opciones.every((opcion) => salsas.has(opcion)));
      });
      db.prepare(
        `UPDATE productos
            SET nombre = 'Canelones', categoria_id = ?, stock_directo = ?,
                menu_dia_base = 1, menu_dia_disponible_hoy = ?,
                disponible_para_venta = 1, variantes = ?
          WHERE id = ?`
      ).run(categoriaPastas, stock, disponibleHoy, JSON.stringify(variantesLimpias), canonico.id);
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
