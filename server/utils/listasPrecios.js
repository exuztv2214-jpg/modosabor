/**
 * Listas de precios: el precio efectivo según por dónde se venda.
 *
 * ── El problema ────────────────────────────────────────────────────────────
 *
 * La misma milanesa puede valer $10.500 en el mostrador y $11.500 por delivery.
 * No es un capricho: el envío propio cuesta plata y el precio de mostrador no
 * tiene por qué subsidiarlo. Fudo lo resuelve con "listas de precios" en su plan
 * Pro; hasta ahora acá había un solo `productos.precio` para todo.
 *
 * ── Cómo funciona ──────────────────────────────────────────────────────────
 *
 * Una lista guarda **sólo las excepciones**. Si un producto no figura en la
 * lista, vale su precio normal.
 *
 * Eso importa: la alternativa sería copiar los 94 precios a cada lista, y
 * entonces subir un precio obligaría a acordarse de subirlo en todos lados. El
 * día que alguien se olvide, el delivery vende a precio viejo y nadie se entera
 * hasta que no cierran los números.
 *
 * ── Un solo lugar ──────────────────────────────────────────────────────────
 *
 * Todo el sistema pregunta el precio por acá. La web, el TPV, el agente de
 * WhatsApp y el validador de pedidos públicos usan la misma función, así que no
 * puede pasar que la carta muestre un precio y la caja cobre otro.
 *
 * Es el mismo patrón que `menuDiaPricing.js`: ajustar el precio efectivo en un
 * solo punto en vez de repartir la regla por veinte archivos.
 */

const CANALES = ['mostrador', 'delivery', 'web'];

const CLAVE_POR_CANAL = {
  mostrador: 'lista_precios_mostrador',
  delivery: 'lista_precios_delivery',
  web: 'lista_precios_web',
};

/**
 * Qué lista le toca a un canal. Devuelve null si no hay ninguna configurada,
 * que es lo mismo que decir "el precio de siempre".
 */
function listaDelCanal(db, canal) {
  const clave = CLAVE_POR_CANAL[canal];
  if (!clave) return null;
  const fila = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave);
  const id = Number(fila?.valor || 0);
  if (!id) return null;

  // Una lista desactivada no se aplica aunque quedara configurada: apagarla
  // tiene que ser suficiente para volver a los precios normales, sin tener que
  // acordarse de desasignarla de los tres canales.
  const lista = db
    .prepare('SELECT id, nombre FROM listas_precios WHERE id = ? AND activo = 1')
    .get(id);
  return lista || null;
}

/**
 * Los precios especiales de una lista, como Map producto_id → centavos.
 *
 * Una sola consulta para toda la carta, no una por producto: la web pide 94
 * productos de una y 94 consultas serían 94 idas a la base por cada visita.
 */
function preciosDeLista(db, listaId) {
  if (!listaId) return new Map();
  const filas = db
    .prepare('SELECT producto_id, precio FROM producto_precios WHERE lista_id = ?')
    .all(listaId);
  return new Map(filas.map((fila) => [Number(fila.producto_id), Number(fila.precio)]));
}

/**
 * Aplica la lista a una lista de productos.
 *
 * Devuelve copias: la misma fila se reusa en varios lugares y pisarla haría que
 * el precio de delivery se filtre a una consulta de mostrador hecha después.
 *
 * Deja `precio_lista_base` con el precio original. Sirve para mostrar "antes
 * $10.500" y para poder auditar por qué se cobró lo que se cobró.
 */
function aplicarListaDePrecios(db, productos, canal) {
  const lista = listaDelCanal(db, canal);
  if (!lista) return productos;

  const precios = preciosDeLista(db, lista.id);
  if (precios.size === 0) return productos;

  return productos.map((producto) => {
    const especial = precios.get(Number(producto.id));
    if (especial === undefined) return producto;
    return {
      ...producto,
      precio: especial,
      precio_lista_base: Number(producto.precio || 0),
      precio_lista_nombre: lista.nombre,
    };
  });
}

/**
 * El precio de un solo producto en un canal.
 *
 * Para cuando ya se tiene la fila y sólo hace falta el número: cotizar un ítem,
 * validar un pedido público, responderle un precio al agente de WhatsApp.
 */
function precioParaCanal(db, producto, canal) {
  if (!producto) return 0;
  const [conPrecio] = aplicarListaDePrecios(db, [producto], canal);
  return Number(conPrecio?.precio || 0);
}

/**
 * De qué canal es un pedido, a partir de cómo entró.
 *
 * `tipo_entrega` manda sobre `origen`: un pedido de delivery cargado a mano en
 * el TPV sigue siendo delivery y le corresponde el precio de delivery. Lo que
 * define el precio es cómo se entrega, no quién lo tipeó.
 */
function canalDePedido({ tipo_entrega: tipoEntrega, origen } = {}) {
  const tipo = String(tipoEntrega || '').toLowerCase();
  if (tipo === 'delivery') return 'delivery';
  if (String(origen || '').toLowerCase() === 'web') return 'web';
  return 'mostrador';
}

module.exports = {
  CANALES,
  CLAVE_POR_CANAL,
  listaDelCanal,
  preciosDeLista,
  aplicarListaDePrecios,
  precioParaCanal,
  canalDePedido,
};
