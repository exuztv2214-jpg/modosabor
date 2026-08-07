export function safeParseArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function getPresentationPrices(producto) {
  const variantes = safeParseArray(producto?.variantes);
  const presentacion = variantes.find((group) => normalizeText(group?.nombre) === 'presentacion');
  if (!presentacion || !Array.isArray(presentacion.opciones) || presentacion.opciones.length === 0)
    return [];

  return presentacion.opciones.map((option) => ({
    nombre: option?.nombre || '',
    finalPrice: Number(producto?.precio || 0) + Number(option?.precio_extra || 0),
  }));
}

export function getPrimaryDisplayPrice(producto) {
  const basePrice = Number(producto?.precio || 0);
  const variantes = safeParseArray(producto?.variantes);

  const preferredGroups = [
    { group: 'presentacion', option: 'entera cremoso', label: 'Entera Cremoso' },
    { group: 'presentacion', option: 'entera', label: 'Entera' },
    { group: 'presentacion', option: 'docena', label: 'Docena' },
    { group: 'tipo', option: 'ternera', label: 'Carne' },
    { group: 'tipo', option: 'carne', label: 'Carne' },
  ];

  for (const preferred of preferredGroups) {
    const group = variantes.find((item) => normalizeText(item?.nombre) === preferred.group);
    const option = (group?.opciones || []).find(
      (item) => normalizeText(item?.nombre) === preferred.option
    );
    if (option) {
      return {
        price: basePrice + Number(option?.precio_extra || 0),
        label: preferred.label,
      };
    }
  }

  return {
    price: basePrice,
    label: '',
  };
}

export function getStructuredDisplayPrices(producto) {
  const basePrice = Number(producto?.precio || 0);
  const variantes = safeParseArray(producto?.variantes);

  const configs = [
    {
      group: 'presentacion',
      title: 'Presentacion',
      options: [
        { option: 'entera', label: 'Entera' },
        { option: 'mitad', label: 'Mitad' },
      ],
    },
    {
      group: 'presentacion',
      title: 'Presentacion',
      options: [
        { option: 'docena', label: 'Docena' },
        { option: 'media docena', label: 'Media' },
      ],
    },
    {
      group: 'tipo',
      title: 'Tipo',
      options: [
        { option: 'ternera', label: 'Carne' },
        { option: 'pollo', label: 'Pollo' },
      ],
    },
    {
      group: 'tipo',
      title: 'Tipo',
      options: [
        { option: 'carne', label: 'Carne' },
        { option: 'pollo', label: 'Pollo' },
      ],
    },
  ];

  for (const config of configs) {
    const group = variantes.find((item) => normalizeText(item?.nombre) === config.group);
    if (!group) continue;

    const resolved = config.options
      .map((entry) => {
        const option = (group?.opciones || []).find(
          (item) => normalizeText(item?.nombre) === entry.option
        );
        if (!option) return null;
        return {
          label: entry.label,
          price: basePrice + Number(option?.precio_extra || 0),
          optionName: option?.nombre || entry.label,
        };
      })
      .filter(Boolean);

    if (resolved.length >= 2) {
      return {
        title: config.title,
        items: resolved,
      };
    }
  }

  return {
    title: '',
    items: [],
  };
}

export function createEmptyCustomer() {
  return {
    id: null,
    nombre: '',
    telefono: '',
    direccion: '',
    codigo_tarjeta: '',
    puntos: 0,
    recompensas_pendientes: 0,
    sellos_actuales: 0,
    nivel: 'Bronce',
    latitud: null,
    longitud: null,
    direccion_barrio_id: null,
    direccion_barrio_nombre: '',
    direccion_manzana_id: null,
    direccion_manzana: '',
    direccion_casa: '',
  };
}

export function createDeliveryQuoteState({
  tipoEntrega = 'delivery',
  config = {},
  overrides = {},
} = {}) {
  const base =
    tipoEntrega === 'delivery'
      ? {
          costo_envio: 0,
          tiempo_estimado_min: Number(config.tiempo_delivery || 30),
          zone_name: '',
          available: false,
          pending: false,
          message: 'Completa la direccion para calcular envio.',
        }
      : {
          costo_envio: 0,
          tiempo_estimado_min: Number(config.tiempo_retiro || 20),
          zone_name: '',
          available: true,
          pending: false,
          message: '',
        };

  return {
    ...base,
    ...overrides,
  };
}

export function calculatePedidoSummary({
  items = [],
  tipoEntrega = 'delivery',
  deliveryQuote = {},
  descuento = 0,
  descuentoTipo = 'monto',
  descuentoFijo = null,
  descuentoPuntos = 0,
  metodoPago = 'efectivo',
  efectivoRecibido = '',
  cashTarget = null,
} = {}) {
  const subtotal = (items || []).reduce(
    (sum, item) => sum + Number(item.precio_unitario || 0) * Number(item.cantidad || 0),
    0
  );
  const envio = tipoEntrega === 'delivery' ? Number(deliveryQuote?.costo_envio || 0) : 0;
  const totalItems = (items || []).reduce((sum, item) => sum + Number(item.cantidad || 0), 0);

  const descuentoNumero = Math.max(0, Number(descuento || 0));
  const descuentoAplicado =
    descuentoFijo !== null && descuentoFijo !== undefined
      ? Math.min(Number(descuentoFijo || 0), subtotal + envio)
      : descuentoTipo === 'porcentaje'
        ? Math.min(subtotal + envio, ((subtotal + envio) * Math.min(descuentoNumero, 100)) / 100)
        : Math.min(descuentoNumero, subtotal + envio);

  /*
    Los puntos van aparte del descuento manual.

    Si se sumaran antes, con un descuento por porcentaje la cuenta saldría mal:
    el 10% se aplicaría también sobre el valor de los puntos, que ya es plata
    descontada.

    El tope es lo que queda por pagar: aunque el cliente tenga puntos de sobra,
    el total nunca baja de cero. El servidor hace el mismo tope y sólo descuenta
    los puntos que hicieron falta.
  */
  const descuentoDePuntos = Math.min(
    Math.max(0, Number(descuentoPuntos || 0)),
    Math.max(0, subtotal + envio - descuentoAplicado)
  );

  const total = Math.max(0, subtotal + envio - descuentoAplicado - descuentoDePuntos);
  const efectivoRecibidoNumero = Number(efectivoRecibido || 0);
  const vueltoTarget =
    cashTarget !== null && cashTarget !== undefined
      ? Math.max(0, Number(cashTarget || 0))
      : metodoPago === 'efectivo'
        ? total
        : 0;
  const vuelto = vueltoTarget > 0 ? Math.max(0, efectivoRecibidoNumero - vueltoTarget) : 0;

  return {
    subtotal,
    envio,
    totalItems,
    descuentoDePuntos,
    descuentoNumero,
    descuentoAplicado,
    total,
    efectivoRecibidoNumero,
    vuelto,
  };
}

export function getTpvSubmitError({
  items = [],
  tipoEntrega = 'delivery',
  cliente = {},
  deliveryQuote = {},
  mesa = '',
  metodoPago = 'efectivo',
  efectivoRecibido = '',
  efectivoRecibidoNumero = 0,
  total = 0,
  cashTarget = null,
  splitPayments = [],
} = {}) {
  if (!items.length) return 'Agrega productos al pedido';
  if (tipoEntrega === 'delivery' && !cliente?.nombre) return 'Nombre requerido para delivery';
  if (tipoEntrega === 'delivery' && !cliente?.direccion) return 'Direccion requerida para delivery';
  if (tipoEntrega === 'delivery' && deliveryQuote?.pending)
    return 'Espera a que se calcule el envio';
  if (tipoEntrega === 'delivery' && deliveryQuote?.available === false) {
    return deliveryQuote?.message || 'La direccion no pertenece a una zona valida';
  }
  if (tipoEntrega === 'mesa' && !String(mesa || '').trim()) return 'Mesa requerida para salon';
  if (splitPayments.length > 0) {
    const splitTotal = splitPayments.reduce((sum, item) => sum + Number(item.monto || 0), 0);
    if (Math.abs(splitTotal - Number(total || 0)) > 0.5) {
      return 'El cobro mixto debe completar el total exacto';
    }
  }
  const efectivoObjetivo =
    cashTarget !== null && cashTarget !== undefined
      ? Number(cashTarget || 0)
      : metodoPago === 'efectivo'
        ? Number(total || 0)
        : 0;
  if (efectivoObjetivo > 0) {
    if (!String(efectivoRecibido ?? '').trim()) return 'Ingresa el efectivo recibido';
    if (efectivoRecibidoNumero < efectivoObjetivo)
      return 'El efectivo recibido no alcanza el total';
  }
  return '';
}

export function buildPedidoPayload({
  customer = {},
  items = [],
  summary = {},
  tipoEntrega = 'delivery',
  mesa = '',
  horaEntrega = '',
  metodoPago = 'efectivo',
  notas = '',
  origen = 'web',
  repartidorId = undefined,
  extra = {},
} = {}) {
  const normalizedItems = (items || []).map((item) => ({
    producto_id: item.producto_id ?? null,
    nombre: item.nombre || '',
    cantidad: Number(item.cantidad || 0),
    precio_unitario: Number(item.precio_unitario || 0),
    variantes: item.variantes || {},
    extras: item.extras || [],
    descripcion: item.descripcion || '',
  }));

  return {
    cliente_id: customer?.id ?? null,
    cliente_nombre: customer?.nombre || '',
    cliente_telefono: customer?.telefono || '',
    cliente_direccion: customer?.direccion || '',
    cliente_latitud: customer?.latitud ?? null,
    cliente_longitud: customer?.longitud ?? null,
    cliente_ubicacion_exacta: Boolean(customer?.ubicacionExacta),
    direccion_barrio_id: customer?.direccion_barrio_id ?? null,
    direccion_barrio_nombre: customer?.direccion_barrio_nombre || '',
    direccion_manzana_id: customer?.direccion_manzana_id ?? null,
    direccion_manzana: customer?.direccion_manzana || '',
    direccion_casa: customer?.direccion_casa || '',
    direccion_estructurada: customer?.direccion_barrio_id
      ? {
          barrio_id: customer.direccion_barrio_id,
          barrio_nombre: customer.direccion_barrio_nombre || '',
          manzana_id: customer.direccion_manzana_id ?? null,
          manzana: customer.direccion_manzana || '',
          casa: customer.direccion_casa || '',
        }
      : undefined,
    items: JSON.stringify(normalizedItems),
    subtotal: Number(summary.subtotal || 0),
    costo_envio: Number(summary.envio || 0),
    descuento: Number(summary.descuentoAplicado || 0),
    total: Number(summary.total || 0),
    tipo_entrega: tipoEntrega,
    mesa,
    hora_entrega: String(horaEntrega || '').trim(),
    metodo_pago: metodoPago,
    notas,
    origen,
    repartidor_id: repartidorId,
    ...extra,
  };
}
