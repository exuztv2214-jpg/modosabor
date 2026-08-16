/**
 * Datos mínimos para que los tests del agente tengan qué cotizar.
 *
 * Cada corrida parte de una base temporal vacía: estos datos no representan
 * ni leen el catálogo de trabajo. Los precios están en centavos.
 */
function sembrarCatalogoBase(db) {
  const presentacionPizza = JSON.stringify([
    {
      nombre: 'Presentación',
      obligatorio: true,
      opciones: [
        { nombre: 'Entera Cremoso', precio_extra: 0 },
        { nombre: 'Entera Muzza', precio_extra: 0 },
      ],
    },
  ]);
  const opcionesNoPizza = JSON.stringify([
    {
      nombre: 'Tamaño',
      obligatorio: true,
      opciones: [
        { nombre: 'Simple', precio_extra: 0 },
        { nombre: 'Doble', precio_extra: 100000 },
      ],
    },
  ]);

  db.transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO categorias (id, nombre, activo, orden)
       VALUES (1, 'Pizzas', 1, 1)`
    ).run();
    db.prepare(
      `INSERT OR IGNORE INTO categorias (id, nombre, activo, orden)
       VALUES (2, 'Hamburguesas', 1, 2)`
    ).run();
    db.prepare(
      `INSERT OR IGNORE INTO productos
       (id, nombre, precio, categoria_id, variantes, activo, stock_directo, stock_mode)
       VALUES (2, 'Común', 800000, 1, ?, 1, 100, 'recipe')`
    ).run(presentacionPizza);
    db.prepare(
      `INSERT OR IGNORE INTO productos
       (id, nombre, precio, categoria_id, variantes, activo, stock_directo, stock_mode)
       VALUES (3, 'Hamburguesa de prueba', 500000, 2, ?, 1, 100, 'direct')`
    ).run(opcionesNoPizza);
    db.prepare(
      `INSERT OR IGNORE INTO inventario_insumos (id, nombre, unidad, stock_actual, activo)
       VALUES (1, 'Masa de pizza', 'u', 1000, 1)`
    ).run();
    db.prepare(
      `INSERT OR IGNORE INTO inventario_insumos (id, nombre, unidad, stock_actual, activo)
       VALUES (2, 'Queso muzza', 'u', 1000, 1)`
    ).run();
    db.prepare(
      `INSERT OR IGNORE INTO inventario_recetas
       (producto_id, insumo_id, cantidad, condicion_tipo, condicion_grupo, condicion_valor, orden)
       VALUES (2, 1, 1, 'siempre', '', '', 1)`
    ).run();
    db.prepare(
      `INSERT OR IGNORE INTO inventario_recetas
       (producto_id, insumo_id, cantidad, condicion_tipo, condicion_grupo, condicion_valor, orden)
       VALUES (2, 2, 1, 'variante', 'Presentacion', 'Entera Muzza', 2)`
    ).run();
  })();
}

module.exports = { sembrarCatalogoBase };
