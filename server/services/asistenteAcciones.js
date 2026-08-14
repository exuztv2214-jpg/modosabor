const db = require('../db');
const {
  restoreInventoryForPedido,
  insertInventoryMovement,
  registerManualStockAdjustment,
  roundStock,
  CONDITION_TYPES,
} = require('../utils/inventory');
const {
  persistMenuDiaItems,
  loadMenuDiaLibrary,
  createMenuDiaProduct,
  updateMenuDiaProduct,
  archiveMenuDiaProduct,
} = require('../routes/operacion');
const { registrarCompra } = require('../routes/compras');
const { resolveInitialPagoEstado } = require('../utils/paymentStatus');
const { emitNuevoPedido, emitPedidoActualizado } = require('../utils/socketRooms');
const { buildPedidoPayload, createPedidoWithInventory, hydratePedido } = require('./pedidoService');
const marketingService = require('./marketingService');

/**
 * Lo que el asistente puede MODIFICAR.
 *
 * ── Vive aparte a propósito ────────────────────────────────────────────────
 *
 * Las consultas están en `asistenteHerramientas.js`. Esto es otro archivo, y
 * la separación no es de orden: es para que sea difícil equivocarse. Nadie
 * agrega por accidente algo que escribe en la base creyendo que sólo lee.
 *
 * ── Proponer y confirmar ───────────────────────────────────────────────────
 *
 * Ninguna de estas acciones se ejecuta cuando el modelo la pide. El modelo
 * propone, el servidor arma un resumen en castellano de lo que va a pasar, y
 * eso se le muestra al usuario. Recién si toca confirmar, se ejecuta.
 *
 * Cada acción tiene dos partes:
 *   `preparar(args)` → valida contra la base y devuelve el resumen. No escribe.
 *   `ejecutar(args, contexto)` → hace el cambio. Vuelve a validar.
 */

const CENTAVOS = 100;

function aCentavos(pesos) {
  return Math.round(Number(pesos || 0) * CENTAVOS);
}

function aPesos(centavos) {
  return Math.round(Number(centavos || 0)) / CENTAVOS;
}

function pesos(centavos) {
  return `$${(Number(centavos || 0) / CENTAVOS).toLocaleString('es-AR')}`;
}

/** Un error que el asistente puede contarle al usuario tal cual. */
class ErrorDeAccion extends Error {}

function buscarUnico(filas, termino, queEs) {
  if (filas.length === 1) return filas[0];
  if (filas.length === 0) {
    throw new ErrorDeAccion(`No encontré ningún ${queEs} que se llame "${termino}".`);
  }
  const nombres = filas.map((f) => f.nombre).join(', ');
  throw new ErrorDeAccion(
    `Hay varios que coinciden con "${termino}": ${nombres}. Decime cuál exactamente.`
  );
}

function buscarInsumo(nombre) {
  const termino = String(nombre || '').trim();
  if (!termino) throw new ErrorDeAccion('Decime el nombre del insumo.');

  const exacto = db
    .prepare('SELECT * FROM inventario_insumos WHERE activo = 1 AND LOWER(nombre) = LOWER(?)')
    .all(termino);
  if (exacto.length === 1) return exacto[0];

  const parciales = db
    .prepare('SELECT * FROM inventario_insumos WHERE activo = 1 AND nombre LIKE ? LIMIT 10')
    .all(`%${termino}%`);
  return buscarUnico(parciales, termino, 'insumo');
}

function buscarProducto(nombre) {
  const termino = String(nombre || '').trim();
  if (!termino) throw new ErrorDeAccion('Decime el nombre del producto.');

  const exacto = db.prepare('SELECT * FROM productos WHERE LOWER(nombre) = LOWER(?)').all(termino);
  if (exacto.length === 1) return exacto[0];

  const parciales = db
    .prepare('SELECT * FROM productos WHERE nombre LIKE ? LIMIT 10')
    .all(`%${termino}%`);
  return buscarUnico(parciales, termino, 'producto');
}

function buscarPedidoPorNumero(numero) {
  const termino = String(numero || '').trim();
  if (!termino) throw new ErrorDeAccion('Decime el número del pedido.');

  const pedido = db.prepare('SELECT * FROM pedidos WHERE numero = ?').get(termino);
  if (!pedido) {
    const porId = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(Number(termino) || 0);
    if (!porId) throw new ErrorDeAccion(`No encontré ningún pedido con número "${termino}".`);
    return porId;
  }
  return pedido;
}

// ── Stock ───────────────────────────────────────────────────────────────────

function prepararStock(args = {}) {
  const insumo = buscarInsumo(args.insumo);
  const cantidad = roundStock(args.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw new ErrorDeAccion('La cantidad tiene que ser un número mayor que cero.');
  }

  const operacion = String(args.operacion || 'sumar').toLowerCase();
  const actual = roundStock(insumo.stock_actual);

  let nuevo;
  if (operacion === 'fijar') nuevo = cantidad;
  else if (operacion === 'restar') nuevo = roundStock(actual - cantidad);
  else nuevo = roundStock(actual + cantidad);

  if (nuevo < 0) {
    throw new ErrorDeAccion(
      `No puedo: ${insumo.nombre} tiene ${actual} ${insumo.unidad} y quedaría en negativo.`
    );
  }

  return {
    resumen: `Cambiar el stock de ${insumo.nombre}: de ${actual} a ${nuevo} ${insumo.unidad}.`,
    detalles: [
      { etiqueta: 'Insumo', valor: insumo.nombre },
      { etiqueta: 'Stock actual', valor: `${actual} ${insumo.unidad}` },
      { etiqueta: 'Queda en', valor: `${nuevo} ${insumo.unidad}` },
      { etiqueta: 'Motivo', valor: String(args.motivo || 'Cargado desde el asistente') },
    ],
    argumentosResueltos: {
      insumo_id: insumo.id,
      nuevo,
      motivo: String(args.motivo || 'Cargado desde el asistente'),
    },
  };
}

function ejecutarStock(argumentos) {
  const insumo = db
    .prepare('SELECT * FROM inventario_insumos WHERE id = ?')
    .get(argumentos.insumo_id);
  if (!insumo) throw new ErrorDeAccion('El insumo ya no existe.');

  const anterior = roundStock(insumo.stock_actual);
  const nuevo = roundStock(argumentos.nuevo);
  if (nuevo < 0) throw new ErrorDeAccion('El movimiento deja el stock en negativo.');

  const aplicar = db.transaction(() => {
    db.prepare(
      'UPDATE inventario_insumos SET stock_actual = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(nuevo, insumo.id);
    insertInventoryMovement(db, {
      insumo_id: insumo.id,
      cantidad: roundStock(nuevo - anterior),
      tipo: nuevo >= anterior ? 'entrada' : 'salida',
      motivo: argumentos.motivo,
      detalle: { insumo_nombre: insumo.nombre, anterior, nuevo, origen: 'asistente' },
    });
  });
  aplicar();

  return `Listo. ${insumo.nombre} quedó en ${nuevo} ${insumo.unidad}.`;
}

function prepararStockProducto(args = {}) {
  const producto = buscarProducto(args.producto);
  if (String(producto.stock_mode || 'direct') === 'recipe') {
    throw new ErrorDeAccion(
      `${producto.nombre} usa stock por receta. Ajustá sus insumos o cambiá la receta.`
    );
  }
  const cantidad = roundStock(args.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw new ErrorDeAccion('La cantidad tiene que ser un número mayor que cero.');
  }
  const operacion = String(args.operacion || 'sumar').toLowerCase();
  const actual = roundStock(producto.stock_directo || 0);
  const nuevo =
    operacion === 'fijar'
      ? cantidad
      : operacion === 'restar'
        ? roundStock(actual - cantidad)
        : roundStock(actual + cantidad);
  if (nuevo < 0) {
    throw new ErrorDeAccion(
      `No puedo: ${producto.nombre} tiene ${actual} unidades y quedaría en negativo.`
    );
  }
  return {
    resumen: `Cambiar el stock directo de ${producto.nombre}: de ${actual} a ${nuevo} unidades.`,
    detalles: [
      { etiqueta: 'Producto', valor: producto.nombre },
      { etiqueta: 'Stock actual', valor: `${actual} unidades` },
      { etiqueta: 'Queda en', valor: `${nuevo} unidades` },
      { etiqueta: 'Motivo', valor: String(args.motivo || 'Cargado desde el asistente') },
    ],
    argumentosResueltos: {
      producto_id: producto.id,
      nuevo,
      motivo: String(args.motivo || 'Cargado desde el asistente'),
    },
  };
}

function ejecutarStockProducto(argumentos) {
  const producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(argumentos.producto_id);
  if (!producto) throw new ErrorDeAccion('El producto ya no existe.');
  if (String(producto.stock_mode || 'direct') === 'recipe') {
    throw new ErrorDeAccion('El producto ahora usa stock por receta. Ajustá sus insumos.');
  }
  registerManualStockAdjustment(db, producto, argumentos.nuevo, argumentos.motivo);
  return `Listo. ${producto.nombre} quedó en ${roundStock(argumentos.nuevo)} unidades.`;
}

// ── Recetas ────────────────────────────────────────────────────────────────

function prepararReceta(args = {}) {
  const producto = buscarProducto(args.producto);
  const lineas = Array.isArray(args.ingredientes) ? args.ingredientes : [];
  if (!lineas.length) {
    throw new ErrorDeAccion('La receta necesita al menos un ingrediente.');
  }

  const resueltas = lineas.map((linea, orden) => {
    const insumo = buscarInsumo(linea?.insumo);
    const cantidad = roundStock(linea?.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new ErrorDeAccion(`La cantidad de ${insumo.nombre} tiene que ser mayor que cero.`);
    }
    const condicionTipo = String(linea?.condicion_tipo || CONDITION_TYPES.ALWAYS).toLowerCase();
    const condicionGrupo = String(linea?.condicion_grupo || '').trim();
    const condicionValor = String(linea?.condicion_valor || '').trim();
    if (!Object.values(CONDITION_TYPES).includes(condicionTipo)) {
      throw new ErrorDeAccion(`La condición de ${insumo.nombre} no es válida.`);
    }
    if (condicionTipo === CONDITION_TYPES.VARIANT && (!condicionGrupo || !condicionValor)) {
      throw new ErrorDeAccion(`Para la variante de ${insumo.nombre} faltan el grupo y la opción.`);
    }
    if (condicionTipo === CONDITION_TYPES.EXTRA && !condicionValor) {
      throw new ErrorDeAccion(`Para el extra de ${insumo.nombre} falta el nombre del extra.`);
    }
    return {
      insumo_id: insumo.id,
      insumo_nombre: insumo.nombre,
      unidad: insumo.unidad,
      cantidad,
      condicion_tipo: condicionTipo,
      condicion_grupo: condicionGrupo,
      condicion_valor: condicionValor,
      orden,
    };
  });

  return {
    resumen: `Reemplazar la receta completa de ${producto.nombre} con ${resueltas.length} ingredientes.`,
    detalles: resueltas.map((linea) => ({
      etiqueta: linea.insumo_nombre,
      valor: `${linea.cantidad} ${linea.unidad}${
        linea.condicion_tipo === CONDITION_TYPES.ALWAYS
          ? ''
          : ` · ${linea.condicion_tipo}: ${linea.condicion_grupo || linea.condicion_valor}${
              linea.condicion_grupo ? ` = ${linea.condicion_valor}` : ''
            }`
      }`,
    })),
    advertencia:
      'Esta acción reemplaza toda la receta actual y cambia el producto a stock por receta.',
    argumentosResueltos: {
      producto_id: producto.id,
      ingredientes: resueltas.map(({ insumo_nombre, unidad, ...linea }) => linea),
    },
  };
}

function ejecutarReceta(argumentos) {
  const producto = db.prepare('SELECT * FROM productos WHERE id = ?').get(argumentos.producto_id);
  if (!producto) throw new ErrorDeAccion('El producto ya no existe.');
  const ingredientes = Array.isArray(argumentos.ingredientes) ? argumentos.ingredientes : [];
  if (!ingredientes.length) throw new ErrorDeAccion('La receta quedó vacía.');

  const guardar = db.transaction(() => {
    const ids = ingredientes.map((linea) => Number(linea.insumo_id));
    const existentes = db
      .prepare(`SELECT id FROM inventario_insumos WHERE id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids);
    if (new Set(existentes.map((fila) => Number(fila.id))).size !== new Set(ids).size) {
      throw new ErrorDeAccion('Uno de los insumos ya no existe.');
    }
    db.prepare('DELETE FROM inventario_recetas WHERE producto_id = ?').run(producto.id);
    const insertar = db.prepare(
      `INSERT INTO inventario_recetas
       (producto_id, insumo_id, cantidad, condicion_tipo, condicion_grupo, condicion_valor, orden)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    ingredientes.forEach((linea, orden) => {
      insertar.run(
        producto.id,
        linea.insumo_id,
        roundStock(linea.cantidad),
        linea.condicion_tipo,
        linea.condicion_grupo || '',
        linea.condicion_valor || '',
        Number(linea.orden ?? orden)
      );
    });
    db.prepare("UPDATE productos SET stock_mode = 'recipe' WHERE id = ?").run(producto.id);
  });
  guardar();
  return `Receta de ${producto.nombre} guardada con ${ingredientes.length} ingredientes.`;
}

// ── Promos ──────────────────────────────────────────────────────────────────

const TIPOS_PROMO = {
  porcentaje: 'porcentaje',
  descuento_fijo: 'descuento_fijo',
  envio_gratis: 'envio_gratis',
  combo_especial: 'combo_especial',
  promo_producto: 'promo_producto',
};

function prepararPromo(args = {}) {
  const nombre = String(args.nombre || '').trim();
  if (!nombre) throw new ErrorDeAccion('La promo necesita un nombre.');

  const tipo = TIPOS_PROMO[String(args.tipo || 'porcentaje').toLowerCase()];
  if (!tipo) {
    throw new ErrorDeAccion(
      `Ese tipo de promo no existe. Puede ser: ${Object.keys(TIPOS_PROMO).join(', ')}.`
    );
  }

  const valor = Number(args.valor || 0);
  if (tipo === 'porcentaje' && (valor <= 0 || valor > 100)) {
    throw new ErrorDeAccion('Un descuento por porcentaje tiene que estar entre 1 y 100.');
  }

  let producto = null;
  if (args.producto) producto = buscarProducto(args.producto);

  const detalles = [
    { etiqueta: 'Nombre', valor: nombre },
    { etiqueta: 'Tipo', valor: tipo.replace('_', ' ') },
  ];
  if (tipo === 'porcentaje') detalles.push({ etiqueta: 'Descuento', valor: `${valor}%` });
  else if (tipo === 'descuento_fijo') {
    detalles.push({ etiqueta: 'Descuento', valor: pesos(aCentavos(valor)) });
  }
  if (producto) detalles.push({ etiqueta: 'Producto', valor: producto.nombre });
  if (args.desde) detalles.push({ etiqueta: 'Desde', valor: String(args.desde) });
  if (args.hasta) detalles.push({ etiqueta: 'Hasta', valor: String(args.hasta) });

  return {
    resumen: `Crear la promo "${nombre}".`,
    detalles,
    argumentosResueltos: {
      nombre,
      descripcion: String(args.descripcion || ''),
      tipo_promo: tipo,
      valor: tipo === 'descuento_fijo' ? aCentavos(valor) : valor,
      fecha_inicio: String(args.desde || ''),
      fecha_fin: String(args.hasta || ''),
      producto_id: producto?.id ?? null,
      canal_sugerido: String(args.canal || 'general'),
      activa: true,
    },
  };
}

function ejecutarPromo(argumentos) {
  const creada = marketingService.createPromo(argumentos);
  return `Promo "${creada.nombre}" creada. La ves en Marketing.`;
}

// ── Menú del día ────────────────────────────────────────────────────────────

function prepararMenuDia(args = {}) {
  const pedidos = Array.isArray(args.platos) ? args.platos : [];
  if (!pedidos.length) throw new ErrorDeAccion('Decime qué platos van en el menú del día.');

  const biblioteca = loadMenuDiaLibrary();
  const resueltos = pedidos.map((plato) => {
    const nombre = String(plato?.nombre || plato || '').trim();
    if (!nombre) throw new ErrorDeAccion('Uno de los platos vino sin nombre.');

    const enBiblioteca = biblioteca.filter((p) =>
      String(p.nombre || '')
        .toLowerCase()
        .includes(nombre.toLowerCase())
    );
    const producto =
      enBiblioteca.length === 1 ? enBiblioteca[0] : buscarUnico(enBiblioteca, nombre, 'plato');

    const precioPesos = Number(plato?.precio ?? args.precio ?? 0);
    return {
      id: producto.id,
      nombre: producto.nombre,
      precio: precioPesos > 0 ? aCentavos(precioPesos) : producto.precio,
      stock: roundStock(plato?.stock ?? args.stock ?? producto.stock_directo ?? 0),
    };
  });

  return {
    resumen: `Armar el menú de hoy con ${resueltos.length} ${resueltos.length === 1 ? 'plato' : 'platos'}.`,
    detalles: resueltos.map((p) => ({
      etiqueta: p.nombre,
      valor: `${pesos(p.precio)} · stock ${p.stock}`,
    })),
    advertencia:
      'Los platos que no estén en esta lista quedan fuera del menú de hoy. Si querías sumar uno a los que ya había, decímelos todos juntos.',
    argumentosResueltos: { platos: resueltos },
  };
}

function ejecutarMenuDia(argumentos) {
  const items = argumentos.platos.map((p, indice) => ({
    id: p.id,
    disponible_hoy: 1,
    precio_hoy: p.precio,
    stock_hoy: p.stock,
    orden_hoy: indice,
  }));
  persistMenuDiaItems(items);
  return `Menú del día armado con ${items.length} ${items.length === 1 ? 'plato' : 'platos'}.`;
}

function prepararNuevoPlatoMenuDia(args = {}) {
  const nombre = String(args.nombre || '').trim();
  if (!nombre) throw new ErrorDeAccion('Decime el nombre del plato.');
  const duplicado = loadMenuDiaLibrary().find(
    (plato) =>
      String(plato.nombre || '')
        .trim()
        .toLowerCase() === nombre.toLowerCase()
  );
  if (duplicado) {
    throw new ErrorDeAccion(
      `${duplicado.nombre} ya existe en la biblioteca. Usá la acción de armar el menú para activarlo.`
    );
  }
  const precio = Number(args.precio || 0);
  const stock = roundStock(args.stock || 0);
  if (!Number.isFinite(precio) || precio <= 0) {
    throw new ErrorDeAccion('El plato necesita un precio mayor que cero.');
  }
  if (!Number.isFinite(stock) || stock < 0) {
    throw new ErrorDeAccion('El stock no puede ser negativo.');
  }
  const tipo = args.tipo === 'ejecutivo' ? 'ejecutivo' : 'economico';
  const guarniciones = Array.isArray(args.guarniciones)
    ? args.guarniciones.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  return {
    resumen: `Crear y activar ${nombre} en el menú del día.`,
    detalles: [
      { etiqueta: 'Plato', valor: nombre },
      { etiqueta: 'Tipo', valor: tipo },
      { etiqueta: 'Precio', valor: `$${precio.toLocaleString('es-AR')}` },
      { etiqueta: 'Stock inicial', valor: String(stock) },
      { etiqueta: 'Guarniciones', valor: guarniciones.join(', ') || 'Sin guarniciones' },
    ],
    argumentosResueltos: {
      nombre,
      descripcion: String(args.descripcion || 'Menú del día.').trim(),
      tipo,
      precio: aCentavos(precio),
      stock_directo: stock,
      tiempo_preparacion: Math.max(1, Number(args.tiempo_preparacion || 15)),
      guarniciones,
      ofrece_postre: args.ofrece_postre === true ? 1 : 0,
      ofrece_bebida_postre: args.ofrece_bebida_postre === true ? 1 : 0,
    },
  };
}

function ejecutarNuevoPlatoMenuDia(argumentos) {
  let resultado;
  try {
    resultado = createMenuDiaProduct(argumentos);
  } catch (error) {
    throw new ErrorDeAccion(String(error?.message || 'No se pudo crear el plato.'));
  }
  return `${resultado.created.nombre} fue creado y quedó activo en el menú del día con stock ${roundStock(
    resultado.created.stock_directo
  )}.`;
}

function buscarPlatoMenuDia(nombre) {
  const termino = String(nombre || '').trim();
  if (!termino) throw new ErrorDeAccion('Decime el nombre del plato del menú del día.');
  const biblioteca = loadMenuDiaLibrary();
  const exactos = biblioteca.filter(
    (plato) => String(plato.nombre || '').toLowerCase() === termino.toLowerCase()
  );
  if (exactos.length === 1) return exactos[0];
  const parciales = biblioteca.filter((plato) =>
    String(plato.nombre || '')
      .toLowerCase()
      .includes(termino.toLowerCase())
  );
  return buscarUnico(parciales, termino, 'plato del menú del día');
}

function prepararEditarPlatoMenuDia(args = {}) {
  const plato = buscarPlatoMenuDia(args.plato);
  const cambios = {};
  const detalles = [];
  const agregar = (etiqueta, antes, despues) => {
    if (antes !== despues) detalles.push({ etiqueta, valor: `${antes} → ${despues}` });
  };

  if (args.nombre !== undefined) {
    const nombre = String(args.nombre || '').trim();
    if (!nombre) throw new ErrorDeAccion('El nombre no puede quedar vacío.');
    cambios.nombre = nombre;
    agregar('Nombre', plato.nombre, nombre);
  }
  if (args.descripcion !== undefined) {
    cambios.descripcion_hoy = String(args.descripcion || '').trim();
    agregar(
      'Descripción',
      plato.descripcion || 'Sin descripción',
      cambios.descripcion_hoy || 'Sin descripción'
    );
  }
  if (args.precio !== undefined) {
    const precio = Number(args.precio);
    if (!Number.isFinite(precio) || precio <= 0) {
      throw new ErrorDeAccion('El precio tiene que ser mayor que cero.');
    }
    cambios.precio_hoy = aCentavos(precio);
    agregar('Precio', pesos(plato.precio), pesos(cambios.precio_hoy));
  }
  if (args.stock !== undefined) {
    const stock = roundStock(args.stock);
    if (!Number.isFinite(stock) || stock < 0) {
      throw new ErrorDeAccion('El stock no puede ser negativo.');
    }
    cambios.stock_hoy = stock;
    agregar('Stock de hoy', String(roundStock(plato.stock_directo)), String(stock));
  }
  if (args.tipo !== undefined) {
    cambios.tipo_hoy = args.tipo === 'ejecutivo' ? 'ejecutivo' : 'economico';
    agregar('Tipo', plato.menu_dia_tipo || 'economico', cambios.tipo_hoy);
  }
  if (args.tiempo_preparacion !== undefined) {
    const tiempo = Math.max(1, Number(args.tiempo_preparacion));
    if (!Number.isFinite(tiempo)) throw new ErrorDeAccion('El tiempo de preparación no es válido.');
    cambios.tiempo_preparacion = roundStock(tiempo);
    agregar(
      'Preparación',
      `${plato.tiempo_preparacion || 15} min`,
      `${cambios.tiempo_preparacion} min`
    );
  }
  if (args.guarniciones !== undefined) {
    if (!Array.isArray(args.guarniciones)) {
      throw new ErrorDeAccion('Las guarniciones tienen que ser una lista.');
    }
    cambios.guarniciones_hoy = args.guarniciones
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    detalles.push({
      etiqueta: 'Guarniciones',
      valor: cambios.guarniciones_hoy.join(', ') || 'Sin guarniciones',
    });
  }
  ['ofrece_postre', 'ofrece_bebida_postre', 'destacado', 'activo_hoy'].forEach((campo) => {
    if (args[campo] === undefined) return;
    const destino = {
      ofrece_postre: 'ofrece_postre_hoy',
      ofrece_bebida_postre: 'ofrece_bebida_postre_hoy',
      destacado: 'destacado_hoy',
      activo_hoy: 'disponible_hoy',
    }[campo];
    cambios[destino] = args[campo] === true ? 1 : 0;
    const etiqueta = {
      ofrece_postre: 'Postre',
      ofrece_bebida_postre: 'Bebida + postre',
      destacado: 'Destacado',
      activo_hoy: 'Disponible hoy',
    }[campo];
    detalles.push({ etiqueta, valor: cambios[destino] ? 'Sí' : 'No' });
  });
  if (!Object.keys(cambios).length) {
    throw new ErrorDeAccion('Decime qué querés modificar del plato.');
  }
  return {
    resumen: `Editar ${plato.nombre} en la biblioteca y menú del día.`,
    detalles,
    advertencia:
      'El cambio se aplica al plato y a su configuración de hoy. Activar o desactivar no borra el historial.',
    argumentosResueltos: { producto_id: plato.id, ...cambios },
  };
}

function ejecutarEditarPlatoMenuDia(argumentos) {
  let actualizado;
  try {
    actualizado = updateMenuDiaProduct(argumentos.producto_id, argumentos);
  } catch (error) {
    throw new ErrorDeAccion(String(error?.message || 'No se pudo editar el plato.'));
  }
  return `${actualizado.nombre} fue actualizado${actualizado.disponible_hoy ? ' y está activo hoy' : ' y quedó desactivado hoy'}.`;
}

function prepararArchivarPlatoMenuDia(args = {}) {
  const plato = buscarPlatoMenuDia(args.plato);
  return {
    resumen: `Archivar ${plato.nombre} de la biblioteca del menú del día.`,
    detalles: [
      { etiqueta: 'Plato', valor: plato.nombre },
      { etiqueta: 'Estado actual', valor: plato.activo ? 'Activo' : 'Ya archivado' },
    ],
    advertencia:
      'Deja de aparecer para vender y se desactiva hoy. No borra ventas, pedidos ni historial.',
    argumentosResueltos: { producto_id: plato.id },
  };
}

function ejecutarArchivarPlatoMenuDia(argumentos) {
  let archivado;
  try {
    archivado = archiveMenuDiaProduct(argumentos.producto_id);
  } catch (error) {
    throw new ErrorDeAccion(String(error?.message || 'No se pudo archivar el plato.'));
  }
  return `${archivado.nombre} fue archivado. Sus ventas e historial se conservan.`;
}

// ── Compras ─────────────────────────────────────────────────────────────────

function prepararCompra(args = {}) {
  const items = Array.isArray(args.items) ? args.items : [];
  if (!items.length) throw new ErrorDeAccion('Decime qué compraste.');

  const resueltos = items.map((item) => {
    const insumo = buscarInsumo(item?.insumo);
    const cantidad = roundStock(item?.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new ErrorDeAccion(`La cantidad de ${insumo.nombre} tiene que ser mayor que cero.`);
    }

    const costoUnitario = Number(item?.costo_unitario || 0);
    if (costoUnitario < 0) throw new ErrorDeAccion('El costo no puede ser negativo.');

    return {
      insumo_id: insumo.id,
      nombre: insumo.nombre,
      unidad: insumo.unidad,
      stockAnterior: roundStock(insumo.stock_actual),
      cantidad,
      costoUnitarioCentavos: aCentavos(costoUnitario),
      subtotalCentavos: aCentavos(costoUnitario * cantidad),
    };
  });

  const totalCentavos = resueltos.reduce((suma, i) => suma + i.subtotalCentavos, 0);
  const proveedor = String(args.proveedor || '').trim();

  const detalles = resueltos.map((i) => ({
    etiqueta: `${i.nombre} · ${i.cantidad} ${i.unidad}`,
    valor: `${pesos(i.costoUnitarioCentavos)} c/u = ${pesos(i.subtotalCentavos)}`,
  }));
  detalles.push({ etiqueta: 'Total', valor: pesos(totalCentavos) });
  if (proveedor) detalles.push({ etiqueta: 'Proveedor', valor: proveedor });
  detalles.push({ etiqueta: 'Pago', valor: String(args.metodo_pago || 'efectivo') });

  return {
    resumen: `Registrar una compra de ${pesos(totalCentavos)}${proveedor ? ` a ${proveedor}` : ''}.`,
    detalles,
    advertencia: `Suma el stock de ${resueltos.length === 1 ? 'ese insumo' : 'esos insumos'} y actualiza su costo al de esta compra.`,
    argumentosResueltos: {
      proveedor,
      metodo_pago: String(args.metodo_pago || 'efectivo'),
      notas: String(args.notas || 'Cargada desde el asistente'),
      total: totalCentavos,
      items: resueltos.map((i) => ({
        insumo_id: i.insumo_id,
        cantidad: i.cantidad,
        costo_unitario: i.costoUnitarioCentavos,
      })),
    },
  };
}

function ejecutarCompra(argumentos, contexto = {}) {
  const compraId = registrarCompra(argumentos, {
    actor_id: contexto.actorId ?? null,
    actor_nombre: contexto.actorNombre || 'Asistente',
  });
  return `Compra #${compraId} registrada. El stock quedó actualizado.`;
}

// ── Pedidos ─────────────────────────────────────────────────────────────────

const ORIGEN_ASISTENTE = 'whatsapp';

function armarCuerpoDePedido(args = {}, itemsResueltos) {
  const solicitado = String(args.tipo_entrega || 'delivery').toLowerCase();
  const tipoEntrega = solicitado === 'retira' || solicitado === 'retiro' ? 'retiro' : 'delivery';
  return {
    origen: ORIGEN_ASISTENTE,
    tipo_entrega: tipoEntrega,
    cliente_nombre: String(args.cliente_nombre || '').trim(),
    cliente_telefono: String(args.cliente_telefono || '').trim(),
    cliente_direccion: tipoEntrega === 'delivery' ? String(args.direccion || '').trim() : '',
    metodo_pago: String(args.metodo_pago || '').trim(),
    notas: String(args.notas || '').trim(),
    items: itemsResueltos.map((i) => ({
      producto_id: i.producto_id,
      cantidad: i.cantidad,
      variantes: i.variantes,
      extras: i.extras,
    })),
  };
}

async function prepararPedido(args = {}) {
  const pedidos = Array.isArray(args.items) ? args.items : [];
  if (!pedidos.length) throw new ErrorDeAccion('Decime qué productos lleva el pedido.');

  const nombre = String(args.cliente_nombre || '').trim();
  if (!nombre) throw new ErrorDeAccion('Decime a nombre de quién va el pedido.');

  const solicitado = String(args.tipo_entrega || 'delivery').toLowerCase();
  const tipoEntrega = solicitado === 'retira' || solicitado === 'retiro' ? 'retiro' : 'delivery';
  if (tipoEntrega === 'delivery' && !String(args.direccion || '').trim()) {
    throw new ErrorDeAccion('Para un delivery necesito la dirección.');
  }

  const itemsResueltos = pedidos.map((item) => {
    const producto = buscarProducto(item?.producto);
    const cantidad = Math.max(1, Math.round(Number(item?.cantidad || 1)));
    return {
      producto_id: producto.id,
      nombre: producto.nombre,
      cantidad,
      variantes: item?.variantes || {},
      extras: Array.isArray(item?.extras) ? item.extras : [],
    };
  });

  const cuerpo = armarCuerpoDePedido(args, itemsResueltos);
  let calculado;
  try {
    calculado = await buildPedidoPayload(cuerpo);
  } catch (error) {
    throw new ErrorDeAccion(String(error?.message || 'No pude armar el pedido.'));
  }

  const detalles = itemsResueltos.map((i) => ({
    etiqueta: `${i.cantidad} × ${i.nombre}`,
    valor: '',
  }));
  detalles.push({ etiqueta: 'Cliente', valor: nombre });
  if (args.cliente_telefono) {
    detalles.push({ etiqueta: 'Teléfono', valor: String(args.cliente_telefono) });
  }
  detalles.push({
    etiqueta: 'Entrega',
    valor: tipoEntrega === 'delivery' ? `Delivery a ${args.direccion}` : 'Retira en el local',
  });
  detalles.push({ etiqueta: 'Subtotal', valor: pesos(calculado.subtotal) });
  if (Number(calculado.costo_envio || 0) > 0) {
    detalles.push({ etiqueta: 'Envío', valor: pesos(calculado.costo_envio) });
  }
  detalles.push({ etiqueta: 'Total', valor: pesos(calculado.total) });
  detalles.push({ etiqueta: 'Pago', valor: String(args.metodo_pago || 'sin especificar') });

  return {
    resumen: `Cargar un pedido de ${pesos(calculado.total)} para ${nombre}.`,
    detalles,
    advertencia: String(args.metodo_pago || '').trim()
      ? ''
      : 'No aclaraste la forma de pago. Se puede cargar igual y corregirla después, pero mientras tanto la caja no va a cuadrar.',
    argumentosResueltos: { cuerpo },
  };
}

async function ejecutarPedido(argumentos, contexto = {}) {
  const normalizado = await buildPedidoPayload(argumentos.cuerpo);
  const pedido = createPedidoWithInventory({
    ...normalizado,
    pago_estado: resolveInitialPagoEstado({
      metodoPago: normalizado.metodo_pago,
      origen: normalizado.origen,
      tipoEntrega: normalizado.tipo_entrega,
    }),
  });

  const io = contexto.io;
  if (io) {
    const hidratado = hydratePedido(pedido);
    emitNuevoPedido(io, hidratado);
    emitPedidoActualizado(io, hidratado);
  }

  return `Pedido #${pedido.numero} cargado. Ya está en cocina.`;
}

// ═════════════════════════════════════════════════════════════════════════════
// ACCIONES DE REPARACIÓN (nuevas)
// ═════════════════════════════════════════════════════════════════════════════

// ── Cancelar pedido colgado ─────────────────────────────────────────────────

function prepararCancelarPedido(args = {}) {
  const pedido = buscarPedidoPorNumero(args.pedido);

  if (pedido.estado === 'cancelado') {
    throw new ErrorDeAccion(`El pedido #${pedido.numero} ya está cancelado.`);
  }
  if (pedido.estado === 'entregado') {
    throw new ErrorDeAccion(
      `No se puede cancelar el pedido #${pedido.numero} porque ya fue entregado.`
    );
  }

  const motivo = String(args.motivo || 'Cancelado desde el asistente').trim();

  return {
    resumen: `Cancelar el pedido #${pedido.numero} de ${pedido.cliente_nombre || '—'} ($${aPesos(pedido.total)}).`,
    detalles: [
      { etiqueta: 'Pedido', valor: `#${pedido.numero}` },
      { etiqueta: 'Cliente', valor: pedido.cliente_nombre || '—' },
      { etiqueta: 'Estado actual', valor: pedido.estado },
      { etiqueta: 'Total', valor: `$${aPesos(pedido.total)}` },
      { etiqueta: 'Motivo', valor: motivo },
    ],
    advertencia: 'Se va a restaurar el stock de los productos del pedido.',
    argumentosResueltos: {
      pedido_id: pedido.id,
      numero: pedido.numero,
      motivo,
    },
  };
}

function ejecutarCancelarPedido(argumentos, contexto = {}) {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(argumentos.pedido_id);
  if (!pedido) throw new ErrorDeAccion('El pedido ya no existe.');
  if (pedido.estado === 'cancelado') throw new ErrorDeAccion('El pedido ya está cancelado.');
  if (pedido.estado === 'entregado') {
    throw new ErrorDeAccion('No se puede cancelar un pedido entregado.');
  }

  const aplicar = db.transaction(() => {
    db.prepare(
      `UPDATE pedidos SET estado = 'cancelado', actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(pedido.id);
    restoreInventoryForPedido(db, pedido, { motivo: argumentos.motivo });
  });
  aplicar();

  const io = contexto.io;
  if (io) {
    const actualizado = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido.id);
    emitPedidoActualizado(io, hydratePedido(actualizado));
  }

  return `Pedido #${pedido.numero} cancelado. El stock fue restaurado.`;
}

// ── Ajustar stock negativo ──────────────────────────────────────────────────

function prepararAjustarStockNegativo(args = {}) {
  const insumo = buscarInsumo(args.insumo);
  const actual = roundStock(insumo.stock_actual);

  if (actual >= 0) {
    throw new ErrorDeAccion(
      `${insumo.nombre} no tiene stock negativo (tiene ${actual} ${insumo.unidad}).`
    );
  }

  const motivo = String(args.motivo || 'Ajuste desde el asistente (stock negativo)').trim();

  return {
    resumen: `Ajustar el stock de ${insumo.nombre}: de ${actual} a 0 ${insumo.unidad}.`,
    detalles: [
      { etiqueta: 'Insumo', valor: insumo.nombre },
      { etiqueta: 'Stock actual', valor: `${actual} ${insumo.unidad}` },
      { etiqueta: 'Queda en', valor: `0 ${insumo.unidad}` },
      { etiqueta: 'Motivo', valor: motivo },
    ],
    argumentosResueltos: {
      insumo_id: insumo.id,
      nombre: insumo.nombre,
      anterior: actual,
      motivo,
    },
  };
}

function ejecutarAjustarStockNegativo(argumentos) {
  const insumo = db
    .prepare('SELECT * FROM inventario_insumos WHERE id = ?')
    .get(argumentos.insumo_id);
  if (!insumo) throw new ErrorDeAccion('El insumo ya no existe.');

  const anterior = roundStock(insumo.stock_actual);
  if (anterior >= 0) throw new ErrorDeAccion('El insumo ya no tiene stock negativo.');

  const aplicar = db.transaction(() => {
    db.prepare(
      'UPDATE inventario_insumos SET stock_actual = 0, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(insumo.id);

    insertInventoryMovement(db, {
      insumo_id: insumo.id,
      cantidad: roundStock(0 - anterior),
      tipo: 'ajuste',
      motivo: argumentos.motivo,
      detalle: { insumo_nombre: insumo.nombre, anterior, nuevo: 0, origen: 'asistente_reparacion' },
    });
  });
  aplicar();

  return `Listo. ${insumo.nombre} quedó en 0 ${insumo.unidad} (estaba en ${anterior}).`;
}

// ── Marcar pedido como pagado ───────────────────────────────────────────────

function prepararMarcarPagado(args = {}) {
  const pedido = buscarPedidoPorNumero(args.pedido);

  if (pedido.pago_estado === 'pagado') {
    throw new ErrorDeAccion(`El pedido #${pedido.numero} ya figura como pagado.`);
  }
  if (pedido.estado === 'cancelado') {
    throw new ErrorDeAccion(
      `No se puede marcar como pagado un pedido cancelado (#${pedido.numero}).`
    );
  }

  const metodo = String(args.metodo_pago || pedido.metodo_pago || 'efectivo').trim();
  if (!metodo) throw new ErrorDeAccion('El pedido no tiene método de pago. Decime cuál usar.');

  return {
    resumen: `Marcar el pedido #${pedido.numero} como pagado (${metodo}).`,
    detalles: [
      { etiqueta: 'Pedido', valor: `#${pedido.numero}` },
      { etiqueta: 'Cliente', valor: pedido.cliente_nombre || '—' },
      { etiqueta: 'Total', valor: `$${aPesos(pedido.total)}` },
      { etiqueta: 'Método de pago', valor: metodo },
      { etiqueta: 'Estado actual', valor: pedido.estado },
    ],
    argumentosResueltos: {
      pedido_id: pedido.id,
      numero: pedido.numero,
      metodo_pago: metodo,
    },
  };
}

function ejecutarMarcarPagado(argumentos) {
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(argumentos.pedido_id);
  if (!pedido) throw new ErrorDeAccion('El pedido ya no existe.');
  if (pedido.estado === 'cancelado') {
    throw new ErrorDeAccion('No se puede marcar como pagado un pedido cancelado.');
  }
  if (pedido.pago_estado === 'pagado') throw new ErrorDeAccion('El pedido ya figura como pagado.');

  db.prepare(
    `UPDATE pedidos SET pago_estado = 'pagado', metodo_pago = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(argumentos.metodo_pago, pedido.id);

  return `Pedido #${pedido.numero} marcado como pagado (${argumentos.metodo_pago}).`;
}

// ── Catálogo ────────────────────────────────────────────────────────────────

const ACCIONES = [
  {
    nombre: 'proponer_cambio_de_stock',
    descripcion:
      'Cambiar el stock de un insumo. Usá operacion="sumar" para agregar a lo que hay, "restar" para descontar, y "fijar" cuando el usuario dice cuánto queda en total. Las cantidades son unidades de inventario, no pesos.',
    parametros: {
      type: 'object',
      properties: {
        insumo: { type: 'string', description: 'Nombre del insumo, como lo dijo el usuario.' },
        cantidad: { type: 'number', description: 'Cuánto. Siempre positivo.' },
        operacion: { type: 'string', enum: ['sumar', 'restar', 'fijar'] },
        motivo: { type: 'string', description: 'Por qué se ajusta.' },
      },
      required: ['insumo', 'cantidad'],
    },
    preparar: prepararStock,
    ejecutar: ejecutarStock,
  },
  {
    nombre: 'proponer_stock_de_producto',
    descripcion:
      'Cambiar el stock directo de un producto terminado. Usala para productos con stock directo; si usa receta, hay que ajustar sus insumos.',
    parametros: {
      type: 'object',
      properties: {
        producto: { type: 'string', description: 'Nombre exacto o suficientemente claro.' },
        cantidad: { type: 'number', description: 'Cantidad positiva.' },
        operacion: { type: 'string', enum: ['sumar', 'restar', 'fijar'] },
        motivo: { type: 'string' },
      },
      required: ['producto', 'cantidad'],
    },
    preparar: prepararStockProducto,
    ejecutar: ejecutarStockProducto,
  },
  {
    nombre: 'proponer_receta_de_producto',
    descripcion:
      'Crear o reemplazar la receta completa de un producto usando insumos existentes. Cada cantidad usa la unidad del insumo. Puede ser siempre, variante o extra.',
    parametros: {
      type: 'object',
      properties: {
        producto: { type: 'string' },
        ingredientes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              insumo: { type: 'string' },
              cantidad: { type: 'number' },
              condicion_tipo: { type: 'string', enum: ['siempre', 'variante', 'extra'] },
              condicion_grupo: {
                type: 'string',
                description: 'Grupo de variante, por ejemplo Presentación.',
              },
              condicion_valor: {
                type: 'string',
                description: 'Opción de variante o nombre del extra.',
              },
            },
            required: ['insumo', 'cantidad'],
          },
        },
      },
      required: ['producto', 'ingredientes'],
    },
    preparar: prepararReceta,
    ejecutar: ejecutarReceta,
  },
  {
    nombre: 'proponer_promo',
    descripcion:
      'Crear una promoción. El valor va en porcentaje si el tipo es "porcentaje", y en pesos si es "descuento_fijo". Las fechas en formato AAAA-MM-DD.',
    parametros: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        descripcion: { type: 'string' },
        tipo: {
          type: 'string',
          enum: [
            'porcentaje',
            'descuento_fijo',
            'envio_gratis',
            'combo_especial',
            'promo_producto',
          ],
        },
        valor: { type: 'number' },
        producto: { type: 'string', description: 'Si la promo es de un producto puntual.' },
        desde: { type: 'string' },
        hasta: { type: 'string' },
        canal: { type: 'string' },
      },
      required: ['nombre', 'tipo'],
    },
    preparar: prepararPromo,
    ejecutar: ejecutarPromo,
  },
  {
    nombre: 'proponer_menu_del_dia',
    descripcion:
      'Armar el menú del día de hoy. Recibe TODOS los platos que van a estar disponibles: los que no estén en la lista quedan afuera. Los precios en pesos; si no se aclara uno, se usa el precio que ya tiene el plato.',
    parametros: {
      type: 'object',
      properties: {
        platos: {
          type: 'array',
          description: 'Todos los platos del menú de hoy.',
          items: {
            type: 'object',
            properties: {
              nombre: { type: 'string' },
              precio: { type: 'number', description: 'En pesos. Opcional.' },
              stock: { type: 'number', description: 'Stock disponible para hoy. Opcional.' },
            },
            required: ['nombre'],
          },
        },
        precio: {
          type: 'number',
          description: 'Precio en pesos para todos los platos que no traigan uno propio.',
        },
        stock: { type: 'number', description: 'Stock común para los platos que no indiquen uno.' },
      },
      required: ['platos'],
    },
    preparar: prepararMenuDia,
    ejecutar: ejecutarMenuDia,
  },
  {
    nombre: 'proponer_nuevo_plato_menu_del_dia',
    descripcion:
      'Crear un plato nuevo en la biblioteca del menú del día y dejarlo activo hoy. Usar solo si el plato todavía no existe.',
    parametros: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        descripcion: { type: 'string' },
        tipo: { type: 'string', enum: ['economico', 'ejecutivo'] },
        precio: { type: 'number', description: 'Precio en pesos.' },
        stock: { type: 'number', description: 'Unidades disponibles hoy.' },
        tiempo_preparacion: { type: 'number', description: 'Minutos.' },
        guarniciones: { type: 'array', items: { type: 'string' } },
        ofrece_postre: { type: 'boolean' },
        ofrece_bebida_postre: { type: 'boolean' },
      },
      required: ['nombre', 'precio', 'stock'],
    },
    preparar: prepararNuevoPlatoMenuDia,
    ejecutar: ejecutarNuevoPlatoMenuDia,
  },
  {
    nombre: 'proponer_editar_plato_menu_del_dia',
    descripcion:
      'Editar un plato existente del menú del día: nombre, descripción, precio, stock, tipo, preparación, guarniciones, extras, destacado y si está activo hoy. Mandar sólo los campos que se quieran cambiar.',
    parametros: {
      type: 'object',
      properties: {
        plato: { type: 'string', description: 'Nombre actual del plato.' },
        nombre: { type: 'string' },
        descripcion: { type: 'string' },
        precio: { type: 'number', description: 'Precio en pesos.' },
        stock: { type: 'number', description: 'Stock disponible hoy.' },
        tipo: { type: 'string', enum: ['economico', 'ejecutivo'] },
        tiempo_preparacion: { type: 'number', description: 'Minutos.' },
        guarniciones: { type: 'array', items: { type: 'string' } },
        ofrece_postre: { type: 'boolean' },
        ofrece_bebida_postre: { type: 'boolean' },
        destacado: { type: 'boolean' },
        activo_hoy: { type: 'boolean', description: 'Activar o desactivar para hoy.' },
      },
      required: ['plato'],
    },
    preparar: prepararEditarPlatoMenuDia,
    ejecutar: ejecutarEditarPlatoMenuDia,
  },
  {
    nombre: 'proponer_archivar_plato_menu_del_dia',
    descripcion:
      'Archivar un plato que ya no se usa en la biblioteca del menú del día. No borra su historial ni ventas anteriores.',
    parametros: {
      type: 'object',
      properties: { plato: { type: 'string' } },
      required: ['plato'],
    },
    preparar: prepararArchivarPlatoMenuDia,
    ejecutar: ejecutarArchivarPlatoMenuDia,
  },
  {
    nombre: 'proponer_compra',
    descripcion:
      'Registrar una compra de insumos: suma el stock y actualiza el costo. El costo_unitario es el precio POR UNIDAD en pesos, no el total. Si el usuario te da el total, dividilo por la cantidad antes de llamar. Si no queda claro cuál de los dos te dijo, preguntá.',
    parametros: {
      type: 'object',
      properties: {
        proveedor: { type: 'string' },
        metodo_pago: { type: 'string', description: 'efectivo, transferencia, etc.' },
        notas: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              insumo: { type: 'string', description: 'Nombre del insumo.' },
              cantidad: { type: 'number' },
              costo_unitario: { type: 'number', description: 'Precio por unidad, en pesos.' },
            },
            required: ['insumo', 'cantidad', 'costo_unitario'],
          },
        },
      },
      required: ['items'],
    },
    preparar: prepararCompra,
    ejecutar: ejecutarCompra,
  },
  {
    nombre: 'proponer_pedido',
    descripcion:
      'Cargar un pedido en el sistema. Los precios los calcula el servidor desde el catálogo: no los mandes ni los estimes. Para delivery hace falta la dirección. Si no te dijeron la forma de pago, cargalo igual pero avisá que falta.',
    parametros: {
      type: 'object',
      properties: {
        cliente_nombre: { type: 'string' },
        cliente_telefono: { type: 'string' },
        tipo_entrega: { type: 'string', enum: ['delivery', 'retiro'] },
        direccion: { type: 'string', description: 'Obligatoria si es delivery.' },
        metodo_pago: { type: 'string', description: 'efectivo, transferencia, mercadopago...' },
        notas: { type: 'string', description: 'Aclaraciones para la cocina.' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              producto: { type: 'string', description: 'Nombre del producto.' },
              cantidad: { type: 'integer' },
              variantes: {
                type: 'object',
                description: 'Opciones elegidas, por ejemplo { "Guarnición": "Papas" }.',
              },
              extras: {
                type: 'array',
                description: 'Agregados sueltos.',
                items: { type: 'object', properties: { nombre: { type: 'string' } } },
              },
            },
            required: ['producto', 'cantidad'],
          },
        },
      },
      required: ['cliente_nombre', 'items'],
    },
    preparar: prepararPedido,
    ejecutar: ejecutarPedido,
  },
  // ══════════════════════════════════════════════════════════════════════════
  // ACCIONES DE REPARACIÓN (nuevas)
  // ══════════════════════════════════════════════════════════════════════════
  {
    nombre: 'proponer_cancelar_pedido',
    descripcion:
      'Cancelar un pedido que está colgado o que el usuario quiere anular. No se puede cancelar un pedido ya entregado. El stock de los productos se restaura automáticamente.',
    parametros: {
      type: 'object',
      properties: {
        pedido: { type: 'string', description: 'Número del pedido a cancelar.' },
        motivo: { type: 'string', description: 'Por qué se cancela.' },
      },
      required: ['pedido'],
    },
    preparar: prepararCancelarPedido,
    ejecutar: ejecutarCancelarPedido,
  },
  {
    nombre: 'proponer_ajustar_stock_negativo',
    descripcion:
      'Ajustar el stock de un insumo que tiene cantidad negativa, llevándolo a cero. Usala cuando el diagnóstico detecte stock negativo.',
    parametros: {
      type: 'object',
      properties: {
        insumo: { type: 'string', description: 'Nombre del insumo con stock negativo.' },
        motivo: { type: 'string', description: 'Por qué se ajusta.' },
      },
      required: ['insumo'],
    },
    preparar: prepararAjustarStockNegativo,
    ejecutar: ejecutarAjustarStockNegativo,
  },
  {
    nombre: 'proponer_marcar_pagado',
    descripcion:
      'Marcar un pedido como pagado. Usala para arreglar pedidos entregados que figuran sin cobrar, o cuando el diagnóstico de caja detecte pagos faltantes.',
    parametros: {
      type: 'object',
      properties: {
        pedido: { type: 'string', description: 'Número del pedido.' },
        metodo_pago: {
          type: 'string',
          description:
            'efectivo, transferencia, mercadopago... Si no se indica, usa el que ya tenga el pedido.',
        },
      },
      required: ['pedido'],
    },
    preparar: prepararMarcarPagado,
    ejecutar: ejecutarMarcarPagado,
  },
];

function catalogoDeAcciones() {
  return ACCIONES.map(({ nombre, descripcion, parametros }) => ({
    nombre,
    descripcion,
    parametros,
  }));
}

function esAccion(nombre) {
  return ACCIONES.some((a) => a.nombre === nombre);
}

const ACCIONES_REPARACION = new Set([
  'proponer_cancelar_pedido',
  'proponer_ajustar_stock_negativo',
  'proponer_marcar_pagado',
]);

function esAccionReparacion(nombre) {
  return ACCIONES_REPARACION.has(nombre);
}

function prepararAccion(nombre, args = {}) {
  const accion = ACCIONES.find((a) => a.nombre === nombre);
  if (!accion) return { error: `No existe la acción "${nombre}".` };
  try {
    const preparada = accion.preparar(args || {});
    if (preparada && typeof preparada.then === 'function') {
      return preparada
        .then((resultado) => ({ ...resultado, accion: nombre }))
        .catch((error) => ({
          error:
            error instanceof ErrorDeAccion
              ? error.message
              : `No pude preparar el cambio: ${String(error?.message || error).slice(0, 200)}`,
        }));
    }
    return { ...preparada, accion: nombre };
  } catch (error) {
    if (error instanceof ErrorDeAccion) return { error: error.message };
    return {
      error: `No pude preparar el cambio: ${String(error?.message || error).slice(0, 200)}`,
    };
  }
}

async function ejecutarAccion(nombre, argumentosResueltos, contexto = {}) {
  const accion = ACCIONES.find((a) => a.nombre === nombre);
  if (!accion) throw new ErrorDeAccion(`No existe la acción "${nombre}".`);
  return accion.ejecutar(argumentosResueltos || {}, contexto);
}

module.exports = {
  ACCIONES,
  ErrorDeAccion,
  catalogoDeAcciones,
  esAccion,
  esAccionReparacion,
  prepararAccion,
  ejecutarAccion,
};
