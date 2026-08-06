const db = require('../db');

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
  if (!variantesElegidas || typeof variantesElegidas !== 'object') return 0;
  const grupos = Array.isArray(definicion) ? definicion : [];
  let recargo = 0;

  for (const [grupoElegido, opcionElegida] of Object.entries(variantesElegidas)) {
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
 * @returns {Array} Los mismos ítems con `precio_unitario` y `subtotal` reales.
 * @throws {PrecioInvalidoError} Si un producto no existe, está inactivo, o trae
 *         una variante o un adicional que no le corresponde.
 */
function recalcularPreciosPublicos(items) {
  const lista = Array.isArray(items) ? items : [];
  if (!lista.length) return lista;

  const buscarProducto = db.prepare(
    'SELECT id, nombre, precio, activo, variantes, extras FROM productos WHERE id = ?'
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

    const producto = buscarProducto.get(productoId);
    if (!producto) {
      throw new PrecioInvalidoError(
        `El producto "${item?.nombre || productoId}" ya no está en la carta.`
      );
    }
    if (!producto.activo) {
      throw new PrecioInvalidoError(`"${producto.nombre}" no está disponible en este momento.`);
    }

    const precioBase = Number(producto.precio || 0);
    const extraVariantes = recargoDeVariantes(
      item.variantes,
      parsearJson(producto.variantes, []),
      producto.nombre
    );
    const extraAdicionales = recargoDeExtras(
      item.extras,
      parsearJson(producto.extras, []),
      producto.nombre
    );

    const precioUnitario = precioBase + extraVariantes + extraAdicionales;
    const cantidad = Math.max(0, Number(item.cantidad || 0));

    return {
      ...item,
      // El nombre también se toma de la base: si el cliente lo cambió, en la
      // comanda de cocina tiene que aparecer el producto real.
      nombre: producto.nombre,
      precio_unitario: precioUnitario,
      subtotal: precioUnitario * cantidad,
    };
  });
}

module.exports = { recalcularPreciosPublicos, PrecioInvalidoError };
