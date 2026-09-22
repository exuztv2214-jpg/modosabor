const db = require('../db');
const { listasPorProducto, mezclarListas } = require('../utils/opcionesCompartidas');
const { applyMenuDiaPricing } = require('../utils/menuDiaPricing');
const { aplicarListaDePrecios } = require('../utils/listasPrecios');
const { hoyArgentina } = require('../utils/fechaLocal');
const { categoriasVisibles } = require('../utils/catalogVisibility');

/**
 * Recálculo de precios del lado del servidor.
 *
 * ── El agujero que cierra ──────────────────────────────────────────────────
 *
 * El pedido público se creaba con el `precio_unitario` que mandaba el
 * navegador. El schema aceptaba cualquier número no negativo y nada lo
 * contrastaba contra la base, así que el total salía de un dato que el cliente
 * controla por completo.
 *
 * En la práctica: abrir las herramientas del navegador, copiar el pedido como
 * `fetch`, cambiar el precio a 1 y mandarlo. El pedido entraba a cocina como
 * cualquier otro, con el envío gratis y pago en efectivo. No hacía falta saber
 * programar.
 *
 * ── Qué hace ───────────────────────────────────────────────────────────────
 *
 * Para cada ítem busca el producto en la base y arma el precio de cero:
 *
 *   precio del producto  +  extras de las variantes elegidas  +  extras sueltos
 *
 * Las variantes y los extras también se validan: si el cliente manda una opción
 * que el producto no tiene, se rechaza el pedido en lugar de cobrarla en cero.
 *
 * ── Qué NO toca ────────────────────────────────────────────────────────────
 *
 * Sólo corre en los flujos públicos (web, canal público, agente de WhatsApp).
 * El TPV está detrás de login y a veces necesita precios a mano —un ajuste, un
 * plato que no está en la carta—, así que aplicarle esta regla le rompería la
 * caja al equipo.
 *
 * ── Unidades ───────────────────────────────────────────────────────────────
 *
 * La columna `productos.precio` guarda centavos, y los ítems del pedido ya
 * vienen escalados a centavos por `scalePedidoItemsToStorage`. Los dos lados
 * hablan la misma unidad, así que acá no se convierte nada.
 */

function textoNormalizado(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function parsearJson(valor, porDefecto) {
  if (!valor) return porDefecto;
  if (typeof valor === 'object') return valor;
  try {
    const parsed = JSON.parse(valor);
    return parsed ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

class PrecioInvalidoError extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'PrecioInvalidoError';
    this.status = 400;
  }
}

/**
 * Suma los recargos de las variantes elegidas, validando que existan.
 *
 * `variantesElegidas` llega como { "Guarnición": "Papas" }.
 * `definicion` es lo guardado en el producto:
 *   [{ nombre: "Guarnición", opciones: [{ nombre: "Papas", precio_extra: 0 }] }]
 */
function recargoDeVariantes(variantesElegidas, definicion, nombreProducto) {
  const elegidas =
    variantesElegidas && typeof variantesElegidas === 'object' ? variantesElegidas : {};
  const grupos = Array.isArray(definicion) ? definicion : [];
  let recargo = 0;

  for (const grupo of grupos) {
    if (grupo?.obligatorio !== true && Number(grupo?.obligatorio) !== 1) continue;
    const seleccion = Object.entries(elegidas).find(
      ([nombre]) => textoNormalizado(nombre) === textoNormalizado(grupo?.nombre)
    )?.[1];
    if (!seleccion) {
      throw new PrecioInvalidoError(
        `Elegí una opción de ${grupo?.nombre || 'la variante'} para ${nombreProducto}.`
      );
    }
  }

  for (const [grupoElegido, opcionElegida] of Object.entries(elegidas)) {
    if (!opcionElegida) continue;

    const grupo = grupos.find(
      (g) => textoNormalizado(g?.nombre) === textoNormalizado(grupoElegido)
    );
    if (!grupo) {
      throw new PrecioInvalidoError(
        `La opción "${grupoElegido}" no corresponde a ${nombreProducto}. Actualizá la página y volvé a armar el pedido.`
      );
    }

    const opciones = Array.isArray(grupo.opciones) ? grupo.opciones : [];
    const opcion = opciones.find(
      (o) => textoNormalizado(o?.nombre) === textoNormalizado(opcionElegida)
    );
    if (!opcion) {
      throw new PrecioInvalidoError(
        `"${opcionElegida}" no es una opción válida de ${grupoElegido} en ${nombreProducto}.`
      );
    }

    recargo += Number(opcion.precio_extra || 0);
  }

  return recargo;
}

/** Igual que arriba pero para los extras sueltos: [{ nombre, precio }]. */
function recargoDeExtras(extrasElegidos, definicion, nombreProducto) {
  const elegidos = Array.isArray(extrasElegidos) ? extrasElegidos : [];
  const disponibles = Array.isArray(definicion) ? definicion : [];
  let recargo = 0;

  for (const elegido of elegidos) {
    const nombreExtra = typeof elegido === 'string' ? elegido : elegido?.nombre;
    if (!nombreExtra) continue;

    const extra = disponibles.find(
      (e) => textoNormalizado(e?.nombre) === textoNormalizado(nombreExtra)
    );
    if (!extra) {
      throw new PrecioInvalidoError(
        `El adicional "${nombreExtra}" no está disponible para ${nombreProducto}.`
      );
    }

    recargo += Number(extra.precio ?? extra.precio_extra ?? 0);
  }

  return recargo;
}

/**
 * Devuelve los ítems con el precio recalculado desde la base.
 *
 * @param {Array} items Ítems ya normalizados y escalados a centavos.
 * @param {string} canal 'mostrador' | 'delivery' | 'web'. Decide qué lista de
 *        precios se aplica. **Tiene que ser el mismo canal con el que se le
 *        mostró la carta al cliente**: si la web muestra el precio de delivery
 *        y acá se recalcula con el de mostrador, el cliente ve un número y se
 *        le cobra otro.
 * @returns {Array} Los mismos ítems con `precio_unitario` y `subtotal` reales.
 * @throws {PrecioInvalidoError} Si un producto no existe, está inactivo, o trae
 *         una variante o un adicional que no le corresponde.
 */
function recalcularPreciosPublicos(items, canal = 'mostrador', opciones = {}, baseDatos = db) {
  const lista = Array.isArray(items) ? items : [];
  if (!lista.length) return lista;
  const permitirDescuentoItems = opciones?.permitirDescuentoItems === true;
  const categoriasPermitidas = categoriasVisibles(baseDatos);

  /*
    ── Los descuentos por ítem no existen en el flujo público ─────────────────

    `descuento_item` lo aplica el mozo o el cajero sobre un plato que salió mal.
    Si se aceptara desde la web, cualquiera podría mandar
    `descuento_item: 999999` con las herramientas del navegador y llevarse la
    comida gratis: exactamente el agujero que este archivo vino a cerrar con los
    precios.

    Se pisa a cero en vez de rechazar el pedido: un carrito viejo en caché
    podría traer el campo sin mala intención, y perder la venta por eso sería
    peor que ignorarlo.
  */
  const buscarProducto = baseDatos.prepare(
    `SELECT p.id, p.nombre, p.descripcion, p.precio, p.activo, p.categoria_id, p.variantes, p.extras,
            mdh.precio_economico AS menu_dia_precio_economico,
            mdh.precio_ejecutivo AS menu_dia_precio_ejecutivo
       FROM productos p
       LEFT JOIN menu_dia_historial mdh
         ON mdh.producto_id = p.id AND mdh.fecha = ?
      WHERE p.id = ?`
  );

  /*
    Las guarniciones y los agregados que vienen de una lista compartida no
    están en el JSON del producto, así que sin esto una guarnición perfectamente
    válida se leería como "opción que el producto no tiene" y el pedido se
    rechazaría entero. Se resuelven todas de una, antes del bucle, para no
    consultar las listas una vez por ítem.
  */
  const listasDelPedido = listasPorProducto(
    baseDatos,
    lista.map((item) => Number(item?.producto_id || item?.id || 0))
  );

  return lista.map((item) => {
    const productoId = Number(item?.producto_id || item?.id || 0);

    /*
      Sin `producto_id` no hay contra qué validar. En el flujo público todos
      los ítems salen de la carta, así que uno sin identificar es o un error
      del cliente o un intento de meter algo a mano.
    */
    if (!productoId) {
      throw new PrecioInvalidoError(
        `No pudimos identificar "${item?.nombre || 'uno de los productos'}". Actualizá la página y volvé a armar el pedido.`
      );
    }

    const productoCrudo = buscarProducto.get(hoyArgentina(), productoId);
    /*
      El orden importa: primero la lista de precios sobre el precio base, y
      después el menú del día.

      El menú del día es el precio de hoy para ese plato, decidido esta mañana;
      una lista de canal no tiene por qué pisarlo. Si se aplicara al revés, un
      recargo de delivery le cambiaría el precio al menú del día y el plato del
      día dejaría de valer lo que dice el cartel.
    */
    const productoConLista = productoCrudo
      ? aplicarListaDePrecios(baseDatos, [productoCrudo], canal)[0]
      : null;
    const producto = productoConLista ? applyMenuDiaPricing(productoConLista) : null;
    if (!producto) {
      throw new PrecioInvalidoError(
        `El producto "${item?.nombre || productoId}" ya no está en la carta.`
      );
    }
    if (
      !producto.activo ||
      (producto.categoria_id && !categoriasPermitidas.has(Number(producto.categoria_id)))
    ) {
      throw new PrecioInvalidoError(`"${producto.nombre}" no está disponible en este momento.`);
    }

    const precioBase = Number(producto.precio || 0);
    const conListas = mezclarListas(
      producto.variantes,
      producto.extras,
      listasDelPedido.get(productoId)
    );
    const extraVariantes = recargoDeVariantes(
      item.variantes,
      parsearJson(conListas.variantes, []),
      producto.nombre
    );
    const extraAdicionales = recargoDeExtras(
      item.extras,
      parsearJson(conListas.extras, []),
      producto.nombre
    );

    const precioUnitario = precioBase + extraVariantes + extraAdicionales;
    const cantidad = Math.max(0, Number(item.cantidad || 0));
    const bruto = precioUnitario * cantidad;
    const descuentoItem = permitirDescuentoItems
      ? Math.min(Math.max(0, Number(item.descuento_item || 0)), bruto)
      : 0;
    const beneficioPremium =
      Number(producto.precio || 0) === 900000 &&
      /incluye postre y bebida/i.test(String(producto.descripcion || ''));
    const descripcionActual = String(item.descripcion || '').trim();
    const descripcion =
      beneficioPremium && !/incluye bebida y postre/i.test(descripcionActual)
        ? [descripcionActual, 'INCLUYE BEBIDA Y POSTRE'].filter(Boolean).join(' | ')
        : descripcionActual;

    return {
      ...item,
      // El nombre también se toma de la base: si el cliente lo cambió, en la
      // comanda de cocina tiene que aparecer el producto real.
      nombre: producto.nombre,
      precio_unitario: precioUnitario,
      descuento_item: descuentoItem,
      subtotal: bruto - descuentoItem,
      descripcion,
    };
  });
}

module.exports = { recalcularPreciosPublicos, PrecioInvalidoError };
