const db = require('../db');
const marketingService = require('./marketingService');
const { insertInventoryMovement, roundStock } = require('../utils/inventory');
const { persistMenuDiaItems, loadMenuDiaLibrary } = require('../routes/operacion');
const { registrarCompra } = require('../routes/compras');

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
 * Esto resuelve dos problemas de una:
 *
 *   1. El modelo entiende mal. Va a pasar: le decís "subí la carne a 30" y
 *      entiende 30 kilos cuando eran 30 más. Con la confirmación lo ves antes.
 *
 *   2. Alguien intenta darle órdenes desde afuera. Las notas de los pedidos y
 *      los nombres de clientes los escribe cualquiera desde la web. Aunque un
 *      texto así logre confundir al modelo, el cambio queda esperando una
 *      confirmación que ese atacante no puede dar.
 *
 * Cada acción tiene dos partes:
 *
 *   `preparar(args)` → valida contra la base y devuelve el resumen que ve el
 *                      usuario. No escribe nada.
 *   `ejecutar(args, contexto)` → hace el cambio. Vuelve a validar, porque entre
 *                      la propuesta y la confirmación el mundo pudo cambiar.
 */

const CENTAVOS = 100;

function aCentavos(pesos) {
  return Math.round(Number(pesos || 0) * CENTAVOS);
}

function pesos(centavos) {
  return `$${(Number(centavos || 0) / CENTAVOS).toLocaleString('es-AR')}`;
}

/** Un error que el asistente puede contarle al usuario tal cual. */
class ErrorDeAccion extends Error {}

/*
  ── Buscar por nombre ──────────────────────────────────────────────────────

  El usuario habla, no elige de una lista: dice "carne", no "insumo #42". Y el
  modelo repite esa palabra.

  Si hay más de una coincidencia NO se elige la primera: se devuelven las
  opciones para que el usuario decida. Adivinar acá significa cambiarle el
  stock al insumo equivocado, y eso se descubre recién cuando falta mercadería.
*/
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

  // Primero exacto: si hay un insumo llamado "Carne" y otro "Carne picada",
  // pedir "carne" tiene que dar el primero y no un empate.
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

// ── Stock ───────────────────────────────────────────────────────────────────

function prepararStock(args = {}) {
  const insumo = buscarInsumo(args.insumo);
  const cantidad = roundStock(args.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw new ErrorDeAccion('La cantidad tiene que ser un número mayor que cero.');
  }

  const operacion = String(args.operacion || 'sumar').toLowerCase();
  const actual = roundStock(insumo.stock_actual);

  /*
    "Sumar 30" y "dejar en 30" son cosas distintas y se confunden fácil al
    hablar. Por eso el resumen dice siempre de cuánto a cuánto: así el usuario
    ve el resultado final antes de confirmar, sin tener que hacer la cuenta.
  */
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
    // Se guarda el id resuelto: al confirmar no se vuelve a buscar por nombre,
    // porque el resultado de la búsqueda podría haber cambiado.
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

    // Queda en el historial de inventario como cualquier otro movimiento, para
    // que después se pueda rastrear de dónde salió.
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
      // El servicio de marketing guarda el valor tal cual se le pasa. Para el
      // descuento fijo va en centavos, como el resto de la plata del sistema.
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

    // Se busca primero entre los platos que ya son del menú del día: son los
    // que el usuario tiene en la cabeza cuando dicta el menú.
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
    };
  });

  return {
    resumen: `Armar el menú de hoy con ${resueltos.length} ${
      resueltos.length === 1 ? 'plato' : 'platos'
    }.`,
    detalles: resueltos.map((p) => ({ etiqueta: p.nombre, valor: pesos(p.precio) })),
    /*
      Este aviso importa: guardar el menú del día apaga todos los platos que no
      estén en la lista. Si el usuario quería agregar uno a los que ya había,
      tiene que verlo antes de confirmar y no después.
    */
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
    orden_hoy: indice,
  }));
  persistMenuDiaItems(items);
  return `Menú del día armado con ${items.length} ${items.length === 1 ? 'plato' : 'platos'}.`;
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

    /*
      El costo unitario es el punto donde más fácil se cuela un error caro.

      "20 kilos de carne por 170.000" puede ser el total o el precio por kilo, y
      la diferencia son dos órdenes de magnitud en el costo del insumo, que
      después arrastra todos los cálculos de rentabilidad.

      Por eso se pide siempre el unitario y el resumen muestra las dos cifras:
      cuánto por unidad y cuánto en total. Así el error se ve antes de confirmar.
    */
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
    resumen: `Registrar una compra de ${pesos(totalCentavos)}${
      proveedor ? ` a ${proveedor}` : ''
    }.`,
    detalles,
    advertencia: `Suma el stock de ${
      resueltos.length === 1 ? 'ese insumo' : 'esos insumos'
    } y actualiza su costo al de esta compra.`,
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
            },
            required: ['nombre'],
          },
        },
        precio: {
          type: 'number',
          description: 'Precio en pesos para todos los platos que no traigan uno propio.',
        },
      },
      required: ['platos'],
    },
    preparar: prepararMenuDia,
    ejecutar: ejecutarMenuDia,
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

/**
 * Arma la propuesta sin ejecutar nada.
 *
 * Un error de validación no se lanza: vuelve como `{ error }` para que el
 * modelo se lo explique al usuario y pueda corregir en la misma conversación.
 */
function prepararAccion(nombre, args = {}) {
  const accion = ACCIONES.find((a) => a.nombre === nombre);
  if (!accion) return { error: `No existe la acción "${nombre}".` };
  try {
    return { ...accion.preparar(args || {}), accion: nombre };
  } catch (error) {
    if (error instanceof ErrorDeAccion) return { error: error.message };
    return {
      error: `No pude preparar el cambio: ${String(error?.message || error).slice(0, 200)}`,
    };
  }
}

/** Ejecuta una propuesta ya confirmada por el usuario. */
async function ejecutarAccion(nombre, argumentosResueltos, contexto = {}) {
  const accion = ACCIONES.find((a) => a.nombre === nombre);
  if (!accion) throw new ErrorDeAccion(`No existe la acción "${nombre}".`);
  // El contexto lleva quién confirmó: la compra queda a nombre de la persona y
  // no de "Sistema", que es lo que haría falta para auditarla después.
  return accion.ejecutar(argumentosResueltos || {}, contexto);
}

module.exports = {
  ACCIONES,
  ErrorDeAccion,
  catalogoDeAcciones,
  esAccion,
  prepararAccion,
  ejecutarAccion,
};
