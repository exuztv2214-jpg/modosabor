/**
 * Listas de opciones compartidas entre platos.
 *
 * ── El problema que resuelve ───────────────────────────────────────────────
 *
 * Las guarniciones, las salsas y los agregados vivían adentro del JSON de cada
 * producto. Con el tiempo eso se despega solo, y en la base de Modo Sabor ya
 * había pasado:
 *
 *   - Los cuatro agregados de hamburguesa (queso extra, medallón, papas,
 *     huevo) estaban cargados idénticos en dieciséis platos. Subirle $200 al
 *     queso eran dieciséis ediciones, y alcanzaba con olvidarse de una para
 *     vender a dos precios distintos el mismo agregado.
 *
 *   - De los tres menús ejecutivos que llevan la misma guarnición, uno tenía
 *     siete opciones y los otros dos seis.
 *
 *   - Tres menús se habían quedado sin ninguna guarnición cargada.
 *
 * Ahora la lista se carga una vez y se le asigna a los platos que la llevan.
 *
 * ── Cómo se enchufa sin romper nada ────────────────────────────────────────
 *
 * Esta es la decisión importante. En vez de cambiar la forma en que el TPV, la
 * web pública, la app del rider y `preciosServidor` leen un producto —que son
 * más de veinte archivos—, las listas asignadas se **mezclan adentro de
 * `variantes` y `extras` al leer**. Río abajo nadie se entera: siguen viendo
 * el mismo JSON de siempre, sólo que ahora con los grupos compartidos al lado
 * de los propios.
 *
 * Eso también hace que los pedidos ya cerrados se sigan leyendo igual, porque
 * guardan el nombre de la opción como texto y no un id que haya que resolver.
 *
 * ── Quién gana si se repiten ───────────────────────────────────────────────
 *
 * Lo que está cargado a mano en el plato. Si un producto ya tiene un grupo
 * "Guarnición" propio, la lista compartida con ese nombre no se agrega, y
 * dentro de un grupo tampoco se duplica una opción que ya exista.
 *
 * Es a propósito y en esa dirección: mientras se van pasando los platos a las
 * listas nuevas, un plato a medio migrar tiene que seguir cobrando bien. El
 * riesgo del otro orden es cobrar dos veces el mismo agregado.
 *
 * ── Unidades ───────────────────────────────────────────────────────────────
 *
 * `opcion_items.precio` está en centavos, igual que `productos.precio`. Se
 * mezcla tal cual, sin convertir: quien lee después ya sabe que ese JSON viene
 * en centavos (`JSON_MONEY_COLUMNS` en moneyConversion.js).
 */

function textoNormalizado(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function parsearLista(valor) {
  if (Array.isArray(valor)) return valor;
  if (typeof valor !== 'string' || valor.trim() === '') return [];
  try {
    const parsed = JSON.parse(valor);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Trae las listas asignadas a un conjunto de productos, en una sola consulta.
 *
 * Se hace en dos consultas y no en una por producto porque la carta del TPV
 * son setenta y pico de platos: una consulta por plato son setenta viajes a la
 * base cada vez que alguien abre la pantalla.
 *
 * @returns {Map<number, Array>} productoId → listas, cada una con sus opciones.
 */
function listasPorProducto(db, productoIds) {
  const ids = [...new Set((productoIds || []).map(Number).filter(Boolean))];
  const porProducto = new Map();
  if (ids.length === 0) return porProducto;

  const marcadores = ids.map(() => '?').join(',');
  const asignaciones = db
    .prepare(
      `SELECT pol.producto_id, l.id, l.nombre, l.tipo, l.obligatorio, pol.orden
         FROM producto_opcion_listas pol
         JOIN opcion_listas l ON l.id = pol.lista_id
        WHERE pol.producto_id IN (${marcadores})
          AND l.activo = 1
        ORDER BY pol.orden ASC, l.orden ASC, l.id ASC`
    )
    .all(...ids);

  if (asignaciones.length === 0) return porProducto;

  const listaIds = [...new Set(asignaciones.map((a) => a.id))];
  const opciones = db
    .prepare(
      `SELECT lista_id, nombre, precio
         FROM opcion_items
        WHERE lista_id IN (${listaIds.map(() => '?').join(',')})
          AND activo = 1
        ORDER BY orden ASC, id ASC`
    )
    .all(...listaIds);

  const opcionesPorLista = new Map();
  for (const opcion of opciones) {
    if (!opcionesPorLista.has(opcion.lista_id)) opcionesPorLista.set(opcion.lista_id, []);
    opcionesPorLista.get(opcion.lista_id).push(opcion);
  }

  for (const asignacion of asignaciones) {
    if (!porProducto.has(asignacion.producto_id)) porProducto.set(asignacion.producto_id, []);
    porProducto.get(asignacion.producto_id).push({
      ...asignacion,
      opciones: opcionesPorLista.get(asignacion.id) || [],
    });
  }

  return porProducto;
}

/**
 * Mezcla las listas adentro de las variantes y los extras de un producto.
 *
 * Devuelve las dos como texto JSON, que es la forma en que salen de la base y
 * la que espera el conversor de plata.
 */
function mezclarListas(variantesCrudas, extrasCrudos, listas) {
  const variantes = parsearLista(variantesCrudas);
  const extras = parsearLista(extrasCrudos);
  if (!listas || listas.length === 0) {
    return { variantes: JSON.stringify(variantes), extras: JSON.stringify(extras) };
  }

  const gruposPropios = new Set(variantes.map((g) => textoNormalizado(g?.nombre)));
  const extrasPropios = new Set(extras.map((e) => textoNormalizado(e?.nombre)));

  for (const lista of listas) {
    // Una lista sin opciones cargadas no aporta nada y dejaría un grupo vacío
    // en pantalla, que en el TPV es un grupo que nunca se puede completar.
    if (!lista.opciones || lista.opciones.length === 0) continue;

    /*
      `lista_id` marca lo que vino de una lista compartida y no está guardado
      en el producto.

      No es decorativo. El formulario de Productos carga `variantes` y `extras`
      desde la API y los vuelve a escribir al guardar: sin esta marca, abrir un
      plato y apretar Guardar le copiaría la lista compartida adentro, para
      siempre y sin avisar. A los pocos días cada plato tendría otra vez su
      propia copia y todo esto no habría servido de nada.

      El formulario las filtra por este campo antes de cargarlas al editor.
    */
    if (lista.tipo === 'extra') {
      for (const opcion of lista.opciones) {
        if (extrasPropios.has(textoNormalizado(opcion.nombre))) continue;
        extrasPropios.add(textoNormalizado(opcion.nombre));
        extras.push({
          nombre: opcion.nombre,
          precio: Number(opcion.precio || 0),
          lista_id: lista.id,
        });
      }
      continue;
    }

    if (gruposPropios.has(textoNormalizado(lista.nombre))) continue;
    gruposPropios.add(textoNormalizado(lista.nombre));
    variantes.push({
      nombre: lista.nombre,
      obligatorio: Number(lista.obligatorio) === 1 ? 1 : 0,
      lista_id: lista.id,
      opciones: lista.opciones.map((opcion) => ({
        nombre: opcion.nombre,
        precio_extra: Number(opcion.precio || 0),
      })),
    });
  }

  return { variantes: JSON.stringify(variantes), extras: JSON.stringify(extras) };
}

/**
 * Devuelve los productos con las listas compartidas ya mezcladas.
 *
 * Es la única función que llaman las rutas. No modifica los objetos que
 * recibe: devuelve copias, porque en varios lugares la misma fila se reusa.
 */
function aplicarListasCompartidas(db, productos) {
  const lista = Array.isArray(productos) ? productos : [];
  if (lista.length === 0) return lista;

  const porProducto = listasPorProducto(
    db,
    lista.map((p) => p?.id)
  );
  if (porProducto.size === 0) return lista;

  return lista.map((producto) => {
    const listas = porProducto.get(Number(producto?.id));
    if (!listas || listas.length === 0) return producto;
    const { variantes, extras } = mezclarListas(producto.variantes, producto.extras, listas);
    return { ...producto, variantes, extras };
  });
}

/**
 * El nombre de la lista de guarniciones.
 *
 * El menú del día la busca por nombre y no por id porque el id lo decide la
 * base la primera vez que se crea, y no hay forma de saberlo de antemano.
 */
const LISTA_GUARNICIONES = 'Guarniciones';

/** Busca una lista por nombre, sin distinguir tildes ni mayúsculas. */
function buscarListaPorNombre(db, nombre) {
  const todas = db.prepare('SELECT * FROM opcion_listas').all();
  const buscado = textoNormalizado(nombre);
  return todas.find((lista) => textoNormalizado(lista.nombre) === buscado) || null;
}

/**
 * Devuelve los nombres de las opciones de una lista, en orden.
 *
 * Es lo que necesita el menú del día, que trabaja con nombres sueltos porque
 * sus guarniciones nunca tienen recargo.
 */
function nombresDeLista(db, nombre) {
  const lista = buscarListaPorNombre(db, nombre);
  if (!lista) return null;
  return db
    .prepare(
      'SELECT nombre FROM opcion_items WHERE lista_id = ? AND activo = 1 ORDER BY orden ASC, id ASC'
    )
    .all(lista.id)
    .map((fila) => fila.nombre);
}

/**
 * Escribe la lista de nombres, creándola si no existe.
 *
 * Conserva el precio de las opciones que ya estaban: el menú del día manda
 * sólo nombres, y si esto las reescribiera desde cero, una guarnición que
 * alguien hubiera puesto con recargo desde la pantalla de listas volvería a
 * cero sin que nadie lo pida.
 */
function guardarNombresDeLista(db, nombre, nombres, opciones = {}) {
  /*
    Gana la primera forma en que se escribió.

    Con un Map por clave normalizada ganaba la última, así que cargar
    "Papas" y más abajo "  PAPAS  " dejaba la lista mostrando PAPAS a los
    gritos. Se ve mal en la carta y en la comanda, y nadie entiende por qué
    cambió sola.
  */
  const vistas = new Set();
  const limpios = (Array.isArray(nombres) ? nombres : [])
    .map((valor) => String(valor || '').trim())
    .filter((valor) => {
      if (!valor) return false;
      const clave = textoNormalizado(valor);
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    });

  let lista = buscarListaPorNombre(db, nombre);
  if (!lista) {
    const { lastInsertRowid } = db
      .prepare(
        'INSERT INTO opcion_listas (nombre, tipo, obligatorio, orden, activo) VALUES (?, ?, ?, 0, 1)'
      )
      .run(nombre, opciones.tipo || 'variante', Number(opciones.obligatorio) === 1 ? 1 : 0);
    lista = { id: Number(lastInsertRowid), nombre };
  }

  const preciosPrevios = new Map(
    db
      .prepare('SELECT nombre, precio FROM opcion_items WHERE lista_id = ?')
      .all(lista.id)
      .map((fila) => [textoNormalizado(fila.nombre), fila.precio])
  );

  const escribir = db.transaction(() => {
    db.prepare('DELETE FROM opcion_items WHERE lista_id = ?').run(lista.id);
    const insertar = db.prepare(
      'INSERT INTO opcion_items (lista_id, nombre, precio, orden, activo) VALUES (?, ?, ?, ?, 1)'
    );
    limpios.forEach((valor, indice) => {
      insertar.run(lista.id, valor, preciosPrevios.get(textoNormalizado(valor)) || 0, indice);
    });
  });
  escribir();

  return { id: lista.id, nombres: limpios };
}

module.exports = {
  aplicarListasCompartidas,
  buscarListaPorNombre,
  guardarNombresDeLista,
  LISTA_GUARNICIONES,
  listasPorProducto,
  mezclarListas,
  nombresDeLista,
  textoNormalizado,
};
