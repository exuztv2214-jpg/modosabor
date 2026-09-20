const defaultDb = require('../db');
const { quoteProduct, findClienteByPhone, getDeliveryInfo } = require('../utils/systemClient');

function json(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/*
  La hora que pidió el cliente, en formato "HH:MM".

  Se normaliza en vez de guardar lo que mande el modelo porque este dato se
  imprime en la comanda ("Entregar 21:30") y lo lee la cocina de un vistazo. Un
  "a eso de las nueve y media" ahí no sirve, y un texto libre deja pasar
  cualquier cosa.

  Acepta las formas en que se escribe una hora acá —21:30, 21.30, 9:30— y
  devuelve vacío si no es una hora, que significa "cuanto antes".
*/
function horaNormalizada(valor) {
  const crudo = String(valor || '')
    .trim()
    .toLowerCase();
  if (!crudo) return '';
  const match = crudo.match(/(\d{1,2})\s*[:.]\s*(\d{2})/) || crudo.match(/^(\d{1,2})\s*(?:hs?)?$/);
  if (!match) return '';
  const horas = Number(match[1]);
  const minutos = Number(match[2] ?? 0);
  if (!Number.isInteger(horas) || horas < 0 || horas > 23) return '';
  if (!Number.isInteger(minutos) || minutos < 0 || minutos > 59) return '';
  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

function textoOpciones(variantes = {}, extras = [], notas = '') {
  const variantesTexto = Object.values(variantes || {})
    .map((opcion) => (typeof opcion === 'string' ? opcion : opcion?.nombre))
    .filter(Boolean);
  const extrasTexto = (extras || [])
    .map((extra) => (typeof extra === 'string' ? extra : extra?.nombre))
    .filter(Boolean);
  return [...variantesTexto, ...extrasTexto, notas].filter(Boolean).join(' ');
}

function crearCarritoWhatsapp(db = defaultDb) {
  function ultimoBorrador(telefono) {
    return db
      .prepare(
        'SELECT * FROM whatsapp_pedidos_borrador WHERE telefono = ? ORDER BY id DESC LIMIT 1'
      )
      .get(String(telefono));
  }

  function borradorAbierto(telefono) {
    return db
      .prepare(
        `SELECT * FROM whatsapp_pedidos_borrador
          WHERE telefono = ? AND estado = 'abierto' AND pedido_id IS NULL
          ORDER BY id DESC LIMIT 1`
      )
      .get(String(telefono));
  }

  function asegurarBorrador(telefono) {
    const existente = borradorAbierto(telefono);
    if (existente) return existente;
    const conversacion = db
      .prepare('SELECT id, nombre FROM whatsapp_conversaciones WHERE telefono = ?')
      .get(String(telefono));
    const cliente = findClienteByPhone(db, telefono);
    const result = db
      .prepare(
        `INSERT INTO whatsapp_pedidos_borrador
          (conversacion_id, telefono, cliente_nombre, cliente_direccion, estado)
         VALUES (?, ?, ?, ?, 'abierto')`
      )
      .run(
        conversacion?.id || null,
        String(telefono),
        cliente?.nombre || conversacion?.nombre || '',
        cliente?.direccion || ''
      );
    return db
      .prepare('SELECT * FROM whatsapp_pedidos_borrador WHERE id = ?')
      .get(result.lastInsertRowid);
  }

  function exigirEditable(borrador) {
    if (!borrador) throw new Error('No hay un carrito abierto');
    if (borrador.pedido_id || borrador.estado !== 'abierto') {
      throw new Error('El carrito ya fue confirmado y no se puede modificar');
    }
  }

  function recalcular(borradorId) {
    const subtotal = Number(
      db
        .prepare(
          'SELECT COALESCE(SUM(precio_unitario * cantidad), 0) total FROM whatsapp_pedidos_borrador_items WHERE borrador_id = ?'
        )
        .get(borradorId)?.total || 0
    );
    const borrador = db
      .prepare('SELECT costo_envio FROM whatsapp_pedidos_borrador WHERE id = ?')
      .get(borradorId);
    const costoEnvio = Number(borrador?.costo_envio || 0);
    db.prepare(
      `UPDATE whatsapp_pedidos_borrador SET subtotal = ?, total = ?,
       actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(subtotal, subtotal + costoEnvio, borradorId);
  }

  function cotizar(datos) {
    const producto = db
      .prepare('SELECT id, nombre FROM productos WHERE id = ? AND activo = 1')
      .get(Number(datos.producto_id));
    if (!producto) throw new Error('El producto no existe o está inactivo');
    const consulta =
      `${producto.nombre} ${textoOpciones(datos.variantes, datos.extras, datos.notas)}`.trim();
    const cotizacion = quoteProduct(db, consulta);
    if (cotizacion.status !== 'ok' || Number(cotizacion.product?.id) !== Number(producto.id)) {
      throw new Error(cotizacion.message || 'No se pudo cotizar el producto');
    }
    return { producto, cotizacion };
  }

  function verCarrito(telefono) {
    const borrador = borradorAbierto(telefono);
    if (!borrador) return { abierto: false, telefono: String(telefono), items: [] };
    const items = db
      .prepare('SELECT * FROM whatsapp_pedidos_borrador_items WHERE borrador_id = ? ORDER BY id')
      .all(borrador.id)
      .map((item) => ({
        ...item,
        variantes: json(item.variantes, {}),
        extras: json(item.extras, []),
      }));
    return { ...borrador, abierto: true, items };
  }

  function agregarItem(telefono, datos) {
    const cantidad = Math.max(1, Number(datos?.cantidad || 1));
    const borrador = asegurarBorrador(telefono);
    exigirEditable(borrador);
    const { producto, cotizacion } = cotizar(datos || {});
    const variantes = datos?.variantes || cotizacion.order_item?.variantes || {};
    const extras = datos?.extras || cotizacion.order_item?.extras || [];
    const notas = String(datos?.notas || '').trim();
    const firmaVariantes = JSON.stringify(variantes);
    const firmaExtras = JSON.stringify(extras);
    const igual = db
      .prepare(
        `SELECT id, cantidad FROM whatsapp_pedidos_borrador_items
          WHERE borrador_id = ? AND producto_id = ? AND variantes = ? AND extras = ? AND descripcion = ?
          LIMIT 1`
      )
      .get(borrador.id, producto.id, firmaVariantes, firmaExtras, notas);

    let itemId;
    if (igual) {
      db.prepare(
        'UPDATE whatsapp_pedidos_borrador_items SET cantidad = cantidad + ? WHERE id = ?'
      ).run(cantidad, igual.id);
      itemId = igual.id;
    } else {
      const result = db
        .prepare(
          `INSERT INTO whatsapp_pedidos_borrador_items
            (borrador_id, producto_id, nombre, cantidad, descripcion, variantes, extras, precio_unitario)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          borrador.id,
          producto.id,
          cotizacion.item_name || producto.nombre,
          cantidad,
          notas,
          firmaVariantes,
          firmaExtras,
          Number(cotizacion.price_total)
        );
      itemId = Number(result.lastInsertRowid);
    }
    recalcular(borrador.id);
    return { itemId, carrito: verCarrito(telefono) };
  }

  function quitarItem(telefono, itemId) {
    const borrador = borradorAbierto(telefono);
    exigirEditable(borrador);
    const result = db
      .prepare('DELETE FROM whatsapp_pedidos_borrador_items WHERE id = ? AND borrador_id = ?')
      .run(Number(itemId), borrador.id);
    if (!result.changes) throw new Error('No se encontró ese item en el carrito');
    recalcular(borrador.id);
    return verCarrito(telefono);
  }

  function modificarItem(telefono, itemId, cambios = {}) {
    const borrador = borradorAbierto(telefono);
    exigirEditable(borrador);
    const actual = db
      .prepare('SELECT * FROM whatsapp_pedidos_borrador_items WHERE id = ? AND borrador_id = ?')
      .get(Number(itemId), borrador.id);
    if (!actual) throw new Error('No se encontró ese item en el carrito');
    const datos = {
      producto_id: actual.producto_id,
      cantidad: cambios.cantidad ?? actual.cantidad,
      variantes: cambios.variantes ?? json(actual.variantes, {}),
      extras: cambios.extras ?? json(actual.extras, []),
      notas: cambios.notas ?? actual.descripcion,
    };
    const { producto, cotizacion } = cotizar(datos);
    db.prepare(
      `UPDATE whatsapp_pedidos_borrador_items SET nombre = ?, cantidad = ?, descripcion = ?,
       variantes = ?, extras = ?, precio_unitario = ? WHERE id = ?`
    ).run(
      cotizacion.item_name || producto.nombre,
      Math.max(1, Number(datos.cantidad || 1)),
      String(datos.notas || ''),
      JSON.stringify(datos.variantes || {}),
      JSON.stringify(datos.extras || []),
      Number(cotizacion.price_total),
      actual.id
    );
    recalcular(borrador.id);
    return verCarrito(telefono);
  }

  function vaciarCarrito(telefono) {
    const borrador = borradorAbierto(telefono);
    exigirEditable(borrador);
    db.prepare('DELETE FROM whatsapp_pedidos_borrador_items WHERE borrador_id = ?').run(
      borrador.id
    );
    recalcular(borrador.id);
    return verCarrito(telefono);
  }

  function actualizarDatos(telefono, datos = {}) {
    const borrador = asegurarBorrador(telefono);
    exigirEditable(borrador);

    const nombre = String(datos.cliente_nombre || '')
      .replace(/\0/g, '')
      .trim()
      .slice(0, 120);
    const direccion = String(datos.cliente_direccion || '')
      .replace(/\0/g, '')
      .trim()
      .slice(0, 500);
    const notas = String(datos.notas || '')
      .replace(/\0/g, '')
      .trim()
      .slice(0, 1000);
    const entrega = String(datos.tipo_entrega || '')
      .trim()
      .toLowerCase();
    const pago = String(datos.metodo_pago || '')
      .trim()
      .toLowerCase();
    const tipoEntrega =
      entrega === 'retiro' ? 'retiro' : entrega === 'delivery' ? 'delivery' : null;
    /*
      Una hora ilegible se descarta en vez de guardarse tal cual. Si el cliente
      pidió una hora y no se entendió, es mejor que el pedido salga "cuanto
      antes" —y que el resumen no la muestre, así el cliente lo nota— que
      mandar a la cocina un horario inventado.
    */
    const horaEntrega = horaNormalizada(datos.hora_entrega);
    const metodoPago = pago.includes('transfer')
      ? 'transferencia'
      : pago === 'efectivo'
        ? 'efectivo'
        : null;

    db.prepare(
      `UPDATE whatsapp_pedidos_borrador
          SET cliente_nombre = CASE WHEN ? != '' THEN ? ELSE cliente_nombre END,
              cliente_direccion = CASE WHEN ? != '' THEN ? ELSE cliente_direccion END,
              tipo_entrega = COALESCE(?, tipo_entrega),
              metodo_pago = COALESCE(?, metodo_pago),
              notas = CASE WHEN ? != '' THEN ? ELSE notas END,
              hora_entrega = CASE WHEN ? != '' THEN ? ELSE hora_entrega END,
              actualizado_en = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).run(
      nombre,
      nombre,
      direccion,
      direccion,
      tipoEntrega,
      metodoPago,
      notas,
      notas,
      horaEntrega,
      horaEntrega,
      borrador.id
    );
    const actualizado = db
      .prepare('SELECT * FROM whatsapp_pedidos_borrador WHERE id = ?')
      .get(borrador.id);
    const envio =
      actualizado.tipo_entrega === 'retiro'
        ? null
        : getDeliveryInfo(db, actualizado.cliente_direccion);
    db.prepare('UPDATE whatsapp_pedidos_borrador SET costo_envio = ? WHERE id = ?').run(
      Number(envio?.costo_envio || 0),
      borrador.id
    );
    recalcular(borrador.id);
    return verCarrito(telefono);
  }

  async function confirmarCarrito(telefono, datos = {}, dependencias = {}) {
    const borrador = ultimoBorrador(telefono);
    if (!borrador) throw new Error('No hay un carrito para confirmar');
    if (borrador.pedido_id) {
      return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(borrador.pedido_id);
    }
    exigirEditable(borrador);
    const items = db
      .prepare('SELECT * FROM whatsapp_pedidos_borrador_items WHERE borrador_id = ? ORDER BY id')
      .all(borrador.id)
      .map((item) => ({
        producto_id: item.producto_id,
        nombre: item.nombre,
        cantidad: item.cantidad,
        descripcion: item.descripcion,
        variantes: json(item.variantes, {}),
        extras: json(item.extras, []),
      }));
    if (!items.length) throw new Error('El carrito está vacío');
    if (borrador.tipo_entrega !== 'retiro' && !String(borrador.cliente_direccion || '').trim()) {
      throw new Error('Falta la dirección de entrega antes de confirmar el pedido');
    }

    const mensajeId = String(datos.whatsappMessageId || '').trim();
    if (!mensajeId) throw new Error('Falta el identificador del mensaje de confirmación');
    const idempotencyKey = `whatsapp:${mensajeId}:${borrador.id}`;
    const crearPedido =
      dependencias.createRealOrder || require('../utils/systemClient').createRealOrder;
    const administraTransaccion = !db.inTransaction;
    try {
      if (administraTransaccion) db.exec('BEGIN IMMEDIATE');
      const pedido = await crearPedido(
        db,
        {
          cliente_nombre: borrador.cliente_nombre,
          cliente_telefono: String(telefono),
          cliente_direccion: borrador.cliente_direccion,
          tipo_entrega: borrador.tipo_entrega,
          metodo_pago: borrador.metodo_pago,
          notas: borrador.notas,
          hora_entrega: borrador.hora_entrega || '',
          items,
          origen: 'whatsapp',
          idempotencyKey,
        },
        dependencias
      );
      dependencias.antesDeCerrar?.({ borrador, pedido });
      const cierre = db
        .prepare(
          `UPDATE whatsapp_pedidos_borrador
              SET pedido_id = ?, estado = 'confirmado', actualizado_en = CURRENT_TIMESTAMP
            WHERE id = ? AND pedido_id IS NULL AND estado = 'abierto'`
        )
        .run(pedido.id, borrador.id);
      if (!cierre.changes) throw new Error('El carrito ya fue confirmado');
      if (administraTransaccion) db.exec('COMMIT');
      return pedido;
    } catch (error) {
      if (administraTransaccion) {
        try {
          db.exec('ROLLBACK');
        } catch {}
      }
      throw error;
    }
  }

  return {
    verCarrito,
    agregarItem,
    quitarItem,
    modificarItem,
    vaciarCarrito,
    actualizarDatos,
    confirmarCarrito,
  };
}

module.exports = { crearCarritoWhatsapp, ...crearCarritoWhatsapp(defaultDb) };
