const { loadPedidoItems } = require('./pedidoItems');

const CONDITION_TYPES = {
  ALWAYS: 'siempre',
  VARIANT: 'variante',
  EXTRA: 'extra',
};

function roundStock(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (
    Array.isArray(value) ||
    (typeof fallback === 'object' && !Array.isArray(fallback) && typeof value === 'object')
  ) {
    return value;
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed === null || parsed === undefined) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

function variantOptionName(value) {
  if (value && typeof value === 'object') {
    return cleanText(value.nombre || value.value || '');
  }
  return cleanText(value);
}

function selectedVariantsFromItem(item) {
  const raw = parseJson(item?.variantes, {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.entries(raw)
    .map(([group, option]) => ({
      group: cleanText(group),
      option: variantOptionName(option),
    }))
    .filter((entry) => entry.group && entry.option);
}

function selectedExtrasFromItem(item) {
  const raw = parseJson(item?.extras, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (entry && typeof entry === 'object') return cleanText(entry.nombre || entry.value || '');
      return cleanText(entry);
    })
    .filter(Boolean);
}

function normalizeRecipeRow(row) {
  return {
    ...row,
    cantidad: roundStock(row?.cantidad || 0),
    condicion_tipo: cleanText(row?.condicion_tipo) || CONDITION_TYPES.ALWAYS,
    condicion_grupo: cleanText(row?.condicion_grupo),
    condicion_valor: cleanText(row?.condicion_valor),
  };
}

function recipeConditionKey(row) {
  const recipe = normalizeRecipeRow(row);
  return [
    recipe.condicion_tipo,
    normalizeText(recipe.condicion_grupo),
    normalizeText(recipe.condicion_valor),
  ].join('|');
}

function recipeMatchesItem(row, item) {
  const recipe = normalizeRecipeRow(row);

  if (recipe.condicion_tipo === CONDITION_TYPES.ALWAYS) {
    return true;
  }

  if (recipe.condicion_tipo === CONDITION_TYPES.VARIANT) {
    return selectedVariantsFromItem(item).some(
      (entry) =>
        normalizeText(entry.group) === normalizeText(recipe.condicion_grupo) &&
        normalizeText(entry.option) === normalizeText(recipe.condicion_valor)
    );
  }

  if (recipe.condicion_tipo === CONDITION_TYPES.EXTRA) {
    return selectedExtrasFromItem(item).some(
      (entry) => normalizeText(entry) === normalizeText(recipe.condicion_valor)
    );
  }

  return false;
}

function loadInventoryContext(db, productIds = []) {
  const uniqueProductIds = Array.from(
    new Set((productIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)))
  );
  const productFilter =
    uniqueProductIds.length > 0
      ? `WHERE id IN (${uniqueProductIds.map(() => '?').join(', ')})`
      : '';
  const recipeFilter =
    uniqueProductIds.length > 0
      ? `WHERE producto_id IN (${uniqueProductIds.map(() => '?').join(', ')})`
      : '';

  const products = db
    .prepare(
      `
    SELECT id, nombre, stock_mode, stock_directo
    FROM productos
    ${productFilter}
  `
    )
    .all(...uniqueProductIds);

  const insumos = db
    .prepare(
      `
    SELECT id, nombre, unidad, stock_actual, stock_minimo, costo_unitario, activo
    FROM inventario_insumos
    ORDER BY nombre ASC, id ASC
  `
    )
    .all();

  const recipes = db
    .prepare(
      `
    SELECT *
    FROM inventario_recetas
    ${recipeFilter}
    ORDER BY producto_id ASC, orden ASC, id ASC
  `
    )
    .all(...uniqueProductIds);

  const productsById = new Map(
    products.map((product) => [
      Number(product.id),
      {
        ...product,
        stock_directo: roundStock(product.stock_directo || 0),
        stock_mode: cleanText(product.stock_mode) || 'direct',
      },
    ])
  );
  const insumosById = new Map(
    insumos.map((insumo) => [
      Number(insumo.id),
      {
        ...insumo,
        stock_actual: roundStock(insumo.stock_actual || 0),
        stock_minimo: roundStock(insumo.stock_minimo || 0),
        costo_unitario: roundStock(insumo.costo_unitario || 0),
      },
    ])
  );
  const recipesByProduct = new Map();

  recipes.forEach((row) => {
    const key = Number(row.producto_id);
    if (!recipesByProduct.has(key)) {
      recipesByProduct.set(key, []);
    }
    recipesByProduct.get(key).push(normalizeRecipeRow(row));
  });

  return {
    productsById,
    insumosById,
    recipesByProduct,
  };
}

function availabilityFromRequirements(requirements, insumosById) {
  if (!requirements.length) {
    return null;
  }

  const values = requirements.map((requirement) => {
    const insumo = insumosById.get(Number(requirement.insumo_id));
    if (!insumo || Number(requirement.cantidad || 0) <= 0) return 0;
    return roundStock(Number(insumo.stock_actual || 0) / Number(requirement.cantidad || 0));
  });

  return values.length ? roundStock(Math.min(...values)) : 0;
}

function buildRecipeScenarios(recipes) {
  const always = [];
  const conditional = new Map();

  (recipes || []).forEach((recipeRow) => {
    const recipe = normalizeRecipeRow(recipeRow);
    if (recipe.condicion_tipo === CONDITION_TYPES.ALWAYS) {
      always.push(recipe);
      return;
    }
    const key = recipeConditionKey(recipe);
    if (!conditional.has(key)) {
      conditional.set(key, []);
    }
    conditional.get(key).push(recipe);
  });

  if (conditional.size === 0) {
    return [always];
  }

  return Array.from(conditional.values()).map((rows) => [...always, ...rows]);
}

function getProductInventoryStatus(product, context) {
  const normalizedProduct = {
    ...product,
    stock_mode: cleanText(product?.stock_mode) || 'direct',
    stock_directo: roundStock(product?.stock_directo || 0),
  };

  if (normalizedProduct.stock_mode !== 'recipe') {
    return {
      stock_disponible: normalizedProduct.stock_directo,
      stock_texto: `${normalizedProduct.stock_directo}`,
      disponible_para_venta: normalizedProduct.stock_directo > 0,
      receta_activa: false,
      receta_resumen: [],
      receta_completa: true,
    };
  }

  const recipes = context.recipesByProduct.get(Number(normalizedProduct.id)) || [];
  const scenarios = buildRecipeScenarios(recipes);
  const scenarioAvailabilities = scenarios
    .map((requirements) => availabilityFromRequirements(requirements, context.insumosById))
    .filter((value) => value !== null);
  const summary = recipes.map((recipe) => {
    const insumo = context.insumosById.get(Number(recipe.insumo_id));
    return {
      id: recipe.id,
      insumo_id: recipe.insumo_id,
      insumo_nombre: insumo?.nombre || 'Insumo eliminado',
      unidad: insumo?.unidad || 'u',
      cantidad: roundStock(recipe.cantidad || 0),
      condicion_tipo: recipe.condicion_tipo,
      condicion_grupo: recipe.condicion_grupo,
      condicion_valor: recipe.condicion_valor,
    };
  });

  if (!recipes.length) {
    return {
      stock_disponible: 0,
      stock_texto: 'Sin receta',
      disponible_para_venta: false,
      receta_activa: true,
      receta_resumen: summary,
      receta_completa: false,
    };
  }

  const stockDisponible = scenarioAvailabilities.length
    ? roundStock(Math.min(...scenarioAvailabilities))
    : 0;
  const canSellAnyScenario = scenarioAvailabilities.some((value) => Number(value || 0) >= 1);

  return {
    stock_disponible: stockDisponible,
    stock_texto: `${stockDisponible}`,
    disponible_para_venta: canSellAnyScenario,
    receta_activa: true,
    receta_resumen: summary,
    receta_completa: summary.length > 0,
  };
}

function decorateProductsWithInventory(db, products) {
  const context = loadInventoryContext(
    db,
    (products || []).map((product) => product.id)
  );
  return (products || []).map((product) => {
    const status = getProductInventoryStatus(product, context);
    return {
      ...product,
      stock_mode: cleanText(product.stock_mode) || 'direct',
      stock_directo: roundStock(product.stock_directo || 0),
      stock_disponible: status.stock_disponible,
      stock_texto: status.stock_texto,
      disponible_para_venta: status.disponible_para_venta,
      receta_activa: status.receta_activa,
      receta_resumen: status.receta_resumen,
      receta_completa: status.receta_completa,
      stock: status.stock_disponible,
    };
  });
}

function aggregateRecipeRequirementsForItem(item, product, context) {
  const recipes = context.recipesByProduct.get(Number(product.id)) || [];
  const matched = recipes.filter((recipe) => recipeMatchesItem(recipe, item));
  const quantity = roundStock(item?.cantidad || 0);
  const requirementsByInsumo = new Map();

  matched.forEach((recipe) => {
    const insumoId = Number(recipe.insumo_id);
    if (!Number.isFinite(insumoId) || Number(recipe.cantidad || 0) <= 0) return;
    const existing = requirementsByInsumo.get(insumoId) || 0;
    requirementsByInsumo.set(
      insumoId,
      roundStock(existing + Number(recipe.cantidad || 0) * quantity)
    );
  });

  return {
    matched,
    requirements: Array.from(requirementsByInsumo.entries()).map(([insumo_id, cantidad]) => ({
      insumo_id,
      cantidad,
    })),
  };
}

function planInventoryConsumption(db, items) {
  const context = loadInventoryContext(
    db,
    (items || []).map((item) => item.producto_id)
  );
  const directByProduct = new Map();
  const insumosById = new Map();
  const errors = [];
  const movementDrafts = [];

  (items || []).forEach((item, index) => {
    const productId = Number(item?.producto_id);
    const quantity = roundStock(item?.cantidad || 0);
    if (!Number.isFinite(productId) || quantity <= 0) return;

    const product = context.productsById.get(productId);
    if (!product) return;

    if ((cleanText(product.stock_mode) || 'direct') !== 'recipe') {
      const current = directByProduct.get(productId) || 0;
      directByProduct.set(productId, roundStock(current + quantity));
      movementDrafts.push({
        producto_id: productId,
        cantidad: -quantity,
        item_index: index,
        item_nombre: item?.nombre || product.nombre,
        detalle: {
          producto_id: productId,
          producto_nombre: product.nombre,
          cantidad: quantity,
          descripcion: cleanText(item?.descripcion),
        },
      });
      return;
    }

    const recipePlan = aggregateRecipeRequirementsForItem(item, product, context);
    if (!recipePlan.requirements.length) {
      errors.push(
        `Falta configurar la receta de "${product.nombre}" para esta variante o combinación antes de venderla.`
      );
      return;
    }

    recipePlan.requirements.forEach((requirement) => {
      const current = insumosById.get(requirement.insumo_id) || 0;
      insumosById.set(requirement.insumo_id, roundStock(current + requirement.cantidad));
    });

    recipePlan.requirements.forEach((requirement) => {
      const insumo = context.insumosById.get(Number(requirement.insumo_id));
      movementDrafts.push({
        insumo_id: Number(requirement.insumo_id),
        cantidad: -roundStock(requirement.cantidad),
        item_index: index,
        item_nombre: item?.nombre || product.nombre,
        detalle: {
          producto_id: productId,
          producto_nombre: product.nombre,
          insumo_id: Number(requirement.insumo_id),
          insumo_nombre: insumo?.nombre || 'Insumo',
          cantidad: roundStock(requirement.cantidad),
          descripcion: cleanText(item?.descripcion),
          variantes: parseJson(item?.variantes, {}),
          extras: parseJson(item?.extras, []),
        },
      });
    });
  });

  directByProduct.forEach((required, productId) => {
    const product = context.productsById.get(productId);
    if (!product) return;
    if (roundStock(product.stock_directo || 0) < required) {
      errors.push(
        `Stock insuficiente para "${product.nombre}". Disponible: ${roundStock(product.stock_directo || 0)}.`
      );
    }
  });

  insumosById.forEach((required, insumoId) => {
    const insumo = context.insumosById.get(insumoId);
    const available = roundStock(insumo?.stock_actual || 0);
    if (!insumo || available < required) {
      errors.push(
        `Falta stock de "${insumo?.nombre || 'insumo'}". Disponible: ${available} ${insumo?.unidad || 'u'}.`
      );
    }
  });

  return {
    errors,
    directByProduct,
    insumosById,
    movementDrafts,
    context,
  };
}

function insertInventoryMovement(db, payload) {
  const detail =
    payload?.detalle && typeof payload.detalle === 'object'
      ? JSON.stringify(payload.detalle)
      : JSON.stringify({});
  db.prepare(
    `
    INSERT INTO inventario_movimientos (
      insumo_id, producto_id, pedido_id, cantidad, tipo, motivo, detalle
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    payload?.insumo_id || null,
    payload?.producto_id || null,
    payload?.pedido_id || null,
    roundStock(payload?.cantidad || 0),
    cleanText(payload?.tipo) || 'ajuste',
    cleanText(payload?.motivo),
    detail
  );
}

function applyInventoryPlan(db, plan, options = {}) {
  if (plan.errors.length) {
    throw new Error(plan.errors[0]);
  }

  plan.directByProduct.forEach((required, productId) => {
    db.prepare(
      `
      UPDATE productos
      SET stock_directo = ROUND((COALESCE(stock_directo, 0) - ?) * 100) / 100
      WHERE id = ?
    `
    ).run(required, productId);
  });

  plan.insumosById.forEach((required, insumoId) => {
    db.prepare(
      `
      UPDATE inventario_insumos
      SET stock_actual = ROUND((COALESCE(stock_actual, 0) - ?) * 100) / 100,
          actualizado_en = CURRENT_TIMESTAMP
      WHERE id = ?
    `
    ).run(required, insumoId);
  });

  plan.movementDrafts.forEach((movement) => {
    insertInventoryMovement(db, {
      ...movement,
      pedido_id: options?.pedido_id || null,
      tipo: cleanText(options?.tipo) || 'venta',
      motivo: cleanText(options?.motivo) || 'Salida de inventario',
      detalle: {
        ...(movement.detalle || {}),
        ...(options?.detalle_extra || {}),
      },
    });
  });

  return {
    ok: true,
    movements: plan.movementDrafts.length,
  };
}

function applyInventoryToItems(db, items, options = {}) {
  const plan = planInventoryConsumption(db, items);
  return applyInventoryPlan(db, plan, options);
}

function applyInventoryToPedido(db, pedido, options = {}) {
  if (!pedido) {
    throw new Error('Pedido invalido para inventario');
  }

  if (Number(pedido.inventario_aplicado) === 1) {
    return { ok: true, skipped: true };
  }

  const items = loadPedidoItems(db, pedido);
  const result = applyInventoryToItems(db, items, {
    pedido_id: pedido.id,
    tipo: 'venta',
    motivo: options?.motivo || `Salida por pedido #${pedido.numero}`,
    detalle_extra: {
      pedido_id: pedido.id,
      pedido_numero: pedido.numero,
      origen: cleanText(pedido.origen),
    },
  });

  db.prepare(
    `
    UPDATE pedidos
    SET inventario_aplicado = 1,
        inventario_revertido = 0
    WHERE id = ?
  `
  ).run(pedido.id);

  return {
    ok: true,
    movements: Number(result?.movements || 0),
  };
}

function restoreInventoryForPedido(db, pedido, options = {}) {
  if (!pedido) {
    throw new Error('Pedido invalido para reversion de inventario');
  }

  if (Number(pedido.inventario_aplicado) !== 1 || Number(pedido.inventario_revertido) === 1) {
    return { ok: true, skipped: true };
  }

  const movements = db
    .prepare(
      `
    SELECT *
    FROM inventario_movimientos
    WHERE pedido_id = ? AND tipo = 'venta'
    ORDER BY id DESC
  `
    )
    .all(pedido.id);

  movements.forEach((movement) => {
    const delta = roundStock(-Number(movement.cantidad || 0));
    if (movement.producto_id) {
      db.prepare(
        `
        UPDATE productos
        SET stock_directo = ROUND((COALESCE(stock_directo, 0) + ?) * 100) / 100
        WHERE id = ?
      `
      ).run(delta, movement.producto_id);
    }
    if (movement.insumo_id) {
      db.prepare(
        `
        UPDATE inventario_insumos
        SET stock_actual = ROUND((COALESCE(stock_actual, 0) + ?) * 100) / 100,
            actualizado_en = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      ).run(delta, movement.insumo_id);
    }

    insertInventoryMovement(db, {
      insumo_id: movement.insumo_id,
      producto_id: movement.producto_id,
      pedido_id: pedido.id,
      cantidad: delta,
      tipo: 'reversion',
      motivo: options?.motivo || `Reversion por cancelacion pedido #${pedido.numero}`,
      detalle: {
        movimiento_origen_id: movement.id,
        pedido_id: pedido.id,
        pedido_numero: pedido.numero,
      },
    });
  });

  db.prepare(
    `
    UPDATE pedidos
    SET inventario_revertido = 1
    WHERE id = ?
  `
  ).run(pedido.id);

  return {
    ok: true,
    restored: movements.length,
  };
}

function registerManualStockAdjustment(db, product, nextStock, motivo = 'Ajuste manual de stock') {
  const previous = roundStock(product?.stock_directo || 0);
  const updated = roundStock(nextStock || 0);
  const delta = roundStock(updated - previous);

  db.prepare(
    `
    UPDATE productos
    SET stock_directo = ?
    WHERE id = ?
  `
  ).run(updated, product.id);

  if (delta !== 0) {
    insertInventoryMovement(db, {
      producto_id: product.id,
      cantidad: delta,
      tipo: 'ajuste',
      motivo,
      detalle: {
        producto_id: product.id,
        producto_nombre: product.nombre,
        anterior: previous,
        nuevo: updated,
      },
    });
  }
}

module.exports = {
  CONDITION_TYPES,
  cleanText,
  decorateProductsWithInventory,
  getProductInventoryStatus,
  applyInventoryToItems,
  insertInventoryMovement,
  loadInventoryContext,
  parseJson,
  applyInventoryToPedido,
  restoreInventoryForPedido,
  registerManualStockAdjustment,
  roundStock,
};
