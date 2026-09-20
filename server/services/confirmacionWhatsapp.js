const { createHash } = require('crypto');
const { formatMoney, getDeliveryInfo, quoteProduct } = require('../utils/systemClient');
const { crearCarritoWhatsapp } = require('./carritoWhatsapp');

function estado(db, telefono) {
  const carrito = crearCarritoWhatsapp(db).verCarrito(telefono);
  if (!carrito.abierto || !carrito.items.length) {
    throw new Error('No hay un pedido abierto para resumir');
  }
  const {
    id,
    cliente_nombre,
    cliente_direccion,
    tipo_entrega,
    metodo_pago,
    notas,
    hora_entrega,
    items,
  } = carrito;
  const productos = items.map((item) => {
    const opciones = [
      ...Object.values(item.variantes || {}).map((v) => (typeof v === 'string' ? v : v.nombre)),
      ...(item.extras || []).map((v) => (typeof v === 'string' ? v : v.nombre)),
      item.descripcion,
    ]
      .filter(Boolean)
      .join(' ');
    const quote = quoteProduct(db, `${item.nombre} ${opciones}`);
    return {
      catalogo: db
        .prepare('SELECT id, precio, variantes, extras, activo FROM productos WHERE id = ?')
        .get(item.producto_id),
      precioActual: quote.price_total,
      estado: quote.status,
    };
  });
  const datos = {
    id,
    cliente_nombre,
    cliente_direccion,
    tipo_entrega,
    metodo_pago,
    notas,
    hora_entrega,
    items: items.map(
      ({ id, producto_id, nombre, cantidad, precio_unitario, descripcion, variantes, extras }) => ({
        id,
        producto_id,
        nombre,
        cantidad,
        precio_unitario,
        descripcion,
        variantes,
        extras,
      })
    ),
    productos,
    envio: tipo_entrega === 'retiro' ? null : getDeliveryInfo(db, cliente_direccion),
  };
  return {
    carrito,
    datos,
    huella: createHash('sha256').update(JSON.stringify(datos)).digest('hex'),
  };
}

function preparar(db, telefono) {
  const { carrito, datos, huella } = estado(db, telefono);
  if (!carrito.cliente_nombre?.trim()) {
    throw new Error('Pedile el nombre al cliente y guardalo antes de resumir');
  }
  if (
    carrito.tipo_entrega !== 'retiro' &&
    (!carrito.cliente_direccion?.trim() || !datos.envio?.available || datos.envio?.pending)
  ) {
    throw new Error(
      'Falta validar la dirección de entrega; consultá el envío o derivá a una persona'
    );
  }
  const envio = Number(datos.envio?.costo_envio || 0);
  const subtotal = carrito.items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);
  const lineas = carrito.items.map((i) => {
    const opciones = [
      ...Object.values(i.variantes || {}).map((v) => (typeof v === 'string' ? v : v.nombre)),
      ...(i.extras || []).map((v) => (typeof v === 'string' ? v : v.nombre)),
      i.descripcion,
    ]
      .filter(Boolean)
      .join(', ');
    const cotizado = quoteProduct(db, `${i.nombre} ${opciones}`);
    if (cotizado.status !== 'ok' || Number(cotizado.price_total) !== Number(i.precio_unitario)) {
      throw new Error(
        'Cambió el precio o la disponibilidad: volvé a cotizar el ítem antes de resumir'
      );
    }
    return `- ${i.cantidad} × ${i.nombre}${opciones ? ` (${opciones})` : ''}: ${formatMoney(i.cantidad * i.precio_unitario)}`;
  });
  const texto = [
    `Resumen del pedido para ${carrito.cliente_nombre}:`,
    ...lineas,
    carrito.tipo_entrega === 'retiro'
      ? `Retiro en el local${carrito.hora_entrega ? ` a las ${carrito.hora_entrega}` : ''}.`
      : `Entrega${carrito.hora_entrega ? ` a las ${carrito.hora_entrega}` : ''}: ${carrito.cliente_direccion}. Envío: ${formatMoney(envio)}.`,
    ...(carrito.notas ? [`Notas: ${carrito.notas}`] : []),
    `Total: ${formatMoney(subtotal + envio)}.`,
    '¿Confirmás el pedido?',
  ].join('\n');
  db.prepare(
    `INSERT INTO whatsapp_confirmaciones (telefono,borrador_id,huella,texto,enviada) VALUES (?,?,?,?,0)
    ON CONFLICT(telefono) DO UPDATE SET borrador_id=excluded.borrador_id,huella=excluded.huella,texto=excluded.texto,enviada=0,creado_en=CURRENT_TIMESTAMP`
  ).run(telefono, carrito.id, huella, texto);
  return { texto };
}

function marcarEnviada(db, telefono, texto) {
  db.prepare('UPDATE whatsapp_confirmaciones SET enviada = 1 WHERE telefono = ? AND texto = ?').run(
    telefono,
    texto
  );
}

function validar(db, telefono) {
  const confirmacion = db
    .prepare(
      "SELECT * FROM whatsapp_confirmaciones WHERE telefono = ? AND enviada = 1 AND creado_en >= datetime('now','-30 minutes')"
    )
    .get(telefono);
  if (!confirmacion || confirmacion.huella !== estado(db, telefono).huella) {
    throw new Error(
      'El pedido cambió o falta el resumen enviado: usá preparar_confirmacion y esperá un nuevo sí'
    );
  }
}

module.exports = { preparar, marcarEnviada, validar, estado };
