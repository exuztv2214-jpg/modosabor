const ESTADOS = new Set(['borrador', 'enviada', 'aceptada', 'rechazada', 'vencida']);
const { hoyArgentina } = require('../utils/fechaLocal');

function texto(value, max = 5000) {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

function enteroPositivo(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${field} debe ser un numero entero mayor a cero`);
  }
  return number;
}

function importeNoNegativo(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${field} debe ser un importe valido`);
  }
  return Math.round(number);
}

function normalizarItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('La cotizacion necesita al menos un renglon');
  }

  return items.map((item, index) => {
    const descripcion = texto(item?.descripcion, 300);
    if (!descripcion) throw new Error(`Falta la descripcion del renglon ${index + 1}`);

    const cantidad = enteroPositivo(item?.cantidad, `La cantidad del renglon ${index + 1}`);
    const precio_unitario = importeNoNegativo(
      item?.precio_unitario,
      `El precio del renglon ${index + 1}`
    );

    return {
      descripcion,
      detalle: texto(item?.detalle, 1000),
      cantidad,
      precio_unitario,
      subtotal: cantidad * precio_unitario,
    };
  });
}

function normalizarCotizacion(payload = {}) {
  const cliente_empresa = texto(payload.cliente_empresa, 200);
  if (!cliente_empresa) throw new Error('La empresa o cliente es obligatorio');

  const items = normalizarItems(payload.items);
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const descuento = importeNoNegativo(payload.descuento || 0, 'El descuento');
  if (descuento > subtotal) throw new Error('El descuento no puede superar el subtotal');

  const estado = texto(payload.estado, 30) || 'borrador';
  if (!ESTADOS.has(estado)) throw new Error('Estado de cotizacion invalido');

  const validez_dias = enteroPositivo(payload.validez_dias || 7, 'La validez');
  if (validez_dias > 365) throw new Error('La validez no puede superar 365 dias');

  return {
    cliente_empresa,
    cliente_contacto: texto(payload.cliente_contacto, 200),
    cliente_cuit: texto(payload.cliente_cuit, 30),
    cliente_telefono: texto(payload.cliente_telefono, 60),
    cliente_email: texto(payload.cliente_email, 200),
    cliente_direccion: texto(payload.cliente_direccion, 300),
    fecha_emision: texto(payload.fecha_emision, 10) || hoyArgentina(),
    fecha_servicio: texto(payload.fecha_servicio, 10),
    validez_dias,
    estado,
    condiciones_pago: texto(payload.condiciones_pago, 1000) || 'Forma y fecha de pago a coordinar.',
    observaciones: texto(payload.observaciones, 2000),
    items,
    subtotal,
    descuento,
    total: subtotal - descuento,
  };
}

function numeroCotizacion(id, fechaEmision) {
  const year = /^\d{4}/.test(String(fechaEmision || ''))
    ? String(fechaEmision).slice(0, 4)
    : String(new Date().getFullYear());
  return `COT-${year}-${String(id).padStart(5, '0')}`;
}

function hidratarCotizacion(db, id) {
  const cotizacion = db.prepare('SELECT * FROM cotizaciones WHERE id = ?').get(id);
  if (!cotizacion) return null;
  cotizacion.items = db
    .prepare('SELECT * FROM cotizacion_items WHERE cotizacion_id = ? ORDER BY orden, id')
    .all(id);
  return cotizacion;
}

function guardarItems(db, cotizacionId, items) {
  const insert = db.prepare(
    `INSERT INTO cotizacion_items
      (cotizacion_id, descripcion, detalle, cantidad, precio_unitario, subtotal, orden)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  items.forEach((item, index) => {
    insert.run(
      cotizacionId,
      item.descripcion,
      item.detalle,
      item.cantidad,
      item.precio_unitario,
      item.subtotal,
      index
    );
  });
}

function crearCotizacion(db, payload, actorId = null) {
  const data = normalizarCotizacion(payload);
  return db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO cotizaciones (
          numero, cliente_empresa, cliente_contacto, cliente_cuit, cliente_telefono,
          cliente_email, cliente_direccion, fecha_emision, fecha_servicio, validez_dias,
          estado, condiciones_pago, observaciones, subtotal, descuento, total, creado_por
        ) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.cliente_empresa,
        data.cliente_contacto,
        data.cliente_cuit,
        data.cliente_telefono,
        data.cliente_email,
        data.cliente_direccion,
        data.fecha_emision,
        data.fecha_servicio || null,
        data.validez_dias,
        data.estado,
        data.condiciones_pago,
        data.observaciones,
        data.subtotal,
        data.descuento,
        data.total,
        actorId || null
      );

    const id = Number(result.lastInsertRowid);
    db.prepare('UPDATE cotizaciones SET numero = ? WHERE id = ?').run(
      numeroCotizacion(id, data.fecha_emision),
      id
    );
    guardarItems(db, id, data.items);
    return hidratarCotizacion(db, id);
  })();
}

function actualizarCotizacion(db, id, payload) {
  const actual = hidratarCotizacion(db, id);
  if (!actual) return null;
  const data = normalizarCotizacion(payload);

  return db.transaction(() => {
    db.prepare(
      `UPDATE cotizaciones SET
        cliente_empresa = ?, cliente_contacto = ?, cliente_cuit = ?, cliente_telefono = ?,
        cliente_email = ?, cliente_direccion = ?, fecha_emision = ?, fecha_servicio = ?,
        validez_dias = ?, estado = ?, condiciones_pago = ?, observaciones = ?,
        subtotal = ?, descuento = ?, total = ?, actualizado_en = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      data.cliente_empresa,
      data.cliente_contacto,
      data.cliente_cuit,
      data.cliente_telefono,
      data.cliente_email,
      data.cliente_direccion,
      data.fecha_emision,
      data.fecha_servicio || null,
      data.validez_dias,
      data.estado,
      data.condiciones_pago,
      data.observaciones,
      data.subtotal,
      data.descuento,
      data.total,
      id
    );
    db.prepare('DELETE FROM cotizacion_items WHERE cotizacion_id = ?').run(id);
    guardarItems(db, id, data.items);
    return hidratarCotizacion(db, id);
  })();
}

module.exports = {
  ESTADOS,
  normalizarCotizacion,
  numeroCotizacion,
  hidratarCotizacion,
  crearCotizacion,
  actualizarCotizacion,
};
