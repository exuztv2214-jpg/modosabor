const defaultDb = require('../db');
const { getConfigMap } = require('../utils/mercadoPago');
const { getCurrentShiftInfo } = require('../utils/shifts');
const {
  getBusinessInfo,
  getMenuOverview,
  getMenuDiaToday,
  getProductOptionsDetail,
  quoteProduct,
  getDeliveryInfo,
  getCustomerSnapshot,
  getCurrentOrderSnapshot,
  comparablePhone,
} = require('../utils/systemClient');
const {
  HERRAMIENTAS: HERRAMIENTAS_PANEL,
  ejecutarHerramienta,
} = require('./asistenteHerramientas');
const { ACCIONES, prepararAccion } = require('./asistenteAcciones');
const { crearCarritoWhatsapp } = require('./carritoWhatsapp');

const PERMISOS_CLIENTE = new Set([
  'READ_MENU',
  'READ_STOCK',
  'READ_CUSTOMER',
  'READ_ORDER',
  'WRITE_CART',
  'CREATE_ORDER',
  'HANDOFF',
]);

const schemaVacio = { type: 'object', properties: {} };
const schemaVariantes = {
  type: 'array',
  description: 'Opciones elegidas, indicando grupo y nombre exactos del catálogo.',
  items: {
    type: 'object',
    properties: { grupo: { type: 'string' }, nombre: { type: 'string' } },
    required: ['grupo', 'nombre'],
  },
};
const schemaExtras = {
  type: 'array',
  items: { type: 'object', properties: { nombre: { type: 'string' } }, required: ['nombre'] },
};
const schemaTexto = (nombre, descripcion) => ({
  type: 'object',
  properties: { [nombre]: { type: 'string', description: descripcion } },
  required: [nombre],
});

function telefonoSeguro(args, contexto) {
  const telefono = String(contexto?.telefono || '').trim();
  const solicitado = String(args?.telefono || '').trim();
  if (!telefono) throw new Error('Falta el teléfono de la conversación');
  if (solicitado && comparablePhone(solicitado) !== comparablePhone(telefono)) {
    throw new Error('No se puede consultar otro cliente');
  }
  return telefono;
}

function textoComparable(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/*
  La IA no decide por sí sola cuándo un "sí" crea un pedido. Ese mensaje
  también puede estar confirmando una dirección, una variante o una bebida.
  La escritura se habilita únicamente cuando Chispita acaba de presentar el
  resumen y pidió confirmación de forma explícita.
*/
function esConfirmacionNatural(texto) {
  const normalizado = textoComparable(texto);
  return /^(?:si(?: dale| confirmo| confirmalo)?|confirmo|confirmar|confirmalo|dale|dale nomas|ok|okay|de una|mandalo|mandale|listo|esta bien|correcto)(?: por favor| por fa| porfa| gracias)?$/.test(
    normalizado
  );
}

function pidioConfirmacionExplicita(texto) {
  const normalizado = textoComparable(texto);
  if (!normalizado) return false;
  const mencionaPedido =
    /\b(?:pedido|resumen)\b/.test(normalizado) &&
    /\btotal\b/.test(normalizado) &&
    /\d/.test(normalizado);
  const pideConfirmar =
    /\bconfirm(?:a|ame|as|amos)\b/.test(normalizado) ||
    /\b(?:lo mando|lo mandamos|lo envio|lo enviamos|queda asi|esta todo bien)\b/.test(normalizado);
  return mencionaPedido && pideConfirmar;
}

function exigirConfirmacionPedido(contexto = {}) {
  if (!esConfirmacionNatural(contexto.mensajeActual)) {
    throw new Error('El cliente todavía no confirmó el resumen del pedido');
  }
  if (!pidioConfirmacionExplicita(contexto.ultimoMensajeAsistente)) {
    throw new Error('Primero hay que enviar el resumen completo y pedir confirmación');
  }
}

const HERRAMIENTAS_BASE = [
  {
    nombre: 'preparar_confirmacion',
    descripcion:
      'Genera el resumen exacto listo para enviar al cliente. Usar antes de pedir confirmación; termina este turno.',
    parametros: schemaVacio,
    permiso: 'WRITE_CART',
    escribe: true,
    ejecutar: (_args, contexto = {}) =>
      require('./confirmacionWhatsapp').preparar(
        contexto.db || defaultDb,
        telefonoSeguro({}, contexto)
      ),
  },
  {
    nombre: 'consultar_estado',
    descripcion: 'Consulta negocio, turno y horarios vigentes.',
    parametros: schemaVacio,
    permiso: 'READ_MENU',
    escribe: false,
    ejecutar: (_args, { db = defaultDb } = {}) => {
      const turno = getCurrentShiftInfo(getConfigMap(db));
      return { negocio: getBusinessInfo(db), ...turno };
    },
  },
  {
    nombre: 'consultar_menu',
    descripcion: 'Consulta el catálogo real, opcionalmente por categoría.',
    parametros: schemaTexto('categoria', 'Categoría opcional; vacío trae la carta.'),
    permiso: 'READ_MENU',
    escribe: false,
    ejecutar: (args, { db = defaultDb } = {}) =>
      getMenuOverview(db, { categoryQuery: args?.categoria || '' }),
  },
  {
    nombre: 'consultar_menu_dia',
    descripcion: 'Consulta solamente el menú del día vigente.',
    parametros: schemaVacio,
    permiso: 'READ_MENU',
    escribe: false,
    ejecutar: (_args, { db = defaultDb } = {}) => getMenuDiaToday(db),
  },
  {
    nombre: 'consultar_producto',
    descripcion: 'Consulta variantes y extras de un producto por id.',
    parametros: {
      type: 'object',
      properties: { producto_id: { type: 'integer' } },
      required: ['producto_id'],
    },
    permiso: 'READ_MENU',
    escribe: false,
    ejecutar: (args, { db = defaultDb } = {}) => getProductOptionsDetail(db, args.producto_id),
  },
  {
    nombre: 'cotizar_item',
    descripcion: 'Cotiza contra catálogo y stock reales; el modelo no fija el precio.',
    parametros: schemaTexto('query', 'Descripción exacta del producto solicitado.'),
    permiso: 'READ_STOCK',
    escribe: false,
    ejecutar: (args, { db = defaultDb } = {}) => quoteProduct(db, args.query),
  },
  {
    nombre: 'cotizar_envio',
    descripcion: 'Valida la dirección y devuelve costo y zona de envío.',
    parametros: schemaTexto('direccion', 'Dirección del cliente.'),
    permiso: 'READ_MENU',
    escribe: false,
    ejecutar: (args, { db = defaultDb } = {}) => getDeliveryInfo(db, args.direccion),
  },
  {
    nombre: 'consultar_cliente',
    descripcion: 'Consulta solamente la ficha del teléfono de esta conversación.',
    parametros: schemaVacio,
    permiso: 'READ_CUSTOMER',
    escribe: false,
    ejecutar: (args, contexto = {}) =>
      getCustomerSnapshot(contexto.db || defaultDb, telefonoSeguro(args, contexto)),
  },
  {
    nombre: 'consultar_pedido_actual',
    descripcion: 'Consulta el pedido más reciente del teléfono de esta conversación.',
    parametros: schemaVacio,
    permiso: 'READ_ORDER',
    escribe: false,
    ejecutar: (args, contexto = {}) =>
      getCurrentOrderSnapshot(contexto.db || defaultDb, telefonoSeguro(args, contexto)),
  },
  {
    nombre: 'derivar_a_persona',
    descripcion: 'Detiene la IA y deriva esta conversación a una persona.',
    parametros: schemaTexto('motivo', 'Motivo breve de la derivación.'),
    permiso: 'HANDOFF',
    escribe: true,
    ejecutar: (args, contexto = {}) => {
      const db = contexto.db || defaultDb;
      const telefono = telefonoSeguro(args, contexto);
      const result = db
        .prepare(
          `UPDATE whatsapp_conversaciones SET bot_silenciado = 1, escalado_humano = 1,
           bot_silenciado_hasta = NULL, ultimo_estado = 'esperando_humano',
           ultimo_contexto = ?, actualizado_en = CURRENT_TIMESTAMP WHERE telefono = ?`
        )
        .run(String(args?.motivo || 'Derivación solicitada').slice(0, 300), telefono);
      if (!result.changes) throw new Error('No se encontró la conversación');
      return { ok: true, estado: 'esperando_humano' };
    },
  },
  {
    nombre: 'ver_carrito',
    descripcion: 'Muestra el pedido en preparación con ids de cada unidad.',
    parametros: schemaVacio,
    permiso: 'WRITE_CART',
    escribe: false,
    ejecutar: (_args, contexto = {}) =>
      crearCarritoWhatsapp(contexto.db || defaultDb).verCarrito(telefonoSeguro({}, contexto)),
  },
  {
    nombre: 'agregar_item',
    descripcion: 'Agrega una unidad cotizada contra el catálogo real.',
    parametros: {
      type: 'object',
      properties: {
        producto_id: { type: 'integer' },
        cantidad: { type: 'integer' },
        variantes: schemaVariantes,
        extras: schemaExtras,
        notas: { type: 'string' },
      },
      required: ['producto_id'],
    },
    permiso: 'WRITE_CART',
    escribe: true,
    ejecutar: (args, contexto = {}) =>
      crearCarritoWhatsapp(contexto.db || defaultDb).agregarItem(
        telefonoSeguro({}, contexto),
        args
      ),
  },
  {
    nombre: 'quitar_item',
    descripcion: 'Quita una unidad concreta por itemId.',
    parametros: {
      type: 'object',
      properties: { itemId: { type: 'integer' } },
      required: ['itemId'],
    },
    permiso: 'WRITE_CART',
    escribe: true,
    ejecutar: (args, contexto = {}) =>
      crearCarritoWhatsapp(contexto.db || defaultDb).quitarItem(
        telefonoSeguro({}, contexto),
        args.itemId
      ),
  },
  {
    nombre: 'modificar_item',
    descripcion: 'Modifica una unidad concreta por itemId y vuelve a cotizarla.',
    parametros: {
      type: 'object',
      properties: {
        itemId: { type: 'integer' },
        cantidad: { type: 'integer' },
        variantes: schemaVariantes,
        extras: schemaExtras,
        notas: { type: 'string' },
      },
      required: ['itemId'],
    },
    permiso: 'WRITE_CART',
    escribe: true,
    ejecutar: (args, contexto = {}) => {
      const { itemId, ...cambios } = args;
      return crearCarritoWhatsapp(contexto.db || defaultDb).modificarItem(
        telefonoSeguro({}, contexto),
        itemId,
        cambios
      );
    },
  },
  {
    nombre: 'vaciar_carrito',
    descripcion: 'Vacía el pedido en preparación sin tocar pedidos confirmados.',
    parametros: schemaVacio,
    permiso: 'WRITE_CART',
    escribe: true,
    ejecutar: (_args, contexto = {}) =>
      crearCarritoWhatsapp(contexto.db || defaultDb).vaciarCarrito(telefonoSeguro({}, contexto)),
  },
  {
    nombre: 'actualizar_datos_pedido',
    descripcion:
      'Guarda datos declarados por este cliente para el carrito actual: nombre, dirección, pago o notas. El nombre sólo se usa si el cliente lo dijo explícitamente.',
    parametros: {
      type: 'object',
      properties: {
        cliente_nombre: { type: 'string' },
        cliente_direccion: { type: 'string' },
        tipo_entrega: { type: 'string', enum: ['delivery', 'retiro'] },
        metodo_pago: { type: 'string', enum: ['efectivo', 'transferencia'] },
        notas: { type: 'string' },
      },
    },
    permiso: 'WRITE_CART',
    escribe: true,
    ejecutar: (args, contexto = {}) =>
      crearCarritoWhatsapp(contexto.db || defaultDb).actualizarDatos(
        telefonoSeguro({}, contexto),
        args
      ),
  },
  {
    nombre: 'crear_pedido',
    descripcion: 'Confirma una sola vez el carrito actual con precios del servidor.',
    parametros: schemaVacio,
    permiso: 'CREATE_ORDER',
    escribe: true,
    ejecutar: (_args, contexto = {}) => {
      exigirConfirmacionPedido(contexto);
      if (
        contexto.confirmacionSegura &&
        crearCarritoWhatsapp(contexto.db || defaultDb).verCarrito(telefonoSeguro({}, contexto))
          .abierto
      ) {
        require('./confirmacionWhatsapp').validar(
          contexto.db || defaultDb,
          telefonoSeguro({}, contexto)
        );
      }
      return crearCarritoWhatsapp(contexto.db || defaultDb).confirmarCarrito(
        telefonoSeguro({}, contexto),
        { whatsappMessageId: contexto.mensajeId },
        contexto.dependenciasPedido || {}
      );
    },
  },
];

function herramientasParaPerfil(perfil, contexto = {}) {
  if (perfil === 'cliente') {
    const permisos = new Set(contexto.permisos || PERMISOS_CLIENTE);
    return HERRAMIENTAS_BASE.filter((h) => permisos.has(h.permiso));
  }
  if (perfil !== 'dueño') return [];

  const consultasPanel = HERRAMIENTAS_PANEL.map((h) => ({
    nombre: h.nombre,
    descripcion: h.descripcion,
    parametros: h.parametros,
    permiso: 'READ_ORDER',
    escribe: false,
    ejecutar: (args) => ejecutarHerramienta(h.nombre, args),
  }));
  const acciones = contexto.puedeModificar
    ? ACCIONES.filter(
        (a) => contexto.puedeReparar || !a.nombre.includes('ajustar_stock_negativo')
      ).map((a) => ({
        nombre: a.nombre,
        descripcion: a.descripcion,
        parametros: a.parametros,
        permiso: contexto.puedeReparar ? 'CANCEL_ORDER' : 'WRITE_CART',
        escribe: true,
        ejecutar: (args) => prepararAccion(a.nombre, args),
      }))
    : [];
  return [...HERRAMIENTAS_BASE, ...consultasPanel, ...acciones];
}

function catalogoParaPerfil(perfil, contexto = {}) {
  return herramientasParaPerfil(perfil, contexto).map(
    ({ nombre, descripcion, parametros, permiso, escribe }) => ({
      nombre,
      descripcion,
      parametros,
      permiso,
      escribe,
    })
  );
}

async function ejecutarRegistrada(nombre, args, contexto = {}, perfil = 'cliente') {
  if (['agregar_item', 'modificar_item'].includes(nombre) && Array.isArray(args?.variantes)) {
    args = {
      ...args,
      variantes: Object.fromEntries(args.variantes.map((opcion) => [opcion.grupo, opcion.nombre])),
    };
  }
  const herramienta = herramientasParaPerfil(perfil, contexto).find(
    (item) => item.nombre === nombre
  );
  if (!herramienta) throw new Error(`Herramienta no permitida: ${nombre}`);
  return herramienta.ejecutar(args || {}, contexto);
}

module.exports = {
  HERRAMIENTAS_BASE,
  PERMISOS_CLIENTE,
  esConfirmacionNatural,
  pidioConfirmacionExplicita,
  exigirConfirmacionPedido,
  telefonoSeguro,
  herramientasParaPerfil,
  catalogoParaPerfil,
  ejecutarRegistrada,
};
