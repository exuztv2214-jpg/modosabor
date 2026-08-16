const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const {
  CONDITION_TYPES,
  cleanText,
  decorateProductsWithInventory,
  insertInventoryMovement,
  registerManualStockAdjustment,
  roundStock,
} = require('../utils/inventory');

router.use(auth, requirePermission('productos.edit'));

router.get('/insumos', (_req, res) => {
  const rows = db
    .prepare(
      `
    SELECT *
    FROM inventario_insumos
    ORDER BY activo DESC, nombre ASC, id ASC
  `
    )
    .all();

  res.json(
    rows.map((row) => ({
      ...row,
      rubro: row.rubro || 'General',
      nota_compra: row.nota_compra || '',
      stock_actual: roundStock(row.stock_actual || 0),
      stock_minimo: roundStock(row.stock_minimo || 0),
      costo_unitario: roundStock(row.costo_unitario || 0),
      stock_bajo: roundStock(row.stock_actual || 0) <= roundStock(row.stock_minimo || 0),
    }))
  );
});

router.post('/insumos', (req, res) => {
  const nombre = cleanText(req.body?.nombre);
  const rubro = cleanText(req.body?.rubro) || 'General';
  const unidad = cleanText(req.body?.unidad) || 'u';
  const stockActual = roundStock(req.body?.stock_actual || 0);
  const stockMinimo = roundStock(req.body?.stock_minimo || 0);
  const costoUnitario = roundStock(req.body?.costo_unitario || 0);
  const notaCompra = cleanText(req.body?.nota_compra);
  const activo = Number(req.body?.activo) === 0 ? 0 : 1;

  if (!nombre) {
    return res.status(400).json({ error: 'Nombre requerido' });
  }

  const existing = db
    .prepare('SELECT id FROM inventario_insumos WHERE lower(nombre) = lower(?)')
    .get(nombre);
  if (existing) {
    return res.status(400).json({ error: 'Ya existe un insumo con ese nombre' });
  }

  const result = db
    .prepare(
      `
    INSERT INTO inventario_insumos (nombre, rubro, unidad, stock_actual, stock_minimo, costo_unitario, nota_compra, activo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(nombre, rubro, unidad, stockActual, stockMinimo, costoUnitario, notaCompra, activo);

  if (stockActual !== 0) {
    insertInventoryMovement(db, {
      insumo_id: result.lastInsertRowid,
      cantidad: stockActual,
      tipo: 'ajuste',
      motivo: 'Stock inicial de insumo',
      detalle: {
        insumo_nombre: nombre,
        nuevo: stockActual,
      },
    });
  }

  const created = db
    .prepare('SELECT * FROM inventario_insumos WHERE id = ?')
    .get(result.lastInsertRowid);
  res.json({
    ...created,
    rubro: created.rubro || 'General',
    nota_compra: created.nota_compra || '',
    stock_bajo: roundStock(created.stock_actual || 0) <= roundStock(created.stock_minimo || 0),
  });
});

router.put('/insumos/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM inventario_insumos WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Insumo no encontrado' });
  }

  const nombre = cleanText(req.body?.nombre ?? existing.nombre);
  const rubro = cleanText(req.body?.rubro ?? existing.rubro) || 'General';
  const unidad = cleanText(req.body?.unidad ?? existing.unidad) || 'u';
  const stockActual = roundStock(req.body?.stock_actual ?? existing.stock_actual);
  const stockMinimo = roundStock(req.body?.stock_minimo ?? existing.stock_minimo);
  const costoUnitario = roundStock(req.body?.costo_unitario ?? existing.costo_unitario);
  const notaCompra = cleanText(req.body?.nota_compra ?? existing.nota_compra);
  const activo =
    req.body?.activo === undefined
      ? Number(existing.activo || 1)
      : Number(req.body.activo) === 0
        ? 0
        : 1;

  if (!nombre) {
    return res.status(400).json({ error: 'Nombre requerido' });
  }

  const duplicate = db
    .prepare('SELECT id FROM inventario_insumos WHERE lower(nombre) = lower(?) AND id != ?')
    .get(nombre, req.params.id);
  if (duplicate) {
    return res.status(400).json({ error: 'Ya existe un insumo con ese nombre' });
  }

  const previousStock = roundStock(existing.stock_actual || 0);
  const delta = roundStock(stockActual - previousStock);

  db.prepare(
    `
    UPDATE inventario_insumos
    SET nombre = ?, rubro = ?, unidad = ?, stock_actual = ?, stock_minimo = ?, costo_unitario = ?, nota_compra = ?, activo = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(
    nombre,
    rubro,
    unidad,
    stockActual,
    stockMinimo,
    costoUnitario,
    notaCompra,
    activo,
    req.params.id
  );

  if (delta !== 0) {
    insertInventoryMovement(db, {
      insumo_id: Number(req.params.id),
      cantidad: delta,
      tipo: 'ajuste',
      motivo: 'Ajuste manual de insumo',
      detalle: {
        insumo_nombre: nombre,
        anterior: previousStock,
        nuevo: stockActual,
      },
    });
  }

  const updated = db.prepare('SELECT * FROM inventario_insumos WHERE id = ?').get(req.params.id);
  res.json({
    ...updated,
    rubro: updated.rubro || 'General',
    nota_compra: updated.nota_compra || '',
    stock_bajo: roundStock(updated.stock_actual || 0) <= roundStock(updated.stock_minimo || 0),
  });
});

router.delete('/insumos/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM inventario_insumos WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Insumo no encontrado' });
  }

  const recipeUse =
    db
      .prepare('SELECT COUNT(*) AS total FROM inventario_recetas WHERE insumo_id = ?')
      .get(req.params.id)?.total || 0;
  if (recipeUse > 0) {
    return res.status(400).json({
      error: 'Ese insumo esta usado en recetas. Quitalo de las recetas antes de eliminarlo.',
    });
  }

  db.prepare('DELETE FROM inventario_insumos WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/insumos/:id/movimientos', (req, res) => {
  const insumo = db.prepare('SELECT * FROM inventario_insumos WHERE id = ?').get(req.params.id);
  if (!insumo) {
    return res.status(404).json({ error: 'Insumo no encontrado' });
  }

  const tipo = cleanText(req.body?.tipo) || 'entrada';
  const cantidadBase = roundStock(req.body?.cantidad || 0);
  const motivo = cleanText(req.body?.motivo) || 'Movimiento manual';
  if (cantidadBase <= 0) {
    return res.status(400).json({ error: 'Cantidad invalida' });
  }

  const signed = tipo === 'salida' ? -cantidadBase : cantidadBase;
  const nextStock = roundStock(Number(insumo.stock_actual || 0) + signed);
  if (nextStock < 0) {
    return res.status(400).json({ error: 'El movimiento deja stock negativo' });
  }

  db.prepare(
    `
    UPDATE inventario_insumos
    SET stock_actual = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(nextStock, req.params.id);

  insertInventoryMovement(db, {
    insumo_id: Number(req.params.id),
    cantidad: signed,
    tipo,
    motivo,
    detalle: {
      insumo_nombre: insumo.nombre,
      anterior: roundStock(insumo.stock_actual || 0),
      nuevo: nextStock,
    },
  });

  const updated = db.prepare('SELECT * FROM inventario_insumos WHERE id = ?').get(req.params.id);
  res.json({
    ...updated,
    rubro: updated.rubro || 'General',
    nota_compra: updated.nota_compra || '',
    stock_bajo: roundStock(updated.stock_actual || 0) <= roundStock(updated.stock_minimo || 0),
  });
});

router.get('/productos', (_req, res) => {
  const rows = db
    .prepare(
      `
    SELECT p.*, c.nombre AS categoria_nombre, c.icono AS categoria_icono
    FROM productos p
    LEFT JOIN categorias c ON p.categoria_id = c.id
    ORDER BY c.orden ASC, p.nombre ASC
  `
    )
    .all();
  res.json(decorateProductsWithInventory(db, rows));
});

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function getVariantOptionNames(product, groupName) {
  const groups = parseJson(product?.variantes, []);
  if (!Array.isArray(groups)) return [];
  const group = groups.find((entry) => normalizeKey(entry?.nombre) === normalizeKey(groupName));
  if (!group || !Array.isArray(group.opciones)) return [];
  return group.opciones
    .map((option) => cleanText(option?.nombre || option?.value || option))
    .filter(Boolean);
}

function getCategoryByName(name) {
  return db
    .prepare(
      `
    SELECT id, nombre
    FROM categorias
    WHERE lower(nombre) = lower(?)
    LIMIT 1
  `
    )
    .get(name);
}

function ensureInsumo({ nombre, rubro, unidad, nota_compra }) {
  let insumo = db
    .prepare(
      `
    SELECT *
    FROM inventario_insumos
    WHERE lower(nombre) = lower(?)
    LIMIT 1
  `
    )
    .get(nombre);

  if (!insumo) {
    const insert = db
      .prepare(
        `
      INSERT INTO inventario_insumos (nombre, rubro, unidad, stock_actual, stock_minimo, costo_unitario, nota_compra, activo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(nombre, rubro || 'General', unidad || 'u', 0, 0, 0, nota_compra || '', 1);
    insumo = db
      .prepare('SELECT * FROM inventario_insumos WHERE id = ?')
      .get(insert.lastInsertRowid);
  } else {
    db.prepare(
      `
      UPDATE inventario_insumos
      SET rubro = ?,
          unidad = ?,
          nota_compra = ?,
          activo = 1,
          actualizado_en = CURRENT_TIMESTAMP
      WHERE id = ?
    `
    ).run(
      rubro || insumo.rubro || 'General',
      unidad || insumo.unidad || 'u',
      nota_compra || insumo.nota_compra || '',
      insumo.id
    );
    insumo = db.prepare('SELECT * FROM inventario_insumos WHERE id = ?').get(insumo.id);
  }

  return insumo;
}

function syncProductsWithRecipes({ categoryName, buildRows }) {
  const category = getCategoryByName(categoryName);
  if (!category) {
    return { error: `No existe la categoria ${categoryName}` };
  }

  const products = db
    .prepare(
      `
    SELECT id, nombre, variantes, activo
    FROM productos
    WHERE categoria_id = ? AND activo = 1
    ORDER BY nombre ASC
  `
    )
    .all(category.id);

  const deleteRecipes = db.prepare('DELETE FROM inventario_recetas WHERE producto_id = ?');
  const updateMode = db.prepare(`
    UPDATE productos
    SET stock_mode = 'recipe',
        stock_directo = 0
    WHERE id = ?
  `);
  const insertRecipe = db.prepare(`
    INSERT INTO inventario_recetas (
      producto_id, insumo_id, cantidad, condicion_tipo, condicion_grupo, condicion_valor, orden
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const touchedInsumos = new Map();

  db.exec('BEGIN');
  try {
    products.forEach((product) => {
      const rows = buildRows(product);
      if (!Array.isArray(rows) || rows.length === 0) return;

      deleteRecipes.run(product.id);
      updateMode.run(product.id);

      rows.forEach((row, index) => {
        insertRecipe.run(
          product.id,
          row.insumo_id,
          row.cantidad,
          row.condicion_tipo,
          row.condicion_grupo,
          row.condicion_valor,
          Number(row.orden ?? index)
        );
        if (!touchedInsumos.has(row.insumo_id)) {
          touchedInsumos.set(
            row.insumo_id,
            db.prepare('SELECT * FROM inventario_insumos WHERE id = ?').get(row.insumo_id)
          );
        }
      });
    });
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    return { error: error.message || `No se pudo sincronizar ${categoryName}` };
  }

  const refreshed = db
    .prepare(
      `
    SELECT p.*, c.nombre AS categoria_nombre, c.icono AS categoria_icono
    FROM productos p
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE p.categoria_id = ? AND p.activo = 1
    ORDER BY p.nombre ASC
  `
    )
    .all(category.id);

  return {
    success: true,
    total: products.length,
    insumos: Array.from(touchedInsumos.values()).map((insumo) => ({
      id: insumo.id,
      nombre: insumo.nombre,
      stock_actual: roundStock(insumo.stock_actual || 0),
      unidad: insumo.unidad || 'u',
    })),
    productos: decorateProductsWithInventory(db, refreshed),
  };
}

router.post('/productos/sync/pizzas-prepizza', (_req, res) => {
  const pizzaCategory = getCategoryByName('Pizzas');

  if (!pizzaCategory) {
    return res.status(400).json({ error: 'No existe la categoria Pizzas' });
  }

  const prepizza = ensureInsumo({
    nombre: 'Prepizza',
    rubro: 'Panaderia',
    unidad: 'u',
    nota_compra: 'Base compartida para pizzas',
  });
  const quesoCremoso = ensureInsumo({
    nombre: 'Queso cremoso 200g',
    rubro: 'Fiambreria',
    unidad: 'u',
    nota_compra: 'Porcion compartida de queso cremoso para pizzas',
  });
  const muzzarella = ensureInsumo({
    nombre: 'Muzzarella 200g',
    rubro: 'Fiambreria',
    unidad: 'u',
    nota_compra: 'Porcion compartida de muzzarella para pizzas',
  });

  const result = syncProductsWithRecipes({
    categoryName: 'Pizzas',
    buildRows: (product) => {
      const options = getVariantOptionNames(product, 'Presentacion');
      if (!options.length) {
        return [
          {
            insumo_id: prepizza.id,
            cantidad: 1,
            condicion_tipo: CONDITION_TYPES.ALWAYS,
            condicion_grupo: '',
            condicion_valor: '',
            orden: 0,
          },
          {
            insumo_id: quesoCremoso.id,
            cantidad: 1,
            condicion_tipo: CONDITION_TYPES.ALWAYS,
            condicion_grupo: '',
            condicion_valor: '',
            orden: 1,
          },
        ];
      }

      return options.flatMap((option, index) => {
        const key = normalizeKey(option);
        const esMedia = key.includes('media') || key.includes('mitad');
        const cantidad = esMedia ? 0.5 : 1;
        const rows = [
          {
            insumo_id: prepizza.id,
            cantidad,
            condicion_tipo: CONDITION_TYPES.VARIANT,
            condicion_grupo: 'Presentacion',
            condicion_valor: option,
            orden: index * 2,
          },
        ];

        if (key.includes('cremoso')) {
          rows.push({
            insumo_id: quesoCremoso.id,
            cantidad,
            condicion_tipo: CONDITION_TYPES.VARIANT,
            condicion_grupo: 'Presentacion',
            condicion_valor: option,
            orden: index * 2 + 1,
          });
        } else if (key.includes('muzza') || key.includes('musa') || key.includes('mozzarella')) {
          rows.push({
            insumo_id: muzzarella.id,
            cantidad,
            condicion_tipo: CONDITION_TYPES.VARIANT,
            condicion_grupo: 'Presentacion',
            condicion_valor: option,
            orden: index * 2 + 1,
          });
        }

        return rows;
      });
    },
  });

  if (result.error) {
    return res.status(500).json({ error: result.error });
  }

  res.json({
    ...result,
    insumo: {
      id: prepizza.id,
      nombre: prepizza.nombre,
      stock_actual: roundStock(prepizza.stock_actual || 0),
      unidad: prepizza.unidad || 'u',
    },
  });
});

router.post('/productos/sync/empanadas-insumos', (_req, res) => {
  const empanadasCategory = getCategoryByName('Empanadas');
  if (!empanadasCategory) {
    return res.status(400).json({ error: 'No existe la categoria Empanadas' });
  }

  const productRows = db
    .prepare(
      `
    SELECT id, nombre
    FROM productos
    WHERE categoria_id = ? AND activo = 1
    ORDER BY nombre ASC
  `
    )
    .all(empanadasCategory.id);

  const insumos = db
    .prepare(
      `
    SELECT *
    FROM inventario_insumos
    WHERE lower(nombre) LIKE 'empanada %'
    ORDER BY nombre ASC
  `
    )
    .all();

  const insumosMap = new Map(
    insumos.map((insumo) => [normalizeKey(insumo.nombre.replace(/^empanada\s+/i, '')), insumo])
  );

  const missing = [];
  productRows.forEach((product) => {
    const key = normalizeKey(product.nombre);
    if (!insumosMap.has(key)) {
      missing.push(product.nombre);
    }
  });

  if (missing.length > 0) {
    return res.status(400).json({
      error: `Faltan insumos de empanadas para: ${missing.join(', ')}`,
    });
  }

  const result = syncProductsWithRecipes({
    categoryName: 'Empanadas',
    buildRows: (product) => {
      const insumo = insumosMap.get(normalizeKey(product.nombre));
      return [
        {
          insumo_id: insumo.id,
          cantidad: 6,
          condicion_tipo: CONDITION_TYPES.VARIANT,
          condicion_grupo: 'Presentacion',
          condicion_valor: 'Media docena',
          orden: 0,
        },
        {
          insumo_id: insumo.id,
          cantidad: 12,
          condicion_tipo: CONDITION_TYPES.VARIANT,
          condicion_grupo: 'Presentacion',
          condicion_valor: 'Docena',
          orden: 1,
        },
      ];
    },
  });

  if (result.error) {
    return res.status(500).json({ error: result.error });
  }

  res.json(result);
});

router.post('/productos/sync/milanesas-base', (_req, res) => {
  const milanesasCategory = getCategoryByName('Milanesas');
  if (!milanesasCategory) {
    return res.status(400).json({ error: 'No existe la categoria Milanesas' });
  }

  const carne = ensureInsumo({
    nombre: 'Milanesa de carne',
    rubro: 'Carniceria',
    unidad: 'u',
    nota_compra: 'Base compartida para milanesas de carne',
  });
  const pollo = ensureInsumo({
    nombre: 'Milanesa de pollo',
    rubro: 'Carniceria',
    unidad: 'u',
    nota_compra: 'Base compartida para milanesas de pollo',
  });

  const result = syncProductsWithRecipes({
    categoryName: 'Milanesas',
    buildRows: (product) => {
      const options = getVariantOptionNames(product, 'Tipo');
      if (!options.length) {
        return [
          {
            insumo_id: carne.id,
            cantidad: 1,
            condicion_tipo: CONDITION_TYPES.ALWAYS,
            condicion_grupo: '',
            condicion_valor: '',
            orden: 0,
          },
        ];
      }

      return options.map((option, index) => ({
        insumo_id: normalizeKey(option).includes('pollo') ? pollo.id : carne.id,
        cantidad: 1,
        condicion_tipo: CONDITION_TYPES.VARIANT,
        condicion_grupo: 'Tipo',
        condicion_valor: option,
        orden: index,
      }));
    },
  });

  if (result.error) {
    return res.status(500).json({ error: result.error });
  }

  res.json(result);
});

function inferSmashCount(product) {
  const text = normalizeKey(`${product?.nombre || ''} ${product?.descripcion || ''}`);
  if (text.includes('cuadruple')) return 4;
  if (text.includes('triple')) return 3;
  if (text.includes('doble')) return 2;
  return 1;
}

router.post('/productos/sync/hamburguesas-base', (_req, res) => {
  const hamburguesasCategory = getCategoryByName('Hamburguesas');
  if (!hamburguesasCategory) {
    return res.status(400).json({ error: 'No existe la categoria Hamburguesas' });
  }

  const pan = ensureInsumo({
    nombre: 'Pan hamburguesa',
    rubro: 'Panaderia',
    unidad: 'u',
    nota_compra: 'Pan compartido para todas las hamburguesas',
  });
  const medallon = ensureInsumo({
    nombre: 'Medallon smash 90g',
    rubro: 'Carniceria',
    unidad: 'u',
    nota_compra: 'Medallon compartido para hamburguesas smash',
  });

  const result = syncProductsWithRecipes({
    categoryName: 'Hamburguesas',
    buildRows: (product) => [
      {
        insumo_id: pan.id,
        cantidad: 1,
        condicion_tipo: CONDITION_TYPES.ALWAYS,
        condicion_grupo: '',
        condicion_valor: '',
        orden: 0,
      },
      {
        insumo_id: medallon.id,
        cantidad: inferSmashCount(product),
        condicion_tipo: CONDITION_TYPES.ALWAYS,
        condicion_grupo: '',
        condicion_valor: '',
        orden: 1,
      },
    ],
  });

  if (result.error) {
    return res.status(500).json({ error: result.error });
  }

  res.json(result);
});

router.post('/productos/sync/papas-full-cheddar', (_req, res) => {
  const papasCategory = getCategoryByName('Papas');
  if (!papasCategory) {
    return res.status(400).json({ error: 'No existe la categoria Papas' });
  }

  const papas = ensureInsumo({
    nombre: 'Papas',
    rubro: 'Verduleria',
    unidad: 'kg',
    nota_compra: 'Base compartida para porciones de papas',
  });
  const cheddar = ensureInsumo({
    nombre: 'Cheddar',
    rubro: 'Fiambreria',
    unidad: 'kg',
    nota_compra: 'Queso cheddar para papas y milanesas',
  });
  const panceta = ensureInsumo({
    nombre: 'Panceta',
    rubro: 'Fiambreria',
    unidad: 'kg',
    nota_compra: 'Panceta para papas y pizzas',
  });
  const verdeo = ensureInsumo({
    nombre: 'Cebolla de verdeo',
    rubro: 'Verduleria',
    unidad: 'porcion',
    nota_compra: 'Verdeo para terminaciones',
  });

  const result = syncProductsWithRecipes({
    categoryName: 'Papas',
    buildRows: (product) => {
      if (normalizeKey(product.nombre) !== normalizeKey('Papas Full Cheddar')) return [];
      return [
        {
          insumo_id: papas.id,
          cantidad: 0.5,
          condicion_tipo: CONDITION_TYPES.ALWAYS,
          condicion_grupo: '',
          condicion_valor: '',
          orden: 0,
        },
        {
          insumo_id: cheddar.id,
          cantidad: 0.2,
          condicion_tipo: CONDITION_TYPES.ALWAYS,
          condicion_grupo: '',
          condicion_valor: '',
          orden: 1,
        },
        {
          insumo_id: panceta.id,
          cantidad: 0.05,
          condicion_tipo: CONDITION_TYPES.ALWAYS,
          condicion_grupo: '',
          condicion_valor: '',
          orden: 2,
        },
        {
          insumo_id: verdeo.id,
          cantidad: 1,
          condicion_tipo: CONDITION_TYPES.ALWAYS,
          condicion_grupo: '',
          condicion_valor: '',
          orden: 3,
        },
      ];
    },
  });

  if (result.error) {
    return res.status(500).json({ error: result.error });
  }

  res.json(result);
});

router.put('/productos/:id/config', (req, res) => {
  const product = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Producto no encontrado' });
  }

  const stockMode = cleanText(req.body?.stock_mode || product.stock_mode || 'direct');
  if (!['direct', 'recipe'].includes(stockMode)) {
    return res.status(400).json({ error: 'Modo de stock invalido' });
  }

  const nextDirectStock = roundStock(req.body?.stock_directo ?? product.stock_directo ?? 0);
  db.prepare('UPDATE productos SET stock_mode = ? WHERE id = ?').run(stockMode, req.params.id);
  registerManualStockAdjustment(
    db,
    product,
    nextDirectStock,
    `Ajuste de stock directo para ${product.nombre}`
  );

  const updated = db
    .prepare(
      `
    SELECT p.*, c.nombre AS categoria_nombre, c.icono AS categoria_icono
    FROM productos p
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE p.id = ?
  `
    )
    .get(req.params.id);
  res.json(decorateProductsWithInventory(db, [updated])[0]);
});

router.put('/productos/:id/receta', (req, res) => {
  const product = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Producto no encontrado' });
  }

  const recipes = Array.isArray(req.body?.recipes) ? req.body.recipes : [];
  const normalized = recipes.map((recipe, index) => ({
    insumo_id: Number(recipe?.insumo_id),
    cantidad: roundStock(recipe?.cantidad || 0),
    condicion_tipo: cleanText(recipe?.condicion_tipo) || CONDITION_TYPES.ALWAYS,
    condicion_grupo: cleanText(recipe?.condicion_grupo),
    condicion_valor: cleanText(recipe?.condicion_valor),
    orden: Number(recipe?.orden ?? index),
  }));

  const invalid = normalized.find(
    (recipe) =>
      !Number.isFinite(recipe.insumo_id) ||
      recipe.cantidad <= 0 ||
      ![CONDITION_TYPES.ALWAYS, CONDITION_TYPES.VARIANT, CONDITION_TYPES.EXTRA].includes(
        recipe.condicion_tipo
      ) ||
      (recipe.condicion_tipo === CONDITION_TYPES.VARIANT &&
        (!recipe.condicion_grupo || !recipe.condicion_valor)) ||
      (recipe.condicion_tipo === CONDITION_TYPES.EXTRA && !recipe.condicion_valor)
  );
  if (invalid) {
    return res.status(400).json({ error: 'Hay lineas de receta incompletas o invalidas' });
  }

  const insumoIds = Array.from(new Set(normalized.map((recipe) => recipe.insumo_id)));
  if (insumoIds.length > 0) {
    const placeholders = insumoIds.map(() => '?').join(', ');
    const rows = db
      .prepare(`SELECT id FROM inventario_insumos WHERE id IN (${placeholders})`)
      .all(...insumoIds);
    if (rows.length !== insumoIds.length) {
      return res.status(400).json({ error: 'Algunos insumos ya no existen' });
    }
  }

  db.prepare('DELETE FROM inventario_recetas WHERE producto_id = ?').run(req.params.id);
  const insert = db.prepare(`
    INSERT INTO inventario_recetas (
      producto_id, insumo_id, cantidad, condicion_tipo, condicion_grupo, condicion_valor, orden
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  normalized.forEach((recipe) => {
    insert.run(
      req.params.id,
      recipe.insumo_id,
      recipe.cantidad,
      recipe.condicion_tipo,
      recipe.condicion_grupo,
      recipe.condicion_valor,
      recipe.orden
    );
  });

  const updated = db
    .prepare(
      `
    SELECT p.*, c.nombre AS categoria_nombre, c.icono AS categoria_icono
    FROM productos p
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE p.id = ?
  `
    )
    .get(req.params.id);
  res.json(decorateProductsWithInventory(db, [updated])[0]);
});

/**
 * Mermas y desperdicios.
 *
 * ── Por qué no alcanza con un ajuste ───────────────────────────────────────
 *
 * Ya se podía descontar stock con un movimiento manual, pero eso no dice nada:
 * un ajuste puede ser un error de carga, un recuento, o cinco kilos de carne
 * que se echaron a perder. Los tres bajan el stock igual y después no hay forma
 * de saber cuánto se tiró.
 *
 * Acá el motivo es obligatorio y sale de una lista corta, y **se guarda cuánta
 * plata era**. Eso es todo el punto de registrar una merma: al fin de mes poder
 * decir "tiré $80.000 en verdura vencida" y hacer algo al respecto.
 *
 * El costo se congela en el momento: `costo_unitario` cambia con cada compra, y
 * calcularlo después con el precio de hoy diría una mentira distinta cada vez
 * que se mira el reporte.
 */
const MOTIVOS_MERMA = [
  'vencido',
  'roto o caído',
  'mal preparado',
  'devuelto por el cliente',
  'prueba o degustación',
  'robo o faltante',
  'otro',
];

router.get('/mermas/motivos', (_req, res) => res.json(MOTIVOS_MERMA));

router.post('/insumos/:id/merma', (req, res) => {
  const insumo = db.prepare('SELECT * FROM inventario_insumos WHERE id = ?').get(req.params.id);
  if (!insumo) return res.status(404).json({ error: 'Insumo no encontrado' });

  const cantidad = roundStock(req.body?.cantidad || 0);
  if (cantidad <= 0)
    return res.status(400).json({ error: 'La cantidad tiene que ser mayor a cero' });

  const motivo = cleanText(req.body?.motivo);
  if (!MOTIVOS_MERMA.includes(motivo)) {
    return res.status(400).json({ error: 'Elegí un motivo de la lista' });
  }

  const nextStock = roundStock(Number(insumo.stock_actual || 0) - cantidad);
  if (nextStock < 0) {
    return res.status(400).json({
      error: `No podés tirar ${cantidad} ${insumo.unidad}: sólo hay ${insumo.stock_actual} en stock`,
    });
  }

  // Centavos, como toda la plata del sistema.
  const costoPerdido = Math.round(cantidad * Number(insumo.costo_unitario || 0));

  db.prepare(
    'UPDATE inventario_insumos SET stock_actual = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(nextStock, insumo.id);

  insertInventoryMovement(db, {
    insumo_id: insumo.id,
    cantidad: -cantidad,
    tipo: 'merma',
    motivo,
    detalle: {
      insumo_nombre: insumo.nombre,
      unidad: insumo.unidad,
      anterior: roundStock(insumo.stock_actual || 0),
      nuevo: nextStock,
      // Se congela acá: el costo unitario cambia con cada compra y recalcular
      // después con el precio de hoy daría un número distinto cada vez.
      costo_unitario: Number(insumo.costo_unitario || 0),
      costo_perdido: costoPerdido,
      nota: cleanText(req.body?.nota) || '',
    },
  });

  res.json({
    insumo: insumo.nombre,
    cantidad,
    unidad: insumo.unidad,
    costo_perdido: costoPerdido,
    stock_actual: nextStock,
  });
});

/** Cuánta plata se tiró, por insumo y por motivo. */
router.get('/mermas', (req, res) => {
  const desde = cleanText(req.query?.desde) || '1900-01-01';
  const hasta = cleanText(req.query?.hasta) || '2999-12-31';

  const filas = db
    .prepare(
      `SELECT m.cantidad, m.motivo, m.detalle, m.creado_en, i.nombre, i.unidad
         FROM inventario_movimientos m
         LEFT JOIN inventario_insumos i ON i.id = m.insumo_id
        WHERE m.tipo = 'merma'
          AND date(m.creado_en) BETWEEN date(?) AND date(?)
        ORDER BY m.creado_en DESC`
    )
    .all(desde, hasta);

  const movimientos = filas.map((fila) => {
    let detalle = {};
    try {
      detalle = JSON.parse(fila.detalle || '{}') || {};
    } catch {
      detalle = {};
    }
    return {
      insumo: fila.nombre || detalle.insumo_nombre || 'Insumo borrado',
      unidad: fila.unidad || detalle.unidad || '',
      cantidad: Math.abs(Number(fila.cantidad || 0)),
      motivo: fila.motivo || 'otro',
      costo_perdido: Number(detalle.costo_perdido || 0),
      nota: detalle.nota || '',
      creado_en: fila.creado_en,
    };
  });

  const agrupar = (clave) =>
    Array.from(
      movimientos
        .reduce((acc, mov) => {
          const k = mov[clave];
          const actual = acc.get(k) || { [clave]: k, veces: 0, costo: 0 };
          actual.veces += 1;
          actual.costo += mov.costo_perdido;
          acc.set(k, actual);
          return acc;
        }, new Map())
        .values()
    ).sort((a, b) => b.costo - a.costo);

  res.json({
    desde,
    hasta,
    total_perdido: movimientos.reduce((acc, m) => acc + m.costo_perdido, 0),
    por_insumo: agrupar('insumo'),
    por_motivo: agrupar('motivo'),
    movimientos: movimientos.slice(0, 200),
  });
});

router.get('/movimientos', (req, res) => {
  const limit = Math.max(1, Math.min(300, Number(req.query?.limit || 80)));
  const rows = db
    .prepare(
      `
    SELECT
      m.*,
      i.nombre AS insumo_nombre,
      i.unidad AS insumo_unidad,
      p.nombre AS producto_nombre,
      pe.numero AS pedido_numero
    FROM inventario_movimientos m
    LEFT JOIN inventario_insumos i ON i.id = m.insumo_id
    LEFT JOIN productos p ON p.id = m.producto_id
    LEFT JOIN pedidos pe ON pe.id = m.pedido_id
    ORDER BY datetime(m.creado_en) DESC, m.id DESC
    LIMIT ?
  `
    )
    .all(limit);

  res.json(
    rows.map((row) => ({
      ...row,
      cantidad: roundStock(row.cantidad || 0),
    }))
  );
});

module.exports = router;
